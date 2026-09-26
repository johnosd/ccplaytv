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
  type CatalogSection,
  type CategoryKind,
  type ImportErrorKind,
  type ImportRunRecord,
  type ImportStep,
  type LimitedReason,
  type ProviderImportMode,
  type SourceRecord,
  type StoredCatalogRecord,
} from './db'
import {
  allocateGeneration,
  discardGeneration,
  publishGeneration,
  setDeclaredCount,
  storeCategories,
  StorageFullError,
  type NewCategory,
} from './catalogRepository'
import { storeEntryChunks } from './storedEntries'
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
  type AccountStatus,
  type LiveCategory,
  type MappedChannel,
} from './xtreamConnector'
import { createSeriesGrouper } from './m3uSeriesGrouping'
import { parsePanelUrl, type PanelCredential } from './m3uPanelUrl'

/**
 * Quantos registros ficam em buffer, por varredura M3U, antes de virarem
 * blocos de `storedEntries` (feature 014, D-005 do `plan.md`) — grande o
 * bastante para amortizar o custo da transação, pequeno o bastante para o
 * cancelamento responder rápido e para o laço devolver o controle ao
 * desenho da tela (SC-005 da feature 005).
 */
const DEFAULT_BATCH_SIZE = 5_000

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
/**
 * Segmento de URL → tipo do item, na mesma escala de confiança de
 * `parseXtreamStreamUrl`: o painel declarando o caminho é mais confiável
 * que a heurística de nome/grupo do classificador.
 *
 * `/series/` identifica o STREAM DE UM EPISÓDIO (D-012, feature 012) — não
 * a série em si, que é agrupador. Antes desta correção, cada arquivo nesse
 * caminho virava um cartão de série sem reprodução (achado R-004: Modo
 * limitado grava cada `/series/` como `kind:'series'`).
 */
function kindFromUrlSegment(derived: { kind: 'live' | 'movie' | 'series' }): CatalogItemKind {
  if (derived.kind === 'live') return 'channel'
  if (derived.kind === 'series') return 'episode'
  return derived.kind
}

