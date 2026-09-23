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
  type CatalogItemKind,
  type CatalogRecord,
  type CatalogSection,
  type CategoryKind,
  type ImportErrorKind,
  type ImportRunRecord,
  type ImportStep,
  type ProviderImportMode,
  type SourceRecord,
} from './db'
import {
  allocateGeneration,
  discardGeneration,
  markCategoryFetched,
  publishGeneration,
  storeBatch,
  storeCategories,
  StorageFullError,
  type NewCategory,
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
  classifyWithGroupOrder,
  fetchLiveCategories,
  fetchSeriesCategories,
  fetchVodCategories,
  legacyM3uUrl,
  parseXtreamStreamUrl,
  ProviderError,
  ProviderIncompatibleError,
  probeFailureKind,
  resolveAccountStatus,
  type LiveCategory,
  type MappedChannel,
} from './xtreamConnector'

/**
 * Tamanho do lote de gravação: grande o bastante para amortizar o custo da
 * transação, pequeno o bastante para o cancelamento responder rápido e para
 * o laço devolver o controle ao desenho da tela (SC-005).
 */
const DEFAULT_BATCH_SIZE = 2500

/**
 * De quanto em quanto tempo uma execução em andamento diz que está viva, e
 * a partir de quando o silêncio significa que ninguém a está conduzindo.
 *
 * A folga entre os dois é grande de propósito: matar uma importação viva
 * por engano descartaria a geração em escrita. O batimento é escrito por um
 * temporizador próprio, não pelo progresso, justamente porque a etapa de
 * obtenção pode passar minutos sem nenhum lote para relatar.
 */
const HEARTBEAT_INTERVAL_MS = 5_000
export const ABANDONED_AFTER_MS = 60_000

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

function isAbandoned(run: ImportRunRecord, now: number): boolean {
  return run.status === 'running' && now - (run.heartbeatAt ?? run.startedAt) > ABANDONED_AFTER_MS
}

/**
 * Fecha uma execução que ficou em `running` sem ninguém conduzindo.
 *
 * Acontece quando o app é fechado no meio da importação: o registro fica
 * para trás e, sem isto, `activeRunFor` continua achando uma execução
 * "ativa" para sempre — a fonte nunca mais aceita ser sincronizada. O
 * desfecho é `failed` com categoria própria, não `cancelled`: ninguém
 * cancelou nada, e dizer que cancelou seria contar uma história que não
 * aconteceu.
 */
async function closeAbandoned(
  run: ImportRunRecord,
  database: CatalogDb,
  at: number,
): Promise<ImportRunRecord> {
  const closed: ImportRunRecord = {
    ...run,
    status: 'failed',
    errorKind: 'interrupted',
    finishedAt: at,
  }
  await database.importRuns.put(closed)
  await discardGeneration(run.sourceId, run.generation, database).catch(() => {
    // A geração pode ter sido publicada ou nem ter recebido linha — em
    // nenhum dos casos há o que limpar aqui.
  })
  return closed
}

/**
 * Reconcilia uma execução específica, se ela estiver órfã. Devolve o
 * registro como ele ficou — inclusive intocado, quando a execução está de
 * fato viva.
 */
export async function reconcileRun(
  runId: string,
  database: CatalogDb = db,
  now: number = Date.now(),
): Promise<ImportRunRecord | undefined> {
  const run = await database.importRuns.get(runId)
  if (!run || !isAbandoned(run, now)) return run
  return closeAbandoned(run, database, now)
}

/**
 * Recupera a identidade que a URL do modo limitado carrega.
 *
 * Fonte de provedor não guarda URL (data-model §4) — a credencial ficaria
 * copiada em milhares de registros. Só que no caminho legado a entrada do
 * M3U **é** só a URL pronta, e sem isto o item nasce sem identificador
 * nenhum: "Modo limitado" viraria um catálogo que se vê e não se abre.
 *
 * O segmento de tipo (`/live/`, `/movie/`, `/series/`) é o próprio painel
 * declarando o que o item é — mais confiável que a heurística de nome e
 * grupo do classificador, e é ele quem decide o caminho da URL na hora de
 * reproduzir.
 */
function refineFromUrl(channel: MappedChannel): MappedChannel {
  const derived = channel.url ? parseXtreamStreamUrl(channel.url) : undefined
  if (!derived) return channel
  return {
    ...channel,
    kind: derived.kind === 'live' ? 'channel' : derived.kind,
    providerStreamId: channel.providerStreamId ?? derived.streamId,
    streamExtension: channel.streamExtension ?? derived.extension,
  }
}

