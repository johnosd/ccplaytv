import { logger } from '../logger';
/**
 * Importação local, ponta a ponta (`contracts/local-storage.md` §3).
 *
 * Obtém em fluxo, classifica, descarta o que não é canal, grava em lotes
 * numa geração nova e publica ao concluir (D-002/D-004/D-006). É o que o
 * backend fazia em `api/app/services/importer.py`, agora no aparelho.
 *
 * Três invariantes valem em todos os caminhos daqui:
 *
 * - **A geração ativa nunca é tocada antes da publicação.** Uma importação
 *   que falha no meio, ou que a pessoa cancela, deixa o catálogo anterior
 *   exatamente como estava.
 * - **Erro sai como categoria, nunca como mensagem de rede.** A mensagem
 *   crua carrega a URL completa, com credencial — a mesma armadilha que o
 *   backend evita ao não interpolar o erro do cliente HTTP.
 * - **Contadores são reais.** Sem denominador confiável não há percentual:
 *   a fonte não declara de antemão quantas entradas vai mandar.
 */

import {
  db,
  type CatalogDb,
  type CatalogRecord,
  type ImportErrorKind,
  type ImportRunRecord,
  type ImportStep,
  type ProviderImportMode,
  type SourceRecord,
} from './db'
import {
  allocateGeneration,
  discardGeneration,
  publishGeneration,
  storeBatch,
  StorageFullError,
} from './catalogRepository'
import { markConnectionError, markSynced, readCredential } from './sourceRepository'
import {
  EmptyPlaylistError,
  HlsManifestDetectedError,
  InvalidPlaylistError,
  linesFromResponse,
  parseM3uLines,
  type ParseTally,
} from './m3uParser'
import {
  acquireXtreamChannels,
  acquireXtreamVod,
  acquireXtreamSeries,
  classifyWithGroupOrder,
  legacyM3uUrl,
  ProviderError,
  ProviderIncompatibleError,
  probeFailureKind,
  resolveAccountStatus,
  type MappedChannel,
} from './xtreamConnector'

/**
 * Tamanho do lote de gravação: grande o bastante para amortizar o custo da
 * transação, pequeno o bastante para o cancelamento responder rápido e para
 * o laço devolver o controle ao desenho da tela (SC-005).
 */
const DEFAULT_BATCH_SIZE = 2500

export class ImportAlreadyRunningError extends Error {
  constructor() {
    super('Já existe uma importação em andamento para esta fonte.')
    this.name = 'ImportAlreadyRunningError'
  }
}

export class ImportCancelledError extends Error {
  constructor() {
    super('Importação cancelada.')
    this.name = 'ImportCancelledError'
  }
}

export interface ImportOptions {
  onProgress?: (snapshot: ImportRunRecord) => void
  batchSize?: number
  database?: CatalogDb
  now?: () => number
}

export interface ImportHandle {
  runId: string
  /** Cooperativo: a próxima fronteira de lote para e descarta a geração em escrita. */
  cancel: () => void
  completion: Promise<ImportRunRecord>
}

/**
 * Traduz a falha para uma das categorias de FR-011/FR-019.
 *
 * Erro que não couber em nenhuma delas **não** vira "falha de rede" por
 * conveniência: devolve `undefined`, e quem chamou o deixa subir. Esconder
 * um defeito nosso atrás de uma explicação plausível faria a pessoa tentar
 * consertar a internet dela.
 */
function categorize(error: unknown): ImportErrorKind | undefined {
  if (error instanceof ProviderError) return error.kind
  if (error instanceof HlsManifestDetectedError) return 'hls_manifest'
  if (error instanceof EmptyPlaylistError) return 'empty_playlist'
  // Painel que não fala o protocolo e lista ilegível são a mesma coisa para
  // quem está olhando: o que veio não dá para usar como catálogo.
  if (error instanceof InvalidPlaylistError) return 'invalid_playlist'
  if (error instanceof ProviderIncompatibleError) return 'invalid_playlist'
  return undefined
}

async function activeRunFor(
  sourceId: string,
  database: CatalogDb,
): Promise<ImportRunRecord | undefined> {
  return database.importRuns.where('[sourceId+status]').equals([sourceId, 'running']).first()
}

function toRecord(
  channel: MappedChannel,
  sourceId: string,
  generation: number,
  keepUrl: boolean,
): CatalogRecord {
  return {
    sourceId,
    generation,
    kind: channel.kind,
    name: channel.name,
    originalName: channel.originalName,
    group: channel.group,
    groupOrder: channel.groupOrder,
    providerStreamId: channel.providerStreamId,
    providerCategoryId: channel.providerCategoryId,
    seriesId: channel.seriesId,
    seasonNumber: channel.seasonNumber,
    episodeNumber: channel.episodeNumber,
    streamExtension: channel.streamExtension,
    directUrl: keepUrl ? channel.url : undefined,
  }
}