function refineFromUrl(channel: MappedChannel): MappedChannel {
  const derived = channel.url ? parseXtreamStreamUrl(channel.url) : undefined
  if (!derived) return channel
  return {
    ...channel,
    kind: kindFromUrlSegment(derived),
    providerStreamId: channel.providerStreamId ?? derived.streamId,
    streamExtension: channel.streamExtension ?? derived.extension,
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
  // Fora de `execute()`, de propósito: `fail()` (o caminho de publicação
  // parcial por falta de espaço) precisa do mesmo `mode`/`limitedReason`
  // para não apagar por engano o Modo limitado já registrado de uma fonte
  // de provedor (feature 014, T007) — antes, essas variáveis eram locais
  // de `execute()` e `fail()` simplesmente não tinha como vê-las.
  let mode: ProviderImportMode | undefined
  let allowedFormats: string[] | undefined
  let limitedReason: LimitedReason | undefined

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
    /**
     * Varre um M3U e guarda o conteúdo já classificado e separado por
     * categoria em `storedEntries` — nenhum item vai para `channels`
     * durante a importação (feature 014, D-004). Substitui o antigo
     * `consumeM3u` (gravava tudo em `channels` de uma vez, categoria
     * `eager`) nos quatro pontos que hoje levam ao caminho do conteúdo
     * guardado: URL M3U avulsa, URL M3U de painel não confirmado, Modo
     * limitado de provedor, e painel confirmado que falha ao ler as
     * categorias. `channels`/`storeBatch` deixaram de ser usados aqui —
     * uma fonte M3U só grava `channels` na leitura de categoria
     * (`categoryLoader.ts`), nunca na importação (D-012: `fetchMode:
     * 'eager'` só existe em fonte importada antes desta feature).
     */
    async function scanToStored(url: string, refine = false): Promise<void> {
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

      const keepUrl = source!.type === 'm3u_url'
      const tally: ParseTally = { invalidCount: 0 }
      // A ordem de aparição do grupo é o que, no caminho M3U, substitui o
      // índice que o painel entrega explicitamente (FR-002). O mesmo
      // número vira `categories.order` (feature 010) — sem colisão entre
      // kinds diferentes porque a chave da categoria inclui o kind.
      const groupOrders = new Map<string, number>()
      // Categoria já criada nesta importação, por `${kind}|${grupo}` — só
      // canal/filme/série viram categoria navegável (`categoryKindOf`).
      const categoryIdsByKey = new Map<string, number>()
      // Contagem real por categoria, para gravar como `declaredCount`
      // assim que a varredura termina (D-011) — série conta série, nunca
      // os episódios dela.
      const categoryItemCounts = new Map<number, number>()
      // Agrupa episódios (padrão SxxEyy no título, ou tipo vindo da URL no
      // Modo limitado, D-012) em séries sintéticas (feature 012, D-003).
      // Uma instância por importação — nunca compartilhada entre fontes,
      // ou duas fontes distintas colidiriam na mesma série "m3u:<chave>".
      const seriesGrouper = createSeriesGrouper()

      // Registros ainda não gravados, por categoria — vira um bloco de
      // `storedEntries` por categoria a cada `flush()` (D-005).
      let buffers = new Map<number, StoredCatalogRecord[]>()
      const chunkIndex = new Map<number, number>()
      let buffered = 0

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
              fetchMode: 'stored',
              name: group,
              order: groupOrders.get(groupName) ?? Number.MAX_SAFE_INTEGER,
            },
          ],
          database,
        )
        categoryIdsByKey.set(key, id)
        return id
      }

      function toStoredRecord(channel: MappedChannel): StoredCatalogRecord {
        return {
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
          // Feature 015: capa declarada pela fonte (nunca para canal — classifyEntry não a preenche).
          iconUrl: channel.iconUrl,
        }
      }

      /**
       * Grava todos os blocos em buffer numa só transação (D-009: falta de
       * espaço aqui derruba a importação inteira, nunca publica parcial —
       * `fail()` decide isso ao tratar `StorageFullError`).
       */
      async function flush(): Promise<void> {
        if (buffered === 0) return
        const rows: Parameters<typeof storeEntryChunks>[0] = []
        let recordCount = 0
        for (const [categoryId, records] of buffers) {
          if (records.length === 0) continue
          const chunk = chunkIndex.get(categoryId) ?? 0
          chunkIndex.set(categoryId, chunk + 1)
          rows.push({ sourceId, generation, categoryId, chunk, records })
          recordCount += records.length
        }
        buffers = new Map()
        buffered = 0
        await storeEntryChunks(rows, database)
        run.channelsStored += recordCount
        if (cancelled) throw new ImportCancelledError()
        await persist()
      }

      async function push(categoryId: number, record: StoredCatalogRecord, countsAsItem: boolean): Promise<void> {
        const existing = buffers.get(categoryId)
        if (existing) existing.push(record)
        else buffers.set(categoryId, [record])
        buffered += 1
        if (countsAsItem) {
          categoryItemCounts.set(categoryId, (categoryItemCounts.get(categoryId) ?? 0) + 1)
        }
        if (buffered >= batchSize) await flush()
      }

      let sawAny = false
      for await (const entry of parseM3uLines(linesFromResponse(response.body), tally)) {
        if (cancelled) throw new ImportCancelledError()
        sawAny = true
        const classified = classifyWithGroupOrder(entry, groupOrders)
        const refined = refine ? refineFromUrl(classified) : classified

        if (refined.kind === 'unclassified') {
          // D-006/FR-008: classificado e descartado sem tocar o disco. O
          // contador é o que sustenta dizer "não é o catálogo completo da
          // fonte" sem inventar número.
          run.entriesRead += 1
          run.discardedByType += 1
          continue
        }

        if (refined.kind === 'episode') {
          run.entriesRead += 1
          // Episódio nunca tem categoria própria (D-001, feature 012) — o
          // bloco é o da série sintética que o agrupa. Todo episódio de uma
          // mesma série compartilha o mesmo grupo (é parte da chave do
          // agrupador), então perguntar de novo aqui é sempre um acerto de
          // cache (`categoryIdsByKey`), nunca uma escrita nova.
          const { episode, series } = seriesGrouper.assign(refined)
          const seriesCategoryId = await categoryIdFor('series', refined.group)
          if (seriesCategoryId !== undefined) {
            if (series) await push(seriesCategoryId, toStoredRecord(series), true)
            await push(seriesCategoryId, toStoredRecord(episode), false)
          }
          continue
        }

        run.entriesRead += 1
        const categoryId = await categoryIdFor(refined.kind, refined.group)
        if (categoryId !== undefined) {
          await push(categoryId, toStoredRecord(refined), true)
        }
      }
      run.invalidCount = tally.invalidCount
      if (!sawAny) throw new EmptyPlaylistError()

      await flush()

      // Só agora, com a varredura inteira concluída, cada categoria tem sua
      // contagem real — é o que `sectionCount` (`catalogApi.ts`) soma
      // enquanto a categoria ainda não foi lida (D-011).
      for (const [categoryId, count] of categoryItemCounts) {
        await setDeclaredCount(categoryId, count, database)
      }
    }

    /**
     * Grava a estrutura de uma seção — nenhum item. É a mudança central da
     * feature 010: a importação de provedor deixa de esperar o catálogo
     * inteiro e conclui assim que as categorias (algumas centenas, no pior
     * caso) estiverem gravadas. Reusada pelo caminho de provedor e, desde a
     * feature 014, por uma URL M3U reconhecida como painel Xtream (T016).
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

    /**
     * Importa a estrutura de um painel Xtream (categorias de canal, filme e
     * série) — nenhum item. Lança `ProviderIncompatibleError` se o painel
     * não falar o protocolo pela seção obrigatória (canais); quem chama
     * decide o fallback (feature 014, T016: extraído do que já era o
     * caminho de fonte de provedor, para uma URL M3U reconhecida como
     * painel confirmado (T017) reusar sem duplicar).
     */
    async function ingestProviderStructure(credential: {
      dns: string
      username: string
      password: string
    }): Promise<void> {
      // Contadores desta execução passam a significar categorias, não
      // itens — é o que a tela de progresso relata (FR-013, contrato §3).
      run.unit = 'categories'

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
    }

    /**
     * Decide, para uma URL M3U reconhecida como painel (feature 014, D-001),
     * se ela fala o protocolo Xtream completo ou cai no conteúdo guardado —
     * mesma árvore de decisão do D-002 do `plan.md`. Acesso recusado e
     * assinatura vencida **não** levam ao conteúdo guardado: fazem a
     * importação falhar, porque baixar a lista usaria a mesma credencial e
     * seria recusado também (FR-002).
     */
    async function confirmPanel(
      panel: PanelCredential,
    ): Promise<{ kind: 'xtream'; allowedFormats?: string[] } | { kind: 'limited'; reason: LimitedReason }> {
      let status: AccountStatus
      try {
        status = await resolveAccountStatus(panel.dns, panel.username, panel.password)
      } catch (error) {
        if (error instanceof ProviderError) {
          if (error.kind === 'invalid_credentials') throw error
          if (error.kind === 'network_failure') return { kind: 'limited', reason: 'panel_unreachable' }
          // direct_connection_refused: painel alcançável, mas não fala o protocolo por este caminho.
          return { kind: 'limited', reason: 'protocol_unavailable' }
        }
        if (error instanceof ProviderIncompatibleError) return { kind: 'limited', reason: 'protocol_unavailable' }
        throw error
      }
      if (status.expired) throw new ProviderError('subscription_expired', 'Assinatura expirada.')
      if (!status.authorized) throw new ProviderError('invalid_credentials', 'Acesso negado.')
      return { kind: 'xtream', allowedFormats: status.allowedFormats }
    }

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
        await ingestProviderStructure(credential)
      } catch (error) {
        if (!(error instanceof ProviderIncompatibleError)) throw error
        // O painel não fala o protocolo JSON: cai no caminho M3U legado.
        // É o "modo limitado" — menos informação por item, mas a fonte
        // continua utilizável, e o registro diz por qual caminho veio.
        // Volta a contar itens — o caminho integral não tem estrutura
        // pronta de antemão para contar.
        run.unit = 'items'
        mode = 'legacy_m3u'
        // Feature 014, FR-020/T025: mesmo motivo do painel reconhecido por
        // URL M3U que também não confirma o protocolo — o painel foi
        // alcançado (a conta autenticou), só não respondeu à consulta de
        // categorias pelo protocolo.
        limitedReason = 'protocol_unavailable'
        await scanToStored(
          legacyM3uUrl(credential.dns, credential.username, credential.password),
          true,
        )
      }
    } else {
      // Feature 014 (US1/D-001): a URL pode ser de um painel Xtream, ainda
      // que a fonte tenha sido cadastrada como "URL M3U" — o app tenta
      // reconhecer e confirmar antes de cair no caminho do conteúdo
      // guardado.
      const panel = parsePanelUrl(source!.m3uUrl as string)
      if (!panel) {
        await scanToStored(source!.m3uUrl as string)
      } else {
        const route = await confirmPanel(panel)
        if (route.kind === 'limited') {
          // `run.unit` nunca chegou a virar 'categories' aqui — `confirmPanel`
          // decidiu antes de `ingestProviderStructure` rodar. Explícito por
          // clareza (o `?? 'items'` de `toJobResponse` já cobriria o caso).
          run.unit = 'items'
          mode = 'legacy_m3u'
          limitedReason = route.reason
          await scanToStored(source!.m3uUrl as string, true)
        } else {
          allowedFormats = route.allowedFormats
          try {
            await ingestProviderStructure(panel)
          } catch (error) {
            if (!(error instanceof ProviderIncompatibleError)) throw error
            run.unit = 'items'
            mode = 'legacy_m3u'
            limitedReason = 'protocol_unavailable'
            await scanToStored(source!.m3uUrl as string, true)
          }
        }
      }
    }

    enterStep('storing')
    await persist()
    if (cancelled) throw new ImportCancelledError()

    await publishGeneration(sourceId, generation, database)
    await markSynced(sourceId, {
      at: now(),
      mode,
      limitedReason,
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

    if (error instanceof StorageFullError) {
      // Feature 014, D-009: o caminho do conteúdo guardado nunca publica
      // parcial — ao contrário do antigo caminho integral (removido nesta
      // feature), que gravava item a item e podia publicar o que coubesse.
      // Um bloco de `storedEntries` perdido no meio deixaria uma categoria
      // com itens incompletos e sem como saber disso depois, então a
      // geração inteira é descartada e a importação falha declarando o
      // motivo (`storage_full`), nunca escondido atrás de um "0 itens".
      await discardSilently()
      run.status = 'failed'
      run.errorKind = 'storage_full'
      await markConnectionError(sourceId, database)
      return
    }

    await discardSilently()
    run.status = 'failed'
    run.errorKind = categorize(error)
    await markConnectionError(sourceId, database)

    if (run.errorKind === undefined) {
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