function toRecord(
  channel: MappedChannel,
  sourceId: string,
  generation: number,
  keepUrl: boolean,
  categoryId: number | undefined,
): CatalogRecord {
  return {
    sourceId,
    generation,
    kind: channel.kind,
    name: channel.name,
    originalName: channel.originalName,
    group: channel.group,
    groupOrder: channel.groupOrder,
    categoryId,
    providerStreamId: channel.providerStreamId,
    providerCategoryId: channel.providerCategoryId,
    seriesId: channel.seriesId,
    seasonNumber: channel.seasonNumber,
    episodeNumber: channel.episodeNumber,
    streamExtension: channel.streamExtension,
    directUrl: keepUrl ? channel.url : undefined,
  }
}

/** As três seções que viram categoria navegável. Episódio e não classificado não têm uma. */
function categoryKindOf(kind: CatalogItemKind): CategoryKind | undefined {
  return kind === 'channel' || kind === 'movie' || kind === 'series' ? kind : undefined
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
  const active = await activeRunFor(sourceId, database)
  if (active) {
    // Uma execução que parou de dar sinal de vida não é uma importação em
    // andamento — é o rastro de um app fechado no meio. Recusar por causa
    // dela trancaria a fonte para sempre.
    if (!isAbandoned(active, now())) throw new ImportAlreadyRunningError()
    await closeAbandoned(active, database, now())
  }

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
  run.heartbeatAt = run.startedAt
  // A primeira etapa começa junto com a execução — não há o que esperar
  // antes de começar a obter.
  run.stepStartedAt = { fetching: run.startedAt }
  await database.importRuns.add(run)

  // O batimento é independente do progresso de propósito: a obtenção de uma
  // lista grande passa minutos sem nenhum lote a relatar, e nesse intervalo
  // a execução pareceria órfã para quem só olha os contadores.
  const heartbeat = setInterval(() => {
    run.heartbeatAt = now()
    void database.importRuns.update(run.id, { heartbeatAt: run.heartbeatAt }).catch(() => {
      // Banco fechado ou registro já removido: o batimento é diagnóstico,
      // nunca motivo para derrubar a importação.
    })
  }, HEARTBEAT_INTERVAL_MS)
  // Um progresso imediato, antes de qualquer rede. Sem ele, a tela fica sem
  // nenhuma informação durante todo o download — que numa lista grande são
  // minutos parecendo travamento — e a etapa de obtenção não tem instante
  // inicial para ser medida contra.
  options.onProgress?.({ ...run })

  let cancelled = false

  async function persist(): Promise<void> {
    run.heartbeatAt = now()
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

    async function accept(channel: MappedChannel, categoryId: number | undefined): Promise<void> {
      run.entriesRead += 1
      if (channel.kind === 'unclassified') {
        // D-006/FR-008: classificado e descartado sem tocar o disco. O
        // contador é o que sustenta dizer "não é o catálogo completo da
        // fonte" sem inventar número.
        run.discardedByType += 1
        return
      }
      pendingBatch.push(toRecord(channel, sourceId, generation, keepUrl, categoryId))
      if (pendingBatch.length >= batchSize) {
        await flush()
        if (cancelled) throw new ImportCancelledError()
        await persist()
      }
    }

    async function consumeM3u(url: string, refine = false): Promise<void> {
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
      // índice que o painel entrega explicitamente (FR-002). O mesmo
      // número vira `categories.order` (feature 010) — sem colisão entre
      // kinds diferentes porque a chave da categoria inclui o kind.
      const groupOrders = new Map<string, number>()
      // Categoria já criada nesta importação, por `${kind}|${grupo}` — só
      // canal/filme/série viram categoria navegável (`categoryKindOf`).
      const categoryIdsByKey = new Map<string, number>()
      // Contagem real por categoria, para carimbar no fim (`itemsCount` —
      // só se sabe o total quando o fluxo termina).
      const categoryItemCounts = new Map<number, number>()

      async function categoryIdFor(
        kind: CatalogItemKind,
        group: string | undefined,
      ): Promise<number | undefined> {
        const categoryKind = categoryKindOf(kind)
        if (!categoryKind) return undefined
        const groupName = group ?? ''
        const key = `${categoryKind}|${groupName}`
        const existing = categoryIdsByKey.get(key)
        if (existing !== undefined) return existing

        const [id] = await storeCategories(
          [
            {
              sourceId,
              generation,
              kind: categoryKind,
              fetchMode: 'eager',
              name: group,
              order: groupOrders.get(groupName) ?? Number.MAX_SAFE_INTEGER,
            },
          ],
          database,
        )
        categoryIdsByKey.set(key, id)
        return id
      }

      let sawAny = false
      for await (const entry of parseM3uLines(linesFromResponse(response.body), tally)) {
        if (cancelled) throw new ImportCancelledError()
        sawAny = true
        const classified = classifyWithGroupOrder(entry, groupOrders)
        const refined = refine ? refineFromUrl(classified) : classified
        const categoryId = await categoryIdFor(refined.kind, refined.group)
        if (categoryId !== undefined) {
          categoryItemCounts.set(categoryId, (categoryItemCounts.get(categoryId) ?? 0) + 1)
        }
        await accept(refined, categoryId)
      }
      run.invalidCount = tally.invalidCount
      if (!sawAny) throw new EmptyPlaylistError()

      // Os itens já foram gravados pelo fluxo normal de `storeBatch`
      // acima, em lotes — falta só carimbar quando e quantos, porque o
      // total de cada categoria só se conhece no fim (data-model.md §3).
      for (const [categoryId, count] of categoryItemCounts) {
        await markCategoryFetched(categoryId, now(), count, database)
      }
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

      /**
       * Grava a estrutura de uma seção — nenhum item. É a mudança central
       * da feature 010: a importação de provedor deixa de esperar o
       * catálogo inteiro e conclui assim que as categorias (algumas
       * centenas, no pior caso) estiverem gravadas.
       */
      async function ingestCategories(
        kind: CategoryKind,
        categories: LiveCategory[],
      ): Promise<void> {
        if (cancelled) throw new ImportCancelledError()
        run.entriesRead += categories.length
        await storeCategories(
          categories.map(
            (category): NewCategory => ({
              sourceId,
              generation,
              kind,
              fetchMode: 'on_demand',
              providerCategoryId: category.id,
              name: category.name,
              order: category.order,
              declaredCount: category.declaredCount,
            }),
          ),
          database,
        )
        run.channelsStored += categories.length
      }

      /**
       * Seção que o painel não serve não derruba a importação — mas também
       * não vira lista vazia em silêncio. Só a incompatibilidade é tolerada:
       * credencial recusada e falha de rede continuam subindo, porque são
       * problemas da fonte inteira, não daquela seção.
       */
      async function ingestCategoriesOptional(
        section: CatalogSection,
        kind: CategoryKind,
        fetchCategories: () => Promise<LiveCategory[]>,
      ): Promise<void> {
        let categories: LiveCategory[]
        try {
          categories = await fetchCategories()
        } catch (error) {
          if (!(error instanceof ProviderIncompatibleError)) throw error
          logger.warn(`Painel não serviu a seção ${section}`, error)
          run.unavailableSections = [...(run.unavailableSections ?? []), section]
          return
        }
        await ingestCategories(kind, categories)
        await persist()
      }

      // Contadores desta execução passam a significar categorias, não
      // itens — é o que a tela de progresso relata (FR-013, contrato §3).
      run.unit = 'categories'

      try {
        const liveCategories = await fetchLiveCategories(
          credential.dns,
          credential.username,
          credential.password,
        )
        mode = 'xtream_api'
        enterStep('parsing')
        await persist()

        await ingestCategories('channel', liveCategories)
        await persist()

        await ingestCategoriesOptional('movie', 'movie', () =>
          fetchVodCategories(credential.dns, credential.username, credential.password),
        )
        await ingestCategoriesOptional('series', 'series', () =>
          fetchSeriesCategories(credential.dns, credential.username, credential.password),
        )
      } catch (error) {
        if (!(error instanceof ProviderIncompatibleError)) throw error
        // O painel não fala o protocolo JSON: cai no caminho M3U legado.
        // É o "modo limitado" — menos informação por item, mas a fonte
        // continua utilizável, e o registro diz por qual caminho veio.
        // Volta a contar itens — o caminho integral não tem estrutura
        // pronta de antemão para contar.
        run.unit = 'items'
        mode = 'legacy_m3u'
        await consumeM3u(
          legacyM3uUrl(credential.dns, credential.username, credential.password),
          true,
        )
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
    .finally(() => {
      // Terminada a execução, o batimento não tem mais o que anunciar — e um
      // temporizador vivo escreveria num banco que já pode ter sido fechado.
      clearInterval(heartbeat)
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