export async function startImport(
  sourceId: string,
  options: ImportOptions = {},
): Promise<ImportHandle> {
  const database = options.database ?? db
  const now = options.now ?? (() => Date.now())
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE

  const source: SourceRecord | undefined = await database.sources.get(sourceId)
  if (!source) throw new Error('Fonte não encontrada.')
  // FR-017: a checagem vem antes de alocar geração, para a segunda
  // tentativa não consumir número nem deixar lixo para trás.
  if (await activeRunFor(sourceId, database)) throw new ImportAlreadyRunningError()

  const generation = await allocateGeneration(sourceId, database)
  const run: ImportRunRecord = {
    id: `run-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    generation,
    status: 'running',
    step: 'fetching',
    entriesRead: 0,
    channelsStored: 0,
    discardedByType: 0,
    invalidCount: 0,
    truncatedByStorage: false,
    startedAt: now(),
  }
  // A primeira etapa começa junto com a execução — não há o que esperar
  // antes de começar a obter.
  run.stepStartedAt = { fetching: run.startedAt }
  await database.importRuns.add(run)
  // Um progresso imediato, antes de qualquer rede. Sem ele, a tela fica sem
  // nenhuma informação durante todo o download — que numa lista grande são
  // minutos parecendo travamento — e a etapa de obtenção não tem instante
  // inicial para ser medida contra.
  options.onProgress?.({ ...run })

  let cancelled = false

  async function persist(): Promise<void> {
    const { id, ...changes } = run
    await database.importRuns.update(id, changes)
    options.onProgress?.({ ...run })
  }

  /** Muda a etapa e carimba o instante aqui, onde ela de fato começa. */
  function enterStep(step: ImportStep): void {
    run.step = step
    run.stepStartedAt = { ...run.stepStartedAt, [step]: now() }
  }

  async function execute(): Promise<void> {
    let pendingBatch: CatalogRecord[] = []
    const keepUrl = source!.type === 'm3u_url'

    async function flush(): Promise<void> {
      if (pendingBatch.length === 0) return
      const batch = pendingBatch
      pendingBatch = []
      try {
        await storeBatch(batch, database)
        run.channelsStored += batch.length
      } catch (error) {
        // FR-018: o que já entrou continua utilizável; o que não coube fica
        // declarado. Quem trata o erro decide o que fazer com a geração.
        if (error instanceof StorageFullError) run.truncatedByStorage = true
        throw error
      }
    }

    async function accept(channel: MappedChannel): Promise<void> {
      run.entriesRead += 1
      if (channel.kind === 'unclassified') {
        // D-006/FR-008: classificado e descartado sem tocar o disco. O
        // contador é o que sustenta dizer "não é o catálogo completo da
        // fonte" sem inventar número.
        run.discardedByType += 1
        return
      }
      pendingBatch.push(toRecord(channel, sourceId, generation, keepUrl))
      if (pendingBatch.length >= batchSize) {
        await flush()
        if (cancelled) throw new ImportCancelledError()
        await persist()
      }
    }

    async function consumeM3u(url: string): Promise<void> {
      let response: Response
      try {
        response = await fetch(url)
      } catch {
        throw new ProviderError(await probeFailureKind(url), 'Não foi possível baixar a lista.')
      }
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError('invalid_credentials', 'O provedor recusou as credenciais.')
      }
      if (!response.ok || !response.body) {
        throw new InvalidPlaylistError(`Provedor respondeu com status ${response.status}.`)
      }

      enterStep('parsing')
      await persist()

      const tally: ParseTally = { invalidCount: 0 }
      // A ordem de aparição do grupo é o que, no caminho M3U, substitui o
      // índice que o painel entrega explicitamente (FR-002).
      const groupOrders = new Map<string, number>()
      let sawAny = false
      for await (const entry of parseM3uLines(linesFromResponse(response.body), tally)) {
        if (cancelled) throw new ImportCancelledError()
        sawAny = true
        await accept(classifyWithGroupOrder(entry, groupOrders))
      }
      run.invalidCount = tally.invalidCount
      if (!sawAny) throw new EmptyPlaylistError()
    }

    let mode: ProviderImportMode | undefined
    let allowedFormats: string[] | undefined

    if (source!.type === 'provider_credentials') {
      const credential = await readCredential(sourceId, database)
      if (!credential) throw new ProviderError('invalid_credentials', 'Fonte sem credencial.')

      const status = await resolveAccountStatus(
        credential.dns,
        credential.username,
        credential.password,
      )
      if (status.expired) throw new ProviderError('subscription_expired', 'Assinatura expirada.')
      if (!status.authorized) throw new ProviderError('invalid_credentials', 'Acesso negado.')
      allowedFormats = status.allowedFormats

      try {
        const resultPromise = acquireXtreamChannels(
          credential.dns,
          credential.username,
          credential.password,
          status,
        )
        const vodsPromise = acquireXtreamVod(credential.dns, credential.username, credential.password).catch((e) => {
          logger.warn('Erro isolado ao importar VOD via painel', e)
          return []
        })
        const seriesPromise = acquireXtreamSeries(credential.dns, credential.username, credential.password).catch((e) => {
          logger.warn('Erro isolado ao importar series via painel', e)
          return []
        })

        const [result, vods, series] = await Promise.all([resultPromise, vodsPromise, seriesPromise])
        mode = 'xtream_api'
        enterStep('parsing')
        await persist()

        for (const channel of result.channels) {
          if (cancelled) throw new ImportCancelledError()
          await accept(channel)
        }
        for (const vod of vods) {
          if (cancelled) throw new ImportCancelledError()
          await accept(vod)
        }
        for (const s of series) {
          if (cancelled) throw new ImportCancelledError()
          await accept(s)
        }
      } catch (error) {
        if (!(error instanceof ProviderIncompatibleError)) throw error
        // O painel não fala o protocolo JSON: cai no caminho M3U legado.
        // É o "modo limitado" — menos informação por item, mas a fonte
        // continua utilizável, e o registro diz por qual caminho veio.
        mode = 'legacy_m3u'
        await consumeM3u(legacyM3uUrl(credential.dns, credential.username, credential.password))
      }
    } else {
      await consumeM3u(source!.m3uUrl as string)
    }

    enterStep('storing')
    await persist()
    await flush()
    if (cancelled) throw new ImportCancelledError()

    await publishGeneration(sourceId, generation, database)
    await markSynced(sourceId, { 
      at: now(), 
      mode, 
      allowedFormats,
      truncatedByStorage: run.truncatedByStorage,
      discardedByType: run.discardedByType
    }, database)

    run.status = 'completed'
    enterStep('done')
    run.finishedAt = now()
    await persist()
  }

  async function fail(error: unknown): Promise<void> {
    if (error instanceof ImportCancelledError) {
      run.status = 'cancelled'
      await discardSilently()
      return
    }

    if (error instanceof StorageFullError && run.channelsStored > 0) {
      // Espaço acabou com parte do catálogo já gravada: publica o que coube,
      // com a truncagem declarada. Descartar aqui deixaria a pessoa sem
      // catálogo nenhum justamente por falta de espaço (FR-018).
      await publishGeneration(sourceId, generation, database)
      await markSynced(sourceId, { 
        at: now(),
        truncatedByStorage: run.truncatedByStorage,
        discardedByType: run.discardedByType
      }, database)
      run.status = 'completed'
      enterStep('done')
      return
    }

    await discardSilently()
    run.status = 'failed'
    // Truncagem sem nada gravado não é erro de rede nem de lista: fica
    // registrada só pelo indicador de truncagem, que é o que a tela mostra.
    run.errorKind = error instanceof StorageFullError ? undefined : categorize(error)
    await markConnectionError(sourceId, database)

    if (!(error instanceof StorageFullError) && run.errorKind === undefined) {
      run.finishedAt = now()
      await persist()
      throw error
    }
  }

  async function discardSilently(): Promise<void> {
    await discardGeneration(sourceId, generation, database).catch(() => {
      // A geração pode nem ter recebido linha. Um descarte sem efeito não
      // pode mascarar o erro real que trouxe até aqui.
    })
  }

  const completion = execute()
    .catch(async (error: unknown) => {
      await fail(error)
    })
    .then(async () => {
      if (run.finishedAt === undefined) {
        run.finishedAt = now()
        await persist()
      }
      return { ...run }
    })

  return {
    runId: run.id,
    cancel: () => {
      cancelled = true
    },
    completion,
  }
}

/** O que a tela de progresso consome (`contracts/local-storage.md` §3). */
export async function getRun(
  runId: string,
  database: CatalogDb = db,
): Promise<ImportRunRecord | undefined> {
  return database.importRuns.get(runId)
}
