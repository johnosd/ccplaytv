import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorCode } from '../../lib/errors/errorCatalog'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  db,
  type BlockItem,
  type CategoryBlockRecord,
  type CategoryKind,
  type CatalogItemKind as StoredKind,
  type CatalogRecord,
  type TmdbRating,
  type UserStateRecord,
} from '../../lib/catalog/db'
import {
  getActiveCategoryBlock,
  getChannel,
  kindSortFields,
  listCategories,
  listChannels,
  listEpisodes,
  resolveContinueWatching,
  resolveContinueEntries,
  resolveFavorites,
  resolveStableIds,
  type CatalogCategory,
} from '../../lib/catalog/catalogRepository'
import { readKindCursorPage, type KindCursor } from '../../lib/catalog/kindCursor'
import { READ_WINDOW_MIN_ITEMS, readCategoryWindow } from '../../lib/catalog/categoryWindow'
import { READ_PROJECTION_CHUNK_SIZE, readProjectionManifest } from '../../lib/catalog/readProjection'
import { ensureCategory, type CategoryFetchOutcome } from '../../lib/catalog/categoryLoader'
import { markEntry } from '../../lib/perf/entryTiming'
import { isKeyRepeatBurst, subscribeKeyRepeatBurst } from '../../lib/focus/keyRepeat'
import { prefetchScheduler, renewCategoryNow } from '../../lib/catalog/prefetch'
import { ensureSeriesEpisodes, type SeriesFetchOutcome } from '../../lib/catalog/seriesLoader'
import { PlaybackUnavailableError, resolveArchivePlaybackUrl, resolvePlaybackUrl } from '../../lib/catalog/playbackUrl'
import { ArchiveClockUnknownError, type ArchiveVariant } from '../../lib/catalog/archiveUrl'
import { checkSourceAccount } from '../../lib/catalog/accountCheck'
import { isArchiveAvailable } from '../../lib/epg/catchup'
import type { PlaybackHeaders } from '../../lib/catalog/m3uHeaders'
import {
  buildStableId,
  getContinueWatching,
  getGlobalFavorites,
  getUserState,
  getUserStates,
  listFavorites,
  listWatched,
  parseStableId,
  setWatchedManually,
  toggleFavorite,
  type StableIdParts,
} from '../../lib/catalog/userStateRepository'
import { UNGROUPED_LABEL } from '../live/groupChannels'
import { type SeriesWatchedSummary } from '../../lib/catalog/seriesWatchedSummary'
import { loadSeriesWatchedSummaries } from './seriesSummaryApi'
import { buildSearchIndex, compactSearchRecord, isCovered, loadSearchIndex, type SearchableKind } from '../../lib/catalog/catalogSearch'
import { createRecentlyAddedAccumulator } from '../vod/vodShowcase'
import { primaryProgress, type PrimaryProgress } from '../vod/detailProgress'
import { pickBecauseSeed, type BecauseSeedKind } from '../../lib/catalog/becauseSeed'
import { createRatedSelectionAccumulator, dayKey } from '../vod/ratedSelection'
import { loadHistory, type HistoryKind } from './historyApi'
import {
  clearHistory,
  removeMovieFromHistory,
  removeSeriesFromHistory,
  summarizeHistory,
  type HistoryClearScope,
  type HistoryRemovalMode,
} from '../../lib/catalog/historyRemoval'
import { loadHomeHero, type HeroPrimary } from '../../lib/catalog/homeHero'
import { loadGlobalSearchIndex, searchGlobal } from '../../lib/catalog/globalSearch'
import { listProgramsForChannels } from '../../lib/epg/epgRepository'
import type { EpgLookup } from '../../lib/epg/types'
import { useLanguage } from '../../lib/i18n/I18nProvider'
import { ensureTitleMetadata, mergeTitleMetadata } from '../../lib/metadata/titleMetadata'
import { getTmdbStatus, removeTmdbKey, saveTmdbKey, testTmdbKey } from '../../lib/metadata/tmdbKeyRepository'
import type { KindCoverage, ResolvedTitle, SimilarTabView, TitleMetadataView } from '../../lib/metadata/types'
import type { TmdbTitleRef } from '../../lib/catalog/db'
import { FILMOGRAPHY_SHOWN_MAX, loadPersonCredits } from '../../lib/metadata/tmdbPeople'
import { resolveTmdbTitles } from '../../lib/metadata/localTitleMatch'
import { similarTabStatus } from '../../lib/metadata/similarTab'
import { matchDiscoveryTitlesAsync, selectTip, selectTop10, yieldToMain, type MatchedTitle } from '../../lib/metadata/discoveryRules'
import { iterateKindRecordBatches } from '../../lib/catalog/catalogDerivedRows'
import { loadTipPool, loadWeeklyTrending, type DiscoveryKind } from '../../lib/metadata/tmdbDiscovery'
const EPG_READ_BEFORE_MS = 24 * 60 * 60 * 1000
const EPG_READ_AFTER_MS = 48 * 60 * 60 * 1000
const EPG_HOUR_MS = 60 * 60 * 1000
/**
 * Programação (feature 030) dos canais informados, lida **só do aparelho**
 * (FR-029): nunca rede, portanto seguro de chamar ao focar/rolar. Recebe os
 * ids de EPG (`epg_channel_id`) dos canais visíveis — repetidos e vazios são
 * ignorados; sem nenhum, a consulta nem roda.
 *
 * O deslocamento manual da fonte vem junto: quem exibe aplica em
 * `nowNextForChannel`. A leitura cobre `[agora − 24 h, agora + 48 h]` **já
 * descontado o deslocamento**, para o que aparece deslocado caber (D-013).
 * Uma sincronização que termina invalida `['epg']` (`App.tsx`).
 */
export function useEpgPrograms(sourceId: string | null, epgChannelIds: readonly (string | null | undefined)[]) {
  const keys = useMemo(
    () => [...new Set(epgChannelIds.filter((id): id is string => typeof id === 'string' && id !== ''))].sort(),
    [epgChannelIds],
  )
  return useQuery({
    queryKey: ['epg', sourceId, keys.join('\u0001')],
    enabled: sourceId !== null && keys.length > 0,
    staleTime: 5 * 60 * 1000,
    // Digitar na busca por categoria troca o conjunto de canais a cada
    // tecla; sem isto o "Agora" das linhas que continuam na tela piscaria.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EpgLookup> => {
      const now = Date.now()
      const source = await db.sources.get(sourceId as string)
      const offsetMs = (source?.epgOffsetHours ?? 0) * EPG_HOUR_MS
      const byKey = await listProgramsForChannels(
        sourceId as string,
        keys,
        { from: now - EPG_READ_BEFORE_MS - offsetMs, to: now + EPG_READ_AFTER_MS - offsetMs },
      )
      return { byKey, offsetMs }
    },
  })
}
export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface CatalogItemOut {
  id: string
  kind: CatalogItemKind
  name: string
  original_group: string | null
  published: boolean
  playable: boolean
  /**
   * Identidade estável (feature 011, retomada) — opcionais de propósito: as
   * grades (Filmes/Séries/Live) constroem `CatalogItemOut` em massa e nunca
   * precisam destes campos; só a tela de detalhe os consome, para montar a
   * chave de `userStateRepository.buildStableId` sem depender da URL.
   */
  source_id?: string
  provider_stream_id?: string | null
  original_name?: string
  /** Liga um episódio à série (feature 012). `undefined` fora do detalhe de série, como os demais campos de identidade. */
  series_id?: string | null
  /** Capa/logo declarada pela fonte (feature 015, estendida a canal pela 024, R-003). `null` = fonte não declarou. */
  icon_url?: string | null
  /** Categoria local do item (feature 024) — base do número de exibição do canal (`channelNumber.ts`). */
  category_id?: number | null
  /** Posição 0-based do item dentro da categoria, na ordem da fonte (feature 024). `null` = gravado antes desta feature. */
  category_position?: number | null
  /**
   * Número que o próprio painel declara para o canal — nunca populado hoje:
   * o `num` de `get_live_streams` foi verificado (feature 024, T001,
   * `research.md` R1) e refutado como posição global, então não é
   * capturado. O campo existe só para `channelNumberOf` (que o usaria se um
   * dia um provedor confiável declarar algo assim), sempre `null` na
   * prática.
   */
  source_number?: number | null
  /** Ano declarado pela fonte (feature 025). `null` = não declarado. */
  year?: number | null
  /** Inclusão declarada pela fonte, epoch ms (feature 025). `null` = não declarada. */
  added_at?: number | null
  /** Nota que o provedor declara na listagem, 0–10 com uma casa (feature 055). `null` = sem nota (ausente, 0 ou inválida). */
  provider_rating?: number | null
  /** Gêneros da listagem, só série e só para exibição (feature 055). `null` = não declarado. */
  provider_genres?: string | null
  /** Primeira URL de fundo válida da listagem, só série (feature 055). `null` = não declarada. */
  provider_backdrop_url?: string | null
  /**
   * Id de EPG que a fonte declara para o canal (feature 030, FR-006/FR-008):
   * `epg_channel_id` do Xtream, `tvg-id` do M3U. `null` = não declarado —
   * canal sem EPG, nunca casado por nome.
   */
  epg_channel_id?: string | null
  /**
   * Dias de arquivo (catch-up) que o painel declara para o canal (feature 058,
   * FR-007): `tv_archive` = 1 com `tv_archive_duration` > 0. `null` = sem
   * arquivo (inclusive toda fonte M3U avulsa).
   */
  archive_days?: number | null
}

export interface CatalogItemPlayback {
  item_id: string
  kind: CatalogItemKind
  url: string
  container_hint: string | null
  /**
   * Identidade estável (feature 011, retomada) — `userStateRepository.
   * buildStableId` monta a chave de progresso a partir destes campos,
   * nunca da URL. `provider_stream_id` ausente é o caso normal de fonte M3U
   * (sem identificador de painel); `buildStableId` cai em `original_name`.
   */
  source_id: string
  provider_stream_id: string | null
  original_name: string
  /** Série, temporada e episódio (feature 012) — `null` para canal/filme. */
  series_id: string | null
  season_number: number | null
  episode_number: number | null
  /**
   * Headers que a lista M3U declarou para o item (feature 044; repassados ao
   * motor pela feature 058, FR-001). **Segredo em potencial** (ADR-010): só
   * atravessam até o adaptador — nunca estado de tela, log, erro ou chave de
   * consulta. Ausente quando a lista não declarou nenhum.
   */
  headers?: PlaybackHeaders
}

/** O programa de arquivo pedido pela tela (feature 058): horários reais do EPG, epoch ms. */
export interface ArchiveProgramRef {
  start: number
  end: number
}

/** O que `stableIdOf` precisa — CatalogItemOut e CatalogItemPlayback satisfazem por tipagem estrutural. */
export interface StableIdSource {
  source_id?: string
  kind: CatalogItemKind
  provider_stream_id?: string | null
  series_id?: string | null
  season_number?: number | null
  episode_number?: number | null
  original_name?: string
}

/**
 * Identidade estável de reprodução (feature 012, D-006) — ponto único que
 * monta `buildStableId` a partir da forma que as telas recebem, incluindo
 * temporada/episódio. Antes desta feature, `PlayerLayer.computeIdentity` e
 * `MovieDetailScreen.computeIdentity` duplicavam essa montagem sem os
 * campos de série — todo episódio colidiria em `s0|e0` (R-001). Nunca
 * lança: sem identidade estável, `null` (D-010 da 011).
 */
export function stableIdOf(item: StableIdSource): string | null {
  try {
    return buildStableId({
      sourceId: item.source_id ?? '',
      kind: item.kind,
      providerStreamId: item.provider_stream_id ?? undefined,
      seriesId: item.series_id ?? undefined,
      seasonNumber: item.season_number ?? undefined,
      episodeNumber: item.episode_number ?? undefined,
      originalName: item.original_name ?? '',
    })
  } catch {
    return null
  }
}

export class CatalogApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Como o provedor declarou, normalizado — nunca um rótulo inventado. */
export function groupLabel(name: string | undefined): string {
  return name?.trim() ? name.trim() : UNGROUPED_LABEL
}

function toItemOut(record: CatalogRecord, kind: CatalogItemKind): CatalogItemOut {
  return itemOut(record, kind, record.sourceId, record.categoryId ?? null, record.categoryPosition ?? null)
}

/**
 * Item de bloco direto para a tela (feature 039, R-009): o que o bloco diz
 * uma vez só (fonte, categoria) vem do bloco; a posição é o índice (o bloco
 * está na ordem da fonte). Mesmo resultado de `toItemOut(blockRecord(...))`
 * sem criar o registro intermediário.
 */
function blockItemOut(block: CategoryBlockRecord, item: BlockItem, index: number, kind: CatalogItemKind): CatalogItemOut {
  return itemOut(item, kind, block.sourceId, block.categoryId, index)
}

function itemOut(
  record: Omit<BlockItem, 'id'> & { id?: number },
  kind: CatalogItemKind,
  sourceId: string,
  categoryId: number | null,
  categoryPosition: number | null,
): CatalogItemOut {
  return {
    id: String(record.id ?? ''),
    kind,
    name: record.name,
    original_group: record.group ?? null,
    published: true,
    // Série é agrupador: o que se reproduz é um episódio dela, então ela
    // nunca se anuncia como reproduzível.
    playable:
      kind === 'series'
        ? false
        : record.hasPlayback ?? (Boolean(record.directUrl) || Boolean(record.providerStreamId)),
    source_id: sourceId,
    provider_stream_id: record.providerStreamId ?? null,
    original_name: record.originalName,
    series_id: record.seriesId ?? null,
    icon_url: record.iconUrl ?? null,
    category_id: categoryId,
    category_position: categoryPosition,
    // Nunca capturado (T001 refutou `num` como posição global — ver o comentário do campo).
    source_number: null,
    year: record.year ?? null,
    added_at: record.addedAt ?? null,
    provider_rating: record.providerRating ?? null,
    provider_genres: record.providerGenres ?? null,
    provider_backdrop_url: record.providerBackdropUrl ?? null,
    epg_channel_id: record.epgChannelId ?? null,
    archive_days: record.archiveDays ?? null,
  }
}

// Re-exportado: telas falam só com `catalogApi`, nunca com
// `lib/catalog` direto — o mesmo motivo de D-001 para repositórios.
export type { CatalogCategory, CategoryFetchOutcome }
// Feature 058: a camada de reprodução lembra a variante de URL de arquivo que tocou.
export { rememberArchiveVariant } from '../../lib/catalog/sourceRepository'

/**
 * A estrutura de uma seção — as categorias, na ordem declarada. Rápido e
 * sempre seguro de chamar: é leitura pura de `categories`, nunca toca rede
 * (feature 010, contrato `catalog-on-demand.md` §1).
 */
export function useCategoryList(sourceId: string | null, kind: StoredKind) {
  return useQuery({
    queryKey: ['categories', sourceId, kind],
    queryFn: () => (sourceId ? listCategories(sourceId, kind) : Promise.resolve([])),
    enabled: sourceId !== null,
  })
}

export interface CategoryContent {
  items: CatalogItemOut[]
  /** Contagem real, já depois de garantir a categoria — sempre o fato do disco, nunca a promessa da fonte. */
  totalCount: number
  outcome: CategoryFetchOutcome
  /** Feature 042: código da tabela de erros quando a falha veio do painel/rede (nunca o erro cru). */
  errorCode?: ErrorCode
}

/**
 * "Sem teto" para `listChannels` (feature 009, D-002 completo).
 *
 * **Não é** `Number.MAX_SAFE_INTEGER`: esse `limit` chega até
 * `IDBIndex.getAll(query, count)`, e o navegador exige `count` como
 * `unsigned long` do WebIDL — no máximo `2**32 - 1`. Um valor maior lança
 * `TypeError: ... is outside the 'unsigned long' value range`, descoberto
 * ao verificar esta feature na TV física em 23/09/2026: a categoria vinha
 * vazia (ou, dependendo do motor, com linhas sobrepostas por outro bug já
 * corrigido) porque a consulta nunca completava. `0xFFFFFFFF` é o teto
 * real do navegador — folgado o bastante para qualquer categoria real
 * (a fonte inteira de referência tem 311.367 entradas), sem arriscar essa
 * mesma armadilha nalgum motor mais recente que valide o argumento.
 */
const NO_LIMIT = 0xffffffff

/** Garante a categoria (rede só se precisar; vencida abre com o que tem e vai para a frente da pré-carga). */
async function ensureCategoryForEntry(sourceId: string, category: CatalogCategory, signal?: AbortSignal) {
  // Só passa `{ signal }` quando há um sinal de verdade (prefetch) — a
  // entrada real (`useCategoryContent`, sem `signal`) nunca é abortável e
  // mantém a mesma chamada de sempre (bug
  // `prefetch-concorrente-categoria-sem-cancelamento-requisicao`).
  // Feature 038 (D-007/FR-026): vencida ou com renovação pendente abre na hora com o que tem, e a renovação vai para a
  // frente da fila; na entrada real ela também roda já, por fora da fila (bug `categoria-aberta-nao-mostra-itens-novos`:
  // na TV a fila pode ficar presa numa seção inteira). A pré-busca por foco (`signal`) nunca dispara essa busca.
  // Servir do disco de propósito não é falha: a nota "Não foi possível atualizar agora" das telas só vale para
  // `stale-served` de verdade (a busca falhou), então aqui o resultado sai como `fresh`.
  if (!signal) markEntry(category.id, category.kind, 'start')
  let renewalQueued = false
  const serveStale = (categoryId: number) => {
    renewalQueued = true
    prefetchScheduler.prioritize(categoryId)
    if (!signal) void renewCategoryNow(sourceId, category)
  }
  const ensured = signal
    ? await ensureCategory(sourceId, category, { signal, serveStale })
    : await ensureCategory(sourceId, category, { serveStale })
  if (!signal) markEntry(category.id, category.kind, 'ensured')
  return renewalQueued ? { ...ensured, outcome: 'fresh' as const } : ensured
}

/**
 * Garante e lê os itens de uma categoria — o corpo de `useCategoryContent`,
 * extraído para ser reusado por `prefetchCategoryContent` sem duplicar a
 * lógica.
 */
async function loadCategoryContent(
  sourceId: string,
  category: CatalogCategory,
  signal?: AbortSignal,
): Promise<CategoryContent> {
  const result = await ensureCategoryForEntry(sourceId, category, signal)
  // As três seções buscam a categoria inteira, sem teto de leitura (feature
  // 009, D-002 completo) — painel de canais e grades de pôsteres agora
  // virtualizam o que renderizam, então não precisam mais de um corte
  // artificial pra não travar a TV.
  //
  // Feature 039 (R-009): com bloco, uma leitura pela chave e uma conversão por
  // item; sem bloco (formato antigo ainda não convertido), as linhas.
  const block = await getActiveCategoryBlock(sourceId, category.id)
  const records = block ? undefined : await listChannels(sourceId, category.order, 0, NO_LIMIT, category.kind)
  // Feature 039: a leitura sem teto já é a categoria inteira — contar de novo
  // seria uma segunda leitura do mesmo bloco.
  const totalCount = block ? block.items.length : (records?.length ?? 0)
  // Feature 038 (FR-012): medição desligada por padrão, só números.
  if (!signal) markEntry(category.id, category.kind, 'read', totalCount)
  const items = block
    ? block.items.map((item, index) => blockItemOut(block, item, index, category.kind))
    : (records ?? []).map((record) => toItemOut(record, category.kind))
  if (!signal) markEntry(category.id, category.kind, 'itemsOut')
  return { items, totalCount, outcome: result.outcome, errorCode: result.errorCode }
}

function categoryContentKey(sourceId: string | null, categoryId: number | undefined) {
  return ['category-content', sourceId, categoryId] as const
}

/**
 * Garante e lê os itens de **uma** categoria.
 *
 * Só busca de fato quando `category` é informada. Quem alimenta essa
 * categoria é a tela: hoje é a categoria em que a pessoa **entrou**
 * (SELECT), não qualquer uma sobre a qual o cursor passou — mover o foco
 * nunca chama isto diretamente. A pré-busca por permanência do foco
 * (`prefetchCategoryContent`, abaixo) é o único outro jeito de a rede ser
 * tocada antes da entrada, e é deliberadamente separada e amortecida.
 */
export function useCategoryContent(sourceId: string | null, category: CatalogCategory | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: categoryContentKey(sourceId, category?.id),
    queryFn: async (): Promise<CategoryContent> => {
      if (!sourceId || !category) return { items: [], totalCount: 0, outcome: 'fresh' }
      const content = await loadCategoryContent(sourceId, category)
      // Entrar numa categoria que ainda não estava no aparelho traz conteúdo novo ao catálogo: o índice de busca (vitrine,
      // Todos, Top 10/Dica), que não é mais relido a cada montagem, precisa saber (bug `tela-principal-filmes-lenta-na-tv`).
      if (content.outcome === 'fetched') void queryClient.invalidateQueries({ queryKey: ['catalog-search-index', sourceId] })
      return content
    },
    enabled: sourceId !== null && category !== undefined,
  })
  // Feature 038 (FR-012): fecha a medição da entrada no primeiro quadro com
  // itens — efeito roda depois do commit, o `requestAnimationFrame` depois da
  // pintura. Sem `ccplaytv:perf`, `markEntry` não faz nada.
  const paintedId = query.data && query.data.items.length > 0 ? category?.id : undefined
  const paintedKind = category?.kind
  useEffect(() => {
    if (paintedId === undefined || paintedKind === undefined) return
    const frame = requestAnimationFrame(() => markEntry(paintedId, paintedKind, 'firstPaint'))
    return () => cancelAnimationFrame(frame)
  }, [paintedId, paintedKind])
  return query
}

type CategoryWindowPage = CategoryContent & { windowed: boolean }
/** Uma janela da projeção a partir de `offset` (a primeira também garante a categoria). Sem projeção atual: `windowed: false`. */
async function loadCategoryWindowPage(queryClient: QueryClient, sourceId: string, category: CatalogCategory, offset: number, wantedEnd: number, signal?: AbortSignal): Promise<CategoryWindowPage> {
  const ensured = offset === 0 ? await ensureCategoryForEntry(sourceId, category, signal) : undefined
  if (ensured?.outcome === 'fetched') void queryClient.invalidateQueries({ queryKey: ['catalog-search-index', sourceId] })
  const base = { outcome: ensured?.outcome ?? ('fresh' as const), errorCode: ensured?.errorCode }
  const manifest = await readProjectionManifest(sourceId, category.id)
  if (!manifest || manifest.count !== category.count) return { ...base, items: [], totalCount: 0, windowed: false }
  const window = await readCategoryWindow(sourceId, category.id, offset, Math.max(READ_PROJECTION_CHUNK_SIZE, wantedEnd - offset))
  return { ...base, items: window.items.map((record) => toItemOut(record, category.kind)), totalCount: window.total, windowed: true }
}

function nextWindowOffset(last: CategoryWindowPage, all: CategoryWindowPage[]): number | undefined {
  const loaded = all.reduce((sum, page) => sum + page.items.length, 0)
  return last.windowed && last.items.length > 0 && loaded < last.totalCount ? loaded : undefined
}

/**
 * Grade de categoria por janela (feature 065, SC-007). Categoria grande na ordem da fonte e sem busca (`windowable`), com
 * projeção da contagem atual: `data.items` é o começo já lido, `data.totalCount` a categoria inteira, e `loadMore(index)` lê
 * até cobrir `index` — nunca a categoria inteira só para o primeiro recorte. `windowed: false` = a tela usa `useCategoryContent`.
 */
export function useCategoryWindow(sourceId: string | null, category: CatalogCategory | undefined, windowable: boolean) {
  const queryClient = useQueryClient()
  const big = windowable && (category?.count ?? 0) >= READ_WINDOW_MIN_ITEMS
  const wantedEnd = useRef(0)
  const pages = useInfiniteQuery({
    queryKey: [...categoryContentKey(sourceId, category?.id), 'window'],
    initialPageParam: 0,
    queryFn: ({ pageParam: offset }) => loadCategoryWindowPage(queryClient, sourceId as string, category as CatalogCategory, offset, wantedEnd.current),
    getNextPageParam: nextWindowOffset,
    enabled: big && sourceId !== null && category !== undefined,
  })
  const first = pages.data?.pages[0]
  const windowed = big && first?.windowed !== false
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages
  const items = useMemo(() => pages.data?.pages.flatMap((page) => page.items) ?? [], [pages.data])
  const loadMore = useCallback((index?: number) => {
    wantedEnd.current = Math.max(wantedEnd.current, (index ?? items.length) + READ_PROJECTION_CHUNK_SIZE)
    if (hasNextPage && !isFetchingNextPage && (index === undefined || index >= items.length)) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])
  const data: CategoryContent | undefined = first && { items, totalCount: first.totalCount, outcome: first.outcome, errorCode: first.errorCode }
  return { data, isLoading: pages.isLoading, isError: pages.isError, refetch: pages.refetch, windowed, hasMore: windowed && hasNextPage, loadMore }
}

/**
 * Campos de ordenação que o tipo inteiro declara (feature 039, T033) — para o
 * modal "Ordenar" de "Todos" aos poucos não esconder "Ano"/"Recém-adicionados"
 * que só aparecem em categorias ainda não lidas. `enabled` só com o modal
 * aberto: entrar em "Todos" não paga essa varredura.
 */
export function useKindSortFields(sourceId: string | null, kind: FavoritableKind, enabled: boolean) {
  return useQuery({
    queryKey: ['kind-sort-fields', sourceId, kind],
    queryFn: () => kindSortFields(sourceId as string, kind),
    enabled: enabled && sourceId !== null,
  })
}

/**
 * Quanto o cursor precisa **parar** numa categoria antes de valer a pena
 * pré-buscá-la. Existe por causa do R-002 do plano da feature 010: sem
 * isto, passar o cursor rápido por uma trilha de centenas de categorias
 * dispararia uma consulta ao painel por categoria sobrevoada — o tipo de
 * rajada que faz um painel real limitar a taxa. Debounce, não intervalo
 * fixo: só a categoria onde o cursor de fato ficou é buscada.
 */
const CATEGORY_PREFETCH_DEBOUNCE_MS = 300

/**
 * Pré-busca uma categoria fora do ciclo normal de "entrar" — usada só pelo
 * amortecimento de `useCategoryFocusPrefetch`. Escreve no mesmo cache que
 * `useCategoryContent` lê (mesma `queryKey`), então quando a pessoa entra
 * de fato na categoria que acabou de ser pré-buscada, a tela mostra o
 * conteúdo na hora — sem outra ida à rede.
 */
export function prefetchCategoryContent(
  queryClient: QueryClient,
  sourceId: string,
  category: CatalogCategory,
  signal?: AbortSignal,
): Promise<void> {
  const windowKey = [...categoryContentKey(sourceId, category.id), 'window'] // 065: categoria grande pré-busca só a 1ª janela
  const full = () => queryClient.prefetchQuery({ queryKey: categoryContentKey(sourceId, category.id), queryFn: () => loadCategoryContent(sourceId, category, signal) })
  return (!(category.count >= READ_WINDOW_MIN_ITEMS) ? full() : queryClient.prefetchInfiniteQuery({ queryKey: windowKey, initialPageParam: 0, getNextPageParam: nextWindowOffset,
    queryFn: () => loadCategoryWindowPage(queryClient, sourceId, category, 0, 0, signal) }).then(() => (queryClient.getQueryData<{ pages: CategoryWindowPage[] }>(windowKey)?.pages[0]?.windowed ? undefined : full())))
    .then(() => {
      // Feature 053: a prévia do carrossel dessa categoria (tela hero) lê o mesmo disco — relê agora que há conteúdo.
      void queryClient.invalidateQueries({ queryKey: categoryPreviewKey(sourceId, category.id) })
      void queryClient.invalidateQueries({ queryKey: ['category-preview', sourceId, 'window'] })
    })
}

/**
 * Pré-busca a categoria em foco na trilha, com o amortecimento acima.
 *
 * **Desvio deliberado da leitura original de FR-004** ("obter só na
 * entrada, nunca no foco"), pedido pelo usuário depois de ver o
 * comportamento estrito na TV física em 23/09/2026: mover o cursor pela
 * trilha sem pré-busca deixava a entrada sempre parecendo primeira vez.
 * Categoria não é um item reproduzível — pré-buscar sua listagem ao
 * focar não inicia reprodução nem expõe nada que a entrada não exporia
 * um instante depois; é o mesmo tipo de antecipação que um app de TV faz
 * ao pré-carregar a miniatura do próximo cartão. Ver `plan.md` R-013 e o
 * `data-model`/contrato desta feature para o registro completo.
 *
 * `enteredCategoryId`: a categoria que a pessoa já **entrou** (coluna de
 * conteúdo), se houver. Quando ela é a mesma que está em foco na trilha,
 * o prefetch nunca dispara nem fica pendente — achado na feature 015
 * (2026-09-24): sem isto, um timer já agendado antes da entrada dispara
 * ~300ms depois mesmo já dentro da categoria, usando o snapshot de
 * `focusedCategory` capturado no foco (sem `itemsFetchedAt`, porque a
 * lista de categorias de `useCategoryList` nunca é invalidada pela
 * leitura real). Para categoria `stored` (feature 014), isso repete
 * `ensureCategory` depois que a entrada real já consumiu os blocos de
 * `storedEntries` — a releitura acha vazio, devolve `source_missing`, e
 * `prefetchCategoryContent` escreve isso por cima do cache que
 * `useCategoryContent` já tinha populado com o conteúdo certo: a tela
 * mostra "conteúdo não está mais no aparelho" sem o usuário ter feito
 * nada. Cancelar o timer pendente ao entrar (via este parâmetro na lista
 * de dependências do efeito) fecha a corrida na raiz, sem precisar
 * invalidar a query de categorias nem tornar `ensureCategory` ciente de
 * cache alheio.
 *
 * **Bug `prefetch-concorrente-categoria-sem-cancelamento-requisicao`
 * (2026-09-25)**: até aqui, o `clearTimeout` do cleanup só cancelava um
 * timer que ainda não tinha disparado — uma vez que a busca de rede
 * começava, nada a interrompia, mesmo que o cursor já tivesse saído
 * daquela categoria há muito. Numa trilha longa (dezenas de categorias),
 * navegação humana normal deixava várias dessas buscas "esquecidas"
 * correndo ao mesmo tempo, competindo por banda/conexões contra a mesma
 * origem — achado na TV física contra uma fonte real, onde a categoria em
 * que a pessoa de fato queria entrar podia demorar mais de um minuto por
 * estar na fila atrás delas. Agora cada busca carrega um `AbortController`
 * próprio, guardado em `inFlightRef`; iniciar a busca seguinte aborta a
 * anterior — **exceto** quando essa anterior é a categoria já **entrada**
 * (`enteredCategoryId`): essa busca passou a ser compartilhada com a
 * entrada real via `dedup` do `categoryLoader`, e abortá-la quebraria a
 * entrada também.
 */
export function useCategoryFocusPrefetch(
  sourceId: string | null,
  focusedCategory: CatalogCategory | undefined,
  enteredCategoryId?: number,
) {
  const queryClient = useQueryClient()
  const inFlightRef = useRef<{ categoryId: number; controller: AbortController } | null>(null)
  useEffect(() => {
    if (!sourceId || !focusedCategory) return
    if (focusedCategory.id === enteredCategoryId) return

    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      timer = setTimeout(() => {
        const previous = inFlightRef.current
        if (previous && previous.categoryId !== focusedCategory.id && previous.categoryId !== enteredCategoryId) {
          previous.controller.abort()
        }
        const controller = new AbortController()
        inFlightRef.current = { categoryId: focusedCategory.id, controller }
        void prefetchCategoryContent(queryClient, sourceId, focusedCategory, controller.signal)
      }, CATEGORY_PREFETCH_DEBOUNCE_MS)
    }

    // Feature 046: seta segurada (`KeyboardEvent.repeat`) = o foco só está passando. Em rajada nada
    // é agendado, e uma rajada que começa cancela o timer pendente; ao estabilizar (soltar a tecla ou
    // silêncio), o amortecimento normal corre para a categoria onde o foco parou. A reação é síncrona
    // (assinatura direta, sem esperar um render), e nada em andamento é abortado por causa dela — só o
    // ramo do timer aborta, como antes (FR-004).
    if (!isKeyRepeatBurst()) arm()
    const unsubscribe = subscribeKeyRepeatBurst((fast) => {
      clearTimeout(timer)
      if (!fast) arm()
    })

    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
    // `focusedCategory` inteira na lista de dependências, de propósito: o
    // React Query devolve referência estável de `data` enquanto a consulta
    // não refizer de verdade, então isto só rearma o temporizador quando a
    // categoria em foco muda de fato — não é preciso comparar por `id`
    // manualmente. `enteredCategoryId` também entra: mudar de "focada" pra
    // "entrada" precisa cancelar um timer já agendado, não só bloquear um
    // novo.
  }, [sourceId, focusedCategory, enteredCategoryId, queryClient])
}

/**
 * Uma contagem de seção que não finge saber o que não sabe (feature 010).
 *
 * `items` só existe quando há um número **real** para mostrar: soma de
 * itens já gravados numa categoria `eager` (M3U — sempre completa), ou soma
 * do que o provedor **declarou** numa categoria `on_demand` que ainda não
 * foi aberta. As duas nunca se misturam por categoria (D-005) — cada
 * categoria contribui com o número que é dela por direito.
 *
 * `categories` é sempre conhecido depois da estrutura importada, mesmo
 * quando nenhum item foi obtido ainda — e é o que o hub mostra quando não
 * há `items` para mostrar, em vez de um "0" que mentiria dizendo que a
 * seção está vazia.
 */
export interface SectionCount {
  items?: number
  categories: number
}

export interface CatalogCounts {
  channels: SectionCount
  movies: SectionCount
  series: SectionCount
}

async function sectionCount(sourceId: string, kind: CategoryKind): Promise<SectionCount> {
  const categories = await listCategories(sourceId, kind)
  let items: number | undefined
  for (const category of categories) {
    // Eager: os itens já estão todos gravados — é a soma real, completa.
    // On_demand: só soma o que a fonte declarou; painel Xtream real não
    // declara isso hoje (xtreamConnector.ts), então isto fica pronto para
    // quando algum declarar, sem inventar nada enquanto isso não acontece.
    // Stored (feature 014): a varredura sempre sabe a contagem real desde
    // a importação (`declaredCount`, D-011) — mas depois que a categoria é
    // lida, `count` passa a ser o fato do disco, e é ele que conta (mesma
    // regra de `eager`, nunca os dois somados).
    const contribution =
      category.fetchMode === 'eager'
        ? category.count
        : category.fetchMode === 'stored' && category.itemsFetchedAt !== undefined
          ? category.count
          : category.declaredCount
    if (contribution === undefined) continue
    items = (items ?? 0) + contribution
  }
  return { items, categories: categories.length }
}

/**
 * Quantos itens (ou, na falta deles, quantas categorias) cada seção da
 * geração publicada tem.
 *
 * Enquanto nada chega, quem chama mostra nada — nunca um número de outra
 * origem (FR-014). Canais passam pela mesma regra de filmes/séries
 * (`sectionCount`) — não pela contagem bruta do disco (`countChannels`) —
 * porque canal de provedor também nasce `on_demand` (feature 010, achado
 * C-001 do `sdd-converge`): mostrar o disco cru daria "0" logo após
 * sincronizar, exatamente o número mentiroso que FR-014 proíbe.
 */
export function useCatalogCounts(sourceId: string | null) {
  return useQuery({
    queryKey: ['catalog-counts', sourceId],
    queryFn: async (): Promise<CatalogCounts> => {
      if (!sourceId) {
        return { channels: { categories: 0 }, movies: { categories: 0 }, series: { categories: 0 } }
      }
      const [channels, movies, series] = await Promise.all([
        sectionCount(sourceId, 'channel'),
        sectionCount(sourceId, 'movie'),
        sectionCount(sourceId, 'series'),
      ])
      return { channels, movies, series }
    },
    enabled: sourceId !== null,
  })
}

/**
 * Um item pelo seu id, direto pela chave primária.
 *
 * As telas de detalhe existiam lendo a lista inteira e procurando dentro
 * dela — o que, além de custar o catálogo todo para mostrar um item, deixa
 * de encontrar qualquer coisa que tenha ficado além do teto de leitura.
 */
export function useCatalogItem(itemId: string | null) {
  return useQuery({
    queryKey: ['catalog-item', itemId],
    queryFn: async () => {
      if (!itemId) return null
      const record = await getChannel(Number(itemId))
      return record ? toItemOut(record, record.kind) : null
    },
    enabled: itemId !== null,
  })
}

/** Itens do catálogo por id local, na ordem pedida; os que não existem mais (saíram numa renovação) ficam de fora. */
export async function loadCatalogItems(itemIds: readonly string[]): Promise<CatalogItemOut[]> {
  const records = await Promise.all(itemIds.map((id) => getChannel(Number(id))))
  const items: CatalogItemOut[] = []
  for (const record of records) if (record) items.push(toItemOut(record, record.kind))
  return items
}

/** Concluídos recentes considerados para a semente — o bastante para passar por cima de títulos que saíram da lista. */
const BECAUSE_CANDIDATES = 50

/**
 * A semente de "Porque você assistiu" (feature 060, FR-014 — `logic/fileiras-e-dados.md` §2): o título concluído mais recente
 * da fonte (filme, ou a série de um episódio concluído), já resolvido para o item do catálogo. Só leitura local — nunca rede.
 * `null` sem concluído, ou quando nenhum deles existe mais na lista (nunca adivinha por aproximação de título).
 */
export async function loadBecauseSeed(sourceId: string, kind: BecauseSeedKind): Promise<CatalogItemOut | null> {
  const states = await db.userStates.where('sourceId').equals(sourceId).toArray()
  const recent = states
    .filter((state) => state.completedAt != null)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, BECAUSE_CANDIDATES)
  if (recent.length === 0) return null

  // Só entram os que ainda resolvem para um item da lista; o episódio resolve para a série-pai.
  const entries = await resolveContinueEntries(sourceId, recent, db)
  const seriesIdOfEpisode = new Map<string, string>()
  for (const entry of entries) {
    if (entry.episode && entry.record.seriesId) seriesIdOfEpisode.set(entry.state.stableId, entry.record.seriesId)
  }
  const resolvable = new Set(entries.map((entry) => entry.state.stableId))
  const seed = pickBecauseSeed(
    recent.filter((state) => resolvable.has(state.stableId)),
    { sourceId, kind, seriesIdOfEpisode: (stableId) => seriesIdOfEpisode.get(stableId) },
  )
  if (!seed) return null

  const entry =
    seed.kind === 'movie'
      ? entries.find((candidate) => candidate.state.stableId === seed.stableId)
      : entries.find((candidate) => candidate.episode && candidate.record.seriesId === seed.seriesId)
  return entry ? toItemOut(entry.record, entry.record.kind) : null
}

/**
 * O id atual de um item no aparelho, ou `null` se ele não existe mais (saiu
 * numa renovação). Um id de linha antiga já convertida em bloco (feature 039)
 * devolve o id novo. Lê só o bloco daquele item — nunca o tipo inteiro.
 */
export async function resolveCatalogItemId(itemId: string): Promise<string | null> {
  const record = await getChannel(Number(itemId))
  return record?.id === undefined ? null : String(record.id)
}

/**
 * Metadata descritiva de filme/série para o detalhe (feature 032, US1/US3).
 * Só a tela de detalhe chama — abrir o detalhe é a ação explícita que
 * autoriza a consulta externa (FR-002); nunca usar numa grade ou por foco.
 * Não bloqueia a tela: quem usa renderiza sem `data` e completa quando
 * chegar (FR-005).
 */
export function useTitleMetadata(itemId: string | null) {
  const queryClient = useQueryClient()
  // O idioma do app entra na chave (feature 054): o que foi lido em outro idioma não é mostrado como se valesse no atual.
  const language = useLanguage()
  return useQuery({
    queryKey: ['title-metadata', itemId, language],
    queryFn: async ({ signal }) => {
      const view = await ensureTitleMetadata(Number(itemId), { language, signal })
      // A consulta pode ter mudado o estado do TMDB (chave recusada, sem
      // conexão, limite de uso — FR-024): Integrações e o dock releem, sem
      // aviso no detalhe.
      void queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
      return view
    },
    enabled: itemId !== null,
    // 061: só estes dados independentes do idioma continuam visíveis durante a releitura da 054 do MESMO título.
    // Sinopse e demais textos não vêm da resposta no idioma anterior; trocar de título nunca reutiliza selos.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === itemId && previous
      ? { certifications: previous.certifications, tmdbRating: previous.tmdbRating }
      : undefined,
  })
}

/**
 * Aba Semelhantes (feature 035, US1/US2 — `logic/aba-semelhantes.md`): deriva
 * o estado da aba da metadata JÁ obtida ao abrir o detalhe (nenhuma consulta
 * externa nova, FR-003/SC-005) e cruza os títulos com o catálogo guardado
 * (`resolveTmdbTitles`, só IndexedDB). `enabled` só com a aba ativa.
 */
export function useSimilarTitles(itemId: string | null, enabled: boolean): SimilarTabView {
  const item = useCatalogItem(itemId).data
  // Mesma chave da consulta que o detalhe já montou: o react-query a compartilha, nada novo é pedido.
  const metadata = useTitleMetadata(itemId).data
  const tmdbState = useTmdbStatus().data?.state
  const kind = item?.kind === 'movie' || item?.kind === 'series' ? item.kind : undefined
  const sourceId = item?.source_id
  const similar = metadata?.tmdbMatch === 'matched' ? metadata.similar : undefined

  const resolution = useQuery({
    queryKey: ['similar-titles', itemId],
    queryFn: () => resolveTmdbTitles(sourceId as string, similar ?? [], [kind as 'movie' | 'series']),
    enabled: enabled && kind !== undefined && !!sourceId && similar !== undefined && similar.length > 0,
    // Categorias abertas desde a última vez entram (mesmo padrão de "Todos").
    staleTime: 0,
  })

  const resolving = enabled && similar !== undefined && similar.length > 0 && resolution.data === undefined
  const status = similarTabStatus({ tmdbState, metadata, resolving })
  return {
    status,
    titles: status === 'ready' ? (resolution.data?.titles ?? []) : [],
    coverage: kind !== undefined ? resolution.data?.coverage[kind] : undefined,
  }
}

/**
 * Filmografia de uma pessoa do elenco (feature 035, US4). Só a página de ator
 * chama — a consulta nasce do OK na pessoa, nunca de foco. O resultado de erro
 * é dado (`status: 'error'`), não exceção: nada de falha é guardado no banco, e
 * "Tentar de novo" só refaz esta consulta.
 */
export function usePersonCredits(personId: number | null) {
  const language = useLanguage()
  return useQuery({
    queryKey: ['person-credits', personId, language],
    queryFn: () => loadPersonCredits(personId as number, { language }),
    enabled: personId !== null,
    retry: false,
  })
}

export interface PersonTitlesView {
  /** Encontrados primeiro; no máximo `FILMOGRAPHY_SHOWN_MAX`. */
  titles: ResolvedTitle[]
  coverage: { movie?: KindCoverage; series?: KindCoverage }
}

/** Filmografia cruzada com o catálogo guardado (só IndexedDB; `staleTime: 0` pega categorias abertas desde a última vez). */
export function usePersonTitles(personId: number | null, sourceId: string | null, credits: TmdbTitleRef[] | undefined) {
  return useQuery({
    queryKey: ['person-titles', personId, sourceId],
    queryFn: async (): Promise<PersonTitlesView> => {
      const resolution = await resolveTmdbTitles(sourceId as string, credits ?? [], ['movie', 'series'])
      return { titles: resolution.titles.slice(0, FILMOGRAPHY_SHOWN_MAX), coverage: resolution.coverage }
    },
    enabled: personId !== null && sourceId !== null && credits !== undefined,
    staleTime: 0,
  })
}

/**
 * Estado do TMDB (feature 032, US2): lê **só o IndexedDB**, nunca a rede —
 * seguro de chamar ao focar (o dock da Home o usa). Nunca carrega a chave
 * inteira, só a mascarada (FR-013).
 */
export function useTmdbStatus() {
  return useQuery({ queryKey: ['tmdb-status'], queryFn: () => getTmdbStatus() })
}

/** O estado do TMDB e a metadata já aberta dependem da chave: tudo é relido depois de mudá-la. */
function invalidateTmdb(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
  void queryClient.invalidateQueries({ queryKey: ['title-metadata'] })
  // Feature 057: a chave nova (ou testada) muda o que as fileiras Top 10/Dica podem mostrar — sem isto o "sem chave" ficaria em memória.
  void queryClient.invalidateQueries({ queryKey: ['tmdb-discovery'] })
}

/** Testa a chave contra o TMDB e só grava se aceita (FR-012). */
export function useSaveTmdbKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rawKey: string) => saveTmdbKey(rawKey),
    // A chave digitada é a `variables` da mutação: sem isto ela ficaria no
    // cache de mutações (em memória) por minutos depois de gravada.
    gcTime: 0,
    onSuccess: () => invalidateTmdb(queryClient),
  })
}

/** "Testar": refaz a autenticação com a chave guardada e atualiza o estado. */
export function useTestTmdbKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => testTmdbKey(),
    onSuccess: () => invalidateTmdb(queryClient),
  })
}

/**
 * Remove a chave e a metadata que veio do TMDB (FR-014). O banco já foi
 * limpo; aqui o cache em memória também é DESCARTADO (não só invalidado):
 * invalidar deixaria a sinopse do TMDB aparecer por um instante na próxima
 * abertura do detalhe, até a releitura terminar.
 */
export function useRemoveTmdbKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => removeTmdbKey(),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['title-metadata'] })
      queryClient.removeQueries({ queryKey: ['similar-titles'] })
      // Filmografias também vieram do TMDB: só invalidar mostraria o dado velho por um instante (FR-021).
      queryClient.removeQueries({ queryKey: ['person-credits'] })
      queryClient.removeQueries({ queryKey: ['person-titles'] })
      // Top 10 e Dica também vieram do TMDB (feature 057): descartar, para não mostrar a fileira velha por um instante.
      queryClient.removeQueries({ queryKey: ['tmdb-discovery'] })
      void queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
    },
  })
}

export async function fetchPlayback(itemId: string): Promise<CatalogItemPlayback> {
  const id = Number(itemId)
  const record = await getChannel(id, db)

  try {
    const url = await resolvePlaybackUrl(id, db)
    return {
      item_id: itemId,
      // O tipo real do item, não um valor fixo: é ele que decide o caminho
      // da URL no painel e o que a camada de reprodução pode oferecer.
      kind: record?.kind ?? 'channel',
      url,
      container_hint: record?.streamExtension ?? null,
      source_id: record?.sourceId ?? '',
      provider_stream_id: record?.providerStreamId ?? null,
      original_name: record?.originalName ?? '',
      series_id: record?.seriesId ?? null,
      season_number: record?.seasonNumber ?? null,
      episode_number: record?.episodeNumber ?? null,
      // Feature 058 (FR-001): só quando a lista declarou — segredo em potencial,
      // atravessa até o adaptador e morre lá.
      ...(record?.playbackHeaders ? { headers: record.playbackHeaders } : {}),
    }
  } catch (error) {
    // Item existe no catálogo mas não dá para montar a URL dele. É a mesma
    // situação que o backend sinalizava com 409: não adianta tentar de novo,
    // e a camada de reprodução já sabe dizer isso sem expor o motivo cru.
    if (error instanceof PlaybackUnavailableError) {
      throw new CatalogApiError(409, 'Item sem fonte de reprodução disponível.')
    }
    throw error
  }
}

/** O retorno de `fetchArchivePlayback`: o de `fetchPlayback` com `kind: 'archive'` e a variante usada. */
export type ArchivePlayback = Omit<CatalogItemPlayback, 'kind'> & {
  kind: 'archive'
  /** Variante de URL desta tentativa — a sessão lembra a que tocou. Opcional (o contrato a omite). */
  archive_variant?: ArchiveVariant
}

/**
 * Feature 058 (FR-010/FR-017, `logic/arquivo.md` §2/§3): a URL de arquivo do
 * programa `program` do canal `itemId`, montada na hora (nunca guardada) com a
 * variante pedida, ou a que a fonte aceitou por último (`rest` sem nenhuma).
 * Sem arquivo para o programa, sem item ou sem relógio do painel → 409 (a URL
 * nunca vai para o erro).
 */
export async function fetchArchivePlayback(
  itemId: string,
  program: ArchiveProgramRef,
  options?: { variant?: ArchiveVariant },
): Promise<ArchivePlayback> {
  const id = Number(itemId)
  const record = await getChannel(id, db)
  if (!record || record.kind !== 'channel' || !isArchiveAvailable(record.archiveDays, program, Date.now())) {
    throw new CatalogApiError(409, 'Item sem fonte de reprodução disponível.')
  }
  const source = await db.sources.get(record.sourceId)
  const variant = options?.variant ?? source?.archiveVariant ?? 'rest'
  const resolve = () => resolveArchivePlaybackUrl(id, program, variant, db)
  let url: string
  try {
    try {
      url = await resolve()
    } catch (error) {
      if (!(error instanceof ArchiveClockUnknownError)) throw error
      // Relógio ainda não lido (fonte sincronizada antes da 058): uma consulta
      // leve à conta, com o limite de 5 s da 034, grava o relógio — e tenta de novo.
      await checkSourceAccount(record.sourceId)
      url = await resolve()
    }
  } catch (error) {
    if (error instanceof PlaybackUnavailableError || error instanceof ArchiveClockUnknownError) {
      throw new CatalogApiError(409, 'Item sem fonte de reprodução disponível.')
    }
    throw error
  }
  return {
    item_id: itemId,
    kind: 'archive',
    url,
    container_hint: null,
    source_id: record.sourceId,
    provider_stream_id: record.providerStreamId ?? null,
    original_name: record.originalName,
    series_id: null,
    season_number: null,
    episode_number: null,
    archive_variant: variant,
  }
}

/**
 * O estado do usuário (favorito/progresso) de um item, por identidade
 * estável — nunca pela URL (feature 011, retomada).
 *
 * `null` cobre dois casos que a tela trata igual: sem identidade estável
 * (`stableId` nulo) e identidade que nunca teve estado gravado. Os dois
 * significam a mesma coisa pra ação primária: "Assistir", sem retomada.
 */
export function useUserState(stableId: string | null) {
  return useQuery({
    queryKey: ['user-state', stableId],
    queryFn: async (): Promise<UserStateRecord | null> => {
      if (!stableId) return null
      const state = await getUserState(stableId, db)
      return state ?? null
    },
    enabled: stableId !== null,
  })
}

/**
 * Invalida a leitura de `useUserState` para um item.
 *
 * Exportada (não inline na tela) de propósito: a camada de reprodução é
 * **camada**, não rota — a tela de detalhe continua montada por baixo
 * enquanto o filme toca, com a leitura de quando montou. Sem invalidar ao
 * fechar a camada, "Retomar" continuaria mostrando a posição antiga (ou
 * "Assistir", como se nada tivesse sido gravado) — `logic/
 * reproducao-vod.md` §5.1. A tela de séries (feature seguinte) reusa esta
 * mesma função em vez de inventar outra chave.
 */
export function invalidateUserState(queryClient: QueryClient, stableId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['user-state', stableId] })
  // Feature 025: a contagem/conteúdo de "↺ Histórico" também depende do
  // que acabou de ser gravado (`lastWatched`/`completedAt`).
  void queryClient.invalidateQueries({ queryKey: ['history-content'] })
}

/**
 * Um episódio, pronto pra tela (feature 012, `data-model.md` §5). Mesmo
 * espírito de `CatalogItemOut`, mas só o que a lista de episódios precisa —
 * sem os campos de grade (grupo, categoria) que não fazem sentido aqui.
 */
export interface EpisodeOut {
  id: string
  name: string
  season_number: number | null
  episode_number: number | null
  playable: boolean
  source_id: string
  provider_stream_id: string | null
  series_id: string
  original_name: string
  /** Imagem do episódio declarada pela fonte (feature 025). */
  icon_url?: string | null
  /** Duração declarada pela fonte, em segundos (feature 025) — denominador da barra de progresso. */
  duration_seconds?: number | null
  /** Sinopse do episódio declarada pelo provedor (feature 032, FR-028). `null` = não declarada. */
  synopsis?: string | null
}

function toEpisodeOut(record: CatalogRecord): EpisodeOut {
  return {
    id: String(record.id ?? ''),
    name: record.name,
    season_number: record.seasonNumber ?? null,
    episode_number: record.episodeNumber ?? null,
    playable: Boolean(record.directUrl) || Boolean(record.providerStreamId),
    source_id: record.sourceId,
    provider_stream_id: record.providerStreamId ?? null,
    series_id: record.seriesId ?? '',
    original_name: record.originalName,
    icon_url: record.iconUrl ?? null,
    duration_seconds: record.durationSeconds ?? null,
    synopsis: record.synopsis ?? null,
  }
}

export interface SeriesEpisodesContent {
  episodes: EpisodeOut[]
  outcome: SeriesFetchOutcome
}

/**
 * Garante (`seriesLoader.ensureSeriesEpisodes`) e lê os episódios de uma
 * série — o par de `useCategoryContent` (feature 010), mas por série em
 * vez de por categoria. `seriesItemId` é o id local do registro
 * `kind:'series'`, o mesmo que `useCatalogItem`/`fetchPlayback` recebem.
 */
export function useSeriesEpisodes(seriesItemId: string | null) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['series-episodes', seriesItemId],
    queryFn: async (): Promise<SeriesEpisodesContent> => {
      if (!seriesItemId) return { episodes: [], outcome: 'fresh' }
      const id = Number(seriesItemId)
      const series = await getChannel(id, db)
      if (!series || !series.seriesId) return { episodes: [], outcome: 'failed' }

      const result = await ensureSeriesEpisodes(id, { database: db })
      // Feature 032 (D-009): a mesma resposta que trouxe os episódios gravou a
      // metadata da série. `useTitleMetadata` não pergunta ao provedor enquanto
      // os episódios ainda vão ser buscados (senão seriam duas requisições
      // idênticas a cada série aberta) — então relê aqui, ao fim.
      if (result.outcome === 'fetched') {
        void queryClient.invalidateQueries({ queryKey: ['title-metadata', seriesItemId] })
      }
      const records = await listEpisodes(series.sourceId, series.seriesId, db)
      return { episodes: records.map(toEpisodeOut), outcome: result.outcome }
    },
    enabled: seriesItemId !== null,
  })
}

/**
 * Estado agregado "Em dia" por série (feature 019, D-008,
 * `logic/agregacao-serie.md`). Lê, numa única consulta local, TODOS os
 * episódios já conhecidos da fonte (`listAllEpisodes` — nunca chama
 * `ensureSeriesEpisodes`/rede, constitution "Comandos Locais Independem de
 * Rede"), agrupa por `seriesId`, lê os `UserStateRecord` correspondentes em
 * lote e aplica `summarizeSeriesWatched` por grupo.
 */
export function useSeriesWatchedSummary(sourceId: string | null) {
  return useQuery({
    queryKey: ['series-watched-summary', sourceId],
    queryFn: () => (sourceId ? loadSeriesWatchedSummaries(sourceId, db) : Promise.resolve(new Map<string, SeriesWatchedSummary>())),
    enabled: sourceId !== null,
  })
}

/**
 * O estado do usuário de vários itens de uma vez, na mesma ordem pedida —
 * a lista de episódios não lê um por um (feature 012).
 */
export function useUserStates(stableIds: (string | null)[]) {
  return useQuery({
    queryKey: ['user-states', ...stableIds],
    queryFn: async (): Promise<(UserStateRecord | null)[]> => {
      const validIds = stableIds.filter((id): id is string => id !== null)
      const states = await getUserStates(validIds, db)
      const byId = new Map(validIds.map((id, index) => [id, states[index]]))
      return stableIds.map((id) => (id === null ? null : (byId.get(id) ?? null)))
    },
    enabled: stableIds.length > 0,
  })
}

/**
 * Invalida todas as leituras de `useUserStates` — prefixo de chave, não uma
 * lista específica: fechar o player não sabe (nem precisa saber) qual
 * conjunto de episódios cada tela tinha em cache.
 */
export function invalidateUserStates(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['user-states'] })
  // Feature 025: idem `invalidateUserState`, para o fechamento de episódio.
  void queryClient.invalidateQueries({ queryKey: ['history-content'] })
  // O resumo agregado depende dos mesmos estados; sem esta invalidação a
  // vitrine pode conservar a contagem anterior até o staleTime da query.
  void queryClient.invalidateQueries({ queryKey: ['series-watched-summary'] })
}

/**
 * Tipos que a categoria virtual "Favoritos" cobre (feature 013). Episódio
 * fica de fora de propósito — série é o nível de favorito (D-009 do
 * plan.md), então `SeriesDetailScreen`/lista de episódios nunca passam
 * `onLongSelect`.
 */
export type FavoritableKind = 'channel' | 'movie' | 'series'

/**
 * O conjunto de `stableId`s favoritos de uma fonte e tipo — alimenta só a
 * estrela do cartão/linha (FR-010). Nunca resolve nada em registro do
 * catálogo: mover o foco sobre um item, ou sobre a entrada "Favoritos" da
 * trilha, não consulta nada além disto (constitution, "Foco Visível e Sem
 * Becos Sem Saída" — focar nunca dispara consulta a serviço externo; aqui
 * nem chega a ser externo, mas o princípio de não gastar em foco vale
 * igual, D-005 do plan.md).
 */
export function useFavoriteIds(sourceId: string | null, kind: FavoritableKind) {
  return useQuery({
    queryKey: ['favorite-ids', sourceId, kind],
    queryFn: async (): Promise<Set<string>> => {
      if (!sourceId) return new Set()
      const favorites = await listFavorites(sourceId, kind, db)
      return new Set(favorites.map((favorite) => favorite.stableId))
    },
    enabled: sourceId !== null,
  })
}

/**
 * O conjunto de `stableId`s assistidos de uma fonte e tipo (feature 019,
 * D-006) — mesmo padrão de `useFavoriteIds`: uma leitura local por
 * fonte/tipo, nunca uma consulta por card. Alimenta o selo "Assistido" na
 * grade de Filmes (SC-001).
 */
export function useWatchedIds(sourceId: string | null, kind: FavoritableKind) {
  return useQuery({
    queryKey: ['watched-ids', sourceId, kind],
    queryFn: async (): Promise<Set<string>> => {
      if (!sourceId) return new Set()
      const watched = await listWatched(sourceId, kind, db)
      return new Set(watched.map((state) => state.stableId))
    },
    enabled: sourceId !== null,
  })
}

/**
 * "↺ Histórico" de Filmes ou Séries (feature 025, FR-007, FR-009..FR-015,
 * `logic/historico.md` §5) — leitura local do que foi reproduzido
 * (`lastWatched`), agregada por série quando `kind === 'series'`.
 *
 * `enabled` reflete a regra da contagem na side nav: a consulta só liga
 * quando a pessoa já entrou em "↺ Histórico" nesta sessão
 * (`isHistoryKnown`, `vodSessionMemory.ts`) — nada é resolvido só por abrir
 * a tela. `gcTime: Infinity`: a contagem, uma vez conhecida, vale pela
 * sessão inteira; invalidações explícitas (`invalidateUserState`/
 * `invalidateUserStates`/`useToggleWatched`) é que a atualizam.
 */
export interface HistoryContent {
  items: CatalogItemOut[]
  /** Reproduções que não resolveram em nenhum registro exibível (FR-012). */
  unresolved: number
}

export function useHistoryContent(sourceId: string | null, kind: HistoryKind, enabled: boolean) {
  return useQuery({
    queryKey: ['history-content', sourceId, kind],
    queryFn: async (): Promise<HistoryContent> => {
      if (!sourceId) return { items: [], unresolved: 0 }
      const { records, unresolved } = await loadHistory(sourceId, kind, db)
      return { items: records.map((record) => toItemOut(record, record.kind)), unresolved }
    },
    enabled: sourceId !== null && enabled,
    gcTime: 30_000,
  })
}

/**
 * Posição de retomada por `stableId`, de uma fonte e tipo — uma leitura só,
 * nunca por card (feature 025, D-014, mesma forma de `useWatchedIds`).
 * Alimenta a hero band ("Continuar de mm:ss") sem disparar nada ao mudar o
 * foco.
 */
export function useResumePositions(sourceId: string | null, kind: FavoritableKind) {
  return useQuery({
    queryKey: ['resume-positions', sourceId, kind],
    queryFn: async (): Promise<Map<string, number>> => {
      if (!sourceId) return new Map()
      const prefix = `${sourceId}|${kind}|`
      const states = await getContinueWatching(sourceId, db)
      const positions = new Map<string, number>()
      for (const state of states) {
        if (state.stableId.startsWith(prefix) && state.progressSeconds) {
          positions.set(state.stableId, state.progressSeconds)
        }
      }
      return positions
    },
    enabled: sourceId !== null,
  })
}

/**
 * Itens (filme/episódio) com progresso de retomada nesta fonte, mais
 * recente primeiro (feature 019, D-009, FR-012/FR-013). `getContinueWatching`
 * já filtra por `progressSeconds > 0` — um item concluído (sem retomada)
 * nunca chega aqui. Itens sem correspondência no catálogo atual (fonte/
 * categoria removida) são omitidos por `resolveContinueWatching`, nunca
 * quebram a lista inteira (D-016/FR-016).
 */
export function useContinueWatchingContent(sourceId: string | null) {
  return useQuery({
    queryKey: ['continue-watching', sourceId],
    queryFn: async (): Promise<CatalogItemOut[]> => {
      if (!sourceId) return []
      const states = await getContinueWatching(sourceId, db)
      const records = await resolveContinueWatching(sourceId, states, db)
      return records.map((record) => toItemOut(record, record.kind))
    },
    enabled: sourceId !== null,
  })
}

/**
 * Um card de "Continuar assistindo" do Início com o que a legenda e a barra precisam (feature 060, FR-010 —
 * `logic/cards-e-expansao.md` §6). `progress` só existe com posição de retomada válida E duração conhecida
 * (`primaryProgress`); sem um dos dois não há barra nem "faltam" (constitution: progresso real).
 */
export interface ContinueCard {
  item: CatalogItemOut
  /** Código do episódio em andamento (`T1:E3`); `null` para filme ou episódio sem temporada/número gravados. */
  code: string | null
  progress: PrimaryProgress | null
}

/**
 * "Continuar assistindo" do Início com progresso. Mesma resolução de `useContinueWatchingContent` (mais recente primeiro,
 * episódio vira a série-pai), mais o episódio e a duração: filme = duração da metadata JÁ guardada (`titleMetadata`);
 * série = duração do episódio declarada pela fonte e gravada com ele. Só leitura local, nunca rede.
 */
export function useContinueCards(sourceId: string | null) {
  return useQuery({
    // Prefixo de `['continue-watching', sourceId]`: `HomeScreen.closePlayer` o invalida junto com a lista.
    queryKey: ['continue-watching', sourceId, 'cards'],
    queryFn: async (): Promise<ContinueCard[]> => {
      if (!sourceId) return []
      const states = await getContinueWatching(sourceId, db)
      const entries = await resolveContinueEntries(sourceId, states, db)
      const items = entries.map((entry) => toItemOut(entry.record, entry.record.kind))
      const movieStableIds = items.map((item) => (item.kind === 'movie' ? stableIdOf(item) : null))
      const metadata = await db.titleMetadata.bulkGet(movieStableIds.map((id) => id ?? ''))
      return entries.map((entry, index): ContinueCard => {
        const { episode, state } = entry
        let duration: number | undefined
        if (episode) {
          duration = episode.durationSeconds
        } else {
          const record = metadata[index]
          duration = record?.provider?.durationSeconds ?? (record?.tmdb?.status === 'matched' ? record.tmdb.fields.durationSeconds : undefined)
        }
        const hasCode = episode?.seasonNumber !== undefined && episode.episodeNumber !== undefined
        return {
          item: items[index],
          code: hasCode ? `T${episode?.seasonNumber}:E${episode?.episodeNumber}` : null,
          progress: primaryProgress(state.progressSeconds, duration),
        }
      })
    },
    enabled: sourceId !== null,
  })
}

/**
 * Hero do Início pronto para a tela (feature 026, FR-002..FR-006) — o
 * `HomeHero` de `lib/catalog/homeHero.ts` com o registro já convertido em
 * `CatalogItemOut`.
 */
export type HomeHeroOut =
  | { kind: 'continue' | 'favorite'; item: CatalogItemOut; primary: HeroPrimary }
  | { kind: 'welcome' }

/**
 * Leitura local do hero (`loadHomeHero`). Chave `['home-hero', sourceId]` —
 * invalidada junto de "Continuar assistindo"/favoritos (`logic/hero-home.md`
 * §5).
 */
export function useHomeHero(sourceId: string | null) {
  return useQuery({
    queryKey: ['home-hero', sourceId],
    queryFn: async (): Promise<HomeHeroOut> => {
      if (!sourceId) return { kind: 'welcome' }
      const hero = await loadHomeHero(sourceId, db)
      if (hero.kind === 'welcome') return hero
      return { kind: hero.kind, item: toItemOut(hero.record, hero.record.kind), primary: hero.primary }
    },
    enabled: sourceId !== null,
  })
}

export interface MyListContent {
  items: CatalogItemOut[]
  /** Contagem real de favoritos de filme RESOLVIDOS (FR-014) — nunca a bruta gravada. */
  movieCount: number
  /** Idem, de série. */
  seriesCount: number
}

/**
 * "Minha Lista" do Início (feature 026, `logic/foco-home.md` §6): favoritos
 * de filme E série da fonte, misturados por `favoritedAt` desc (mais recente
 * primeiro, entre os dois tipos). Resolve item a item, como
 * `resolveContinueWatching` — a lista de favoritos é pequena (dezenas a
 * centenas), nunca o catálogo inteiro.
 */
export function useMyListContent(sourceId: string | null) {
  return useQuery({
    queryKey: ['my-list-content', sourceId],
    queryFn: async (): Promise<MyListContent> => {
      if (!sourceId) return { items: [], movieCount: 0, seriesCount: 0 }
      const favorites = await getGlobalFavorites(db)

      const all = favorites
        .filter((favorite) => favorite.sourceId === sourceId)
        .map((favorite) => parseStableId(favorite.stableId))
        .filter((parts): parts is StableIdParts => parts?.kind === 'movie' || parts?.kind === 'series')
      // Uma resolução por tipo (uma passada pelos blocos), nunca uma por
      // favorito — um favorito que não resolve custaria uma varredura inteira.
      const resolved = new Map<StableIdParts, CatalogRecord>()
      for (const kind of ['movie', 'series'] as const) {
        const group = all.filter((parts) => parts.kind === kind)
        if (group.length === 0) continue
        for (const [parts, record] of await resolveStableIds(sourceId, kind, group, db)) resolved.set(parts, record)
      }

      const items: CatalogItemOut[] = []
      let movieCount = 0
      let seriesCount = 0
      for (const parts of all) {
        const record = resolved.get(parts)
        if (!record) continue

        items.push(toItemOut(record, record.kind))
        if (record.kind === 'movie') movieCount += 1
        else if (record.kind === 'series') seriesCount += 1
      }
      return { items, movieCount, seriesCount }
    },
    enabled: sourceId !== null,
  })
}
/**
 * Índice da busca global (feature 026, `logic/busca-global.md` §2) — os três
 * tipos de uma vez. `staleTime: 0` + `refetchOnMount: 'always'`: mesmo
 * padrão de `useAggregatedItems` — categorias abertas desde a última vez
 * entram na próxima busca.
 */
export function useGlobalSearchIndex(sourceId: string | null) {
  return useQuery({
    queryKey: ['global-search-index', sourceId],
    queryFn: () => loadGlobalSearchIndex(sourceId as string, db),
    enabled: sourceId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30_000,
  })
}

export interface GlobalSearchResultOut {
  channels: CatalogItemOut[]
  movies: CatalogItemOut[]
  series: CatalogItemOut[]
  /** "Busca em X de Y categorias" (FR-038) — soma dos três tipos, sempre presente, mesmo com termo curto. */
  coveredCategories: number
  totalCategories: number
}

const EMPTY_GLOBAL_SEARCH_RESULT: GlobalSearchResultOut = {
  channels: [],
  movies: [],
  series: [],
  coveredCategories: 0,
  totalCategories: 0,
}

/**
 * `searchGlobal` (puro, `lib/catalog/globalSearch.ts`) já convertido em
 * `CatalogItemOut` — a tela de Busca (feature 026, US3) nunca fala com
 * `CatalogRecord` direto (mesmo motivo de D-001: telas só falam com
 * `catalogApi`). Sem debounce (FR-039, clarificação) — recalcula a cada
 * tecla, client-side, sobre o índice já carregado.
 */
export function useGlobalSearchResult(
  sourceId: string | null,
  term: string,
): { data: GlobalSearchResultOut; isLoading: boolean } {
  const indexQuery = useGlobalSearchIndex(sourceId)

  const data = useMemo(() => {
    if (!indexQuery.data) return EMPTY_GLOBAL_SEARCH_RESULT
    const result = searchGlobal(indexQuery.data, term)
    return {
      channels: result.channels.map((record) => toItemOut(record, 'channel')),
      movies: result.movies.map((record) => toItemOut(record, 'movie')),
      series: result.series.map((record) => toItemOut(record, 'series')),
      coveredCategories: result.coveredCategories,
      totalCategories: result.totalCategories,
    }
  }, [indexQuery.data, term])

  return { data, isLoading: indexQuery.isLoading }
}

export interface AggregatedItems {
  /** Todos os itens do tipo já lidos no aparelho, de todas as categorias já cobertas — sem filtro. */
  items: CatalogItemOut[]
  /** Categorias do tipo com conteúdo já no aparelho (FR-010/FR-014 da feature 018). */
  coveredCategories: number
  /** Todas as categorias do tipo na geração ativa. */
  totalCategories: number
  isLoading: boolean
  /**
   * Só no modo `progressive` (feature 039, T022): há mais categorias a ler
   * depois de `items`. Ausente = a lista já é o tipo inteiro.
   */
  hasMore?: boolean
  /** Lê a próxima página (sem efeito se já está lendo ou acabou). */
  loadMore?: () => void
}

/**
 * Tamanho mínimo de uma página de "Todos" aos poucos (feature 039, T022): uma
 * página junta categorias inteiras até passar disto — ~40 fileiras da grade.
 */
const ALL_PAGE_MIN_ITEMS = 240

/**
 * Itens da categoria virtual "Todos" (feature 018, D-005) — reaproveita o
 * mesmo índice agregado de `useCatalogSearch`/`loadSearchIndex`, mas SEM
 * aplicar filtro de termo: quem quiser filtrar chama `searchWithinItems`
 * (catalogSearch.ts) por cima do array devolvido aqui, client-side. `enabled`
 * só é verdadeiro com "Todos" entrada — fora dela, nada é lido.
 */
export function useAggregatedItems(
  sourceId: string | null,
  kind: FavoritableKind,
  enabled: boolean,
  options: { progressive?: boolean } = {},
): AggregatedItems {
  const progressive = options.progressive === true
  // `refetchOnMount: 'always'` + `staleTime: 0`: cada entrada em "Todos" relê
  // o índice — categorias abertas desde a última vez entram na lista e na
  // cobertura (mesmo padrão de `useCatalogSearch`, D-005 do plan.md).
  const indexQuery = useQuery({
    queryKey: ['catalog-search-index', sourceId, kind],
    queryFn: () => loadSearchIndex(sourceId as string, kind as SearchableKind),
    enabled: enabled && !progressive && sourceId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30_000,
  })

  // Feature 039 (T022): "Todos" na ordem da fonte lê aos poucos — só as
  // categorias até onde a pessoa desceu ficam na memória; a grade virtualizada
  // pede a próxima página perto do fim (`loadMore`). Ordenar e buscar precisam
  // do tipo inteiro e continuam no índice acima.
  const pagesQuery = useInfiniteQuery({
    queryKey: ['catalog-all-pages', sourceId, kind],
    queryFn: async ({ pageParam }: { pageParam: KindCursor | undefined }) => {
      const [page, categories] = await Promise.all([
        readKindCursorPage(sourceId as string, kind, pageParam, ALL_PAGE_MIN_ITEMS),
        pageParam === undefined ? listCategories(sourceId as string, kind) : Promise.resolve(undefined),
      ])
      const items = page.items.map((record) => toItemOut(record, kind))
      const coverage = categories
        ? { coveredCategories: categories.filter(isCovered).length, totalCategories: categories.length }
        : undefined
      return { items, next: page.next, coverage }
    },
    initialPageParam: undefined as KindCursor | undefined,
    getNextPageParam: (last) => last.next,
    enabled: enabled && progressive && sourceId !== null,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const indexItems = useMemo(() => {
    if (!indexQuery.data) return []
    return indexQuery.data.entries.map((entry) => toItemOut(entry.record, kind))
  }, [indexQuery.data, kind])
  const pageItems = useMemo(() => pagesQuery.data?.pages.flatMap((page) => page.items) ?? [], [pagesQuery.data])

  const { hasNextPage, isFetching, fetchNextPage } = pagesQuery
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) void fetchNextPage()
  }, [hasNextPage, isFetching, fetchNextPage])

  if (progressive) {
    const coverage = pagesQuery.data?.pages[0]?.coverage
    return {
      items: pageItems,
      coveredCategories: coverage?.coveredCategories ?? 0,
      totalCategories: coverage?.totalCategories ?? 0,
      isLoading: pagesQuery.isLoading,
      hasMore: hasNextPage,
      loadMore,
    }
  }
  return {
    items: indexItems,
    coveredCategories: indexQuery.data?.coveredCategories ?? 0,
    totalCategories: indexQuery.data?.totalCategories ?? 0,
    isLoading: indexQuery.isLoading,
  }
}

/** Quanto tempo as seleções da vitrine valem em memória (`useRecentlyAdded`, `useTopRated`). */
const SHOWCASE_STALE_MS = 60_000
/** Registros entre duas cessões da thread na passada das vitrines. */
const SHOWCASE_SLICE = 2000

interface ShowcaseSelections {
  recent: CatalogItemOut[]
  rated: CatalogItemOut[]
  coveredCategories: number
  totalCategories: number
  entries?: DiscoveryEntries // com chave TMDB: índice compacto para o Top 10/Dica cruzarem na MESMA passada
}

/**
 * Feature 065 (D-005, FR-006): uma passada pelo tipo, bloco a bloco, cedendo a thread em fatias — retém só os 12 mais novos e
 * os candidatos de "Bem avaliados", nunca o tipo inteiro (antes: `loadSearchIndex` + seleção síncrona no `select`). Mesmas
 * regras e desempates: a ordem da passada é a de `listAllOfKind` (categoria na ordem da fonte, itens na ordem do bloco).
 */
async function loadShowcaseSelections(sourceId: string, kind: FavoritableKind & StoredKind, now: number, signal: AbortSignal, withEntries: boolean): Promise<ShowcaseSelections> {
  const categories = await listCategories(sourceId, kind)
  const recent = createRecentlyAddedAccumulator((record: CatalogRecord) => record.addedAt)
  const rated = createRatedSelectionAccumulator<CatalogRecord>(
    { id: (record) => String(record.id), name: (record) => record.name, rating: (record) => record.providerRating, year: (record) => record.year, addedAt: (record) => record.addedAt },
    { now, seed: `${dayKey(now)}|${kind}|${sourceId}` },
  )
  const compact: CatalogRecord[] | undefined = withEntries ? [] : undefined
  let sinceYield = 0
  for await (const records of iterateKindRecordBatches(sourceId, kind, { signal, pageSize: SHOWCASE_SLICE })) {
    for (const record of records) {
      recent.add(record)
      rated.add(record)
      compact?.push(compactSearchRecord(record))
    }
    sinceYield += records.length
    if (sinceYield >= SHOWCASE_SLICE) {
      sinceYield = 0
      await yieldToMain()
    }
  }
  const steps = rated.finishSteps(SHOWCASE_SLICE)
  let step = steps.next()
  while (!step.done) {
    if (signal.aborted) throw new DOMException('Seleção cancelada.', 'AbortError')
    await yieldToMain()
    step = steps.next()
  }
  return {
    recent: recent.finish().map((record) => toItemOut(record, kind)),
    rated: step.value.picked.map((record) => toItemOut(record, kind)),
    coveredCategories: categories.filter(isCovered).length,
    totalCategories: categories.length,
    entries: compact && buildSearchIndex(compact, { coveredCategories: 0, totalCategories: 0 }).entries,
  }
}

/** Vitrine do tipo: a chave fica sob `catalog-search-index`, então a pré-carga e a sincronização a invalidam junto com o índice. */
function useShowcaseSelections(sourceId: string | null, kind: FavoritableKind, enabled: boolean) {
  // Fixado por montagem: a virada do dia com a tela aberta não troca os cards sob o foco.
  const [now] = useState(() => Date.now())
  const tmdbStatus = useTmdbStatus() // status ilegível conta como "sem chave": as fileiras locais nunca esperam por ele
  const withEntries = tmdbStatus.data !== undefined && tmdbStatus.data.state !== 'not_configured'
  return useQuery({
    queryKey: ['catalog-search-index', sourceId, kind, 'showcase', dayKey(now), withEntries],
    queryFn: ({ signal }) => loadShowcaseSelections(sourceId as string, kind as FavoritableKind & StoredKind, now, signal, withEntries),
    enabled: enabled && sourceId !== null && kind !== 'channel' && (tmdbStatus.data !== undefined || tmdbStatus.isError),
    // Não relê o tipo a cada montagem da tela: a pré-carga (categoria nova) e o fim de uma sincronização a invalidam.
    staleTime: SHOWCASE_STALE_MS,
    gcTime: 30_000,
  })
}

/**
 * "Adicionados recentemente" da vitrine (feature 052, FR-003): até 12 itens do tipo, do mais novo ao mais antigo, só
 * do que o app já obteve; nenhuma consulta ao provedor.
 */
export function useRecentlyAdded(
  sourceId: string | null,
  kind: FavoritableKind,
  /** Feature 060 (D-013): `false` adia a leitura (o Início só a pede depois do 1º desenho); o padrão é ler já. */
  enabled = true,
): { data: CatalogItemOut[] | undefined; coveredCategories?: number; totalCategories?: number; isLoading: boolean } {
  const query = useShowcaseSelections(sourceId, kind, enabled)
  return {
    data: query.data?.recent,
    coveredCategories: query.data?.coveredCategories,
    totalCategories: query.data?.totalCategories,
    isLoading: query.isLoading,
  }
}

/**
 * "Bem avaliados" da vitrine (feature 056, FR-002..FR-004): os títulos de maior nota do provedor entre os já obtidos no
 * aparelho (mesma passada de `useRecentlyAdded`, sem rede) e a cobertura de categorias para o aviso de escopo parcial.
 * `data` é `[]` quando há menos de `RATED_MIN` títulos com nota — `logic/bem-avaliados.md` §3.
 */
export function useTopRated(
  sourceId: string | null,
  kind: FavoritableKind,
): { data: CatalogItemOut[] | undefined; coveredCategories: number; totalCategories: number; isLoading: boolean } {
  const query = useShowcaseSelections(sourceId, kind, true)
  return {
    data: query.data?.rated,
    coveredCategories: query.data?.coveredCategories ?? 0,
    totalCategories: query.data?.totalCategories ?? 0,
    isLoading: query.isLoading,
  }
}

/** Um título do Top 10 da semana já cruzado com a lista: o item da lista e a posição REAL no ranking do TMDB (feature 057). */
export interface DiscoveryPick {
  item: CatalogItemOut
  rank: number
}

type DiscoveryEntries = Awaited<ReturnType<typeof loadSearchIndex>>['entries']
type DiscoveryContext = { now: number; seed: string; kind: DiscoveryKind }

/**
 * Retorno de `useWeeklyTop10`/`useDailyTip`. `images` (feature 060) = fundo 16:9 por id de item que já veio nas respostas do
 * TMDB — opcional para quem consome (mocks de testes antigos não o devolvem) e sempre local, nunca uma consulta nova.
 */
export interface DiscoveryRowResult<R> {
  data: R | undefined
  images?: ReadonlyMap<string, string>
  /** Nota que já veio com a descoberta (061), sem consulta ao focar. */
  ratings?: ReadonlyMap<string, TmdbRating>
  coveredCategories: number
  totalCategories: number
  isLoading: boolean
}

const DISCOVERY_READ = {
  id: (entry: DiscoveryEntries[number]) => String(entry.record.id),
  // Nome como a fonte declarou (com `[L]`, `4K`...), como o cruzamento da 035.
  name: (entry: DiscoveryEntries[number]) => entry.record.originalName,
  year: (entry: DiscoveryEntries[number]) => entry.record.year,
  rating: (entry: DiscoveryEntries[number]) => entry.record.providerRating,
  addedAt: (entry: DiscoveryEntries[number]) => entry.record.addedAt,
}

/**
 * Base de `useWeeklyTop10`/`useDailyTip` (feature 057, `logic/descoberta.md` §6): os títulos do TMDB (cache + no máximo uma
 * consulta por período, ao abrir a tela — nunca por foco) cruzados com o índice local de busca, que é o mesmo de
 * `useTopRated`/`useRecentlyAdded` (mesma `queryKey`). Sem títulos do TMDB (sem chave, sem cache) o índice nem é lido.
 */
function useDiscoveryRow<R>(
  source: 'trending' | 'pool',
  sourceId: string | null,
  kind: DiscoveryKind,
  project: (matches: MatchedTitle<DiscoveryEntries[number]>[], context: DiscoveryContext) => R,
): DiscoveryRowResult<R> {
  const queryClient = useQueryClient()
  // O idioma do app entra na chave (feature 054); o que o TMDB devolveu em outro idioma não vale como se fosse o atual.
  const language = useLanguage()
  // Fixado por montagem da tela: a virada do dia com a tela aberta não troca cards sob o foco.
  const [now] = useState(() => Date.now())
  const tmdb = useQuery({
    queryKey: ['tmdb-discovery', source, kind, language],
    queryFn: async ({ signal }) => {
      const result = await (source === 'trending' ? loadWeeklyTrending : loadTipPool)(kind, { language, signal })
      // O carregador pode ter mudado o estado do TMDB (chave recusada, limite): Integrações e dock releem.
      void queryClient.invalidateQueries({ queryKey: ['tmdb-status'] })
      return result
    },
    enabled: sourceId !== null,
    // Resultado vigente vale 30 min (o carregador decide pelo período; isto só evita reler o Dexie a cada montagem). Sem chave,
    // sem rede ou vencido, o próximo uso da tela tenta de novo (uma leitura local, no máximo uma consulta).
    staleTime: (query) => (query.state.data?.status === 'ok' && !query.state.data.stale ? 30 * 60 * 1000 : 0),
  })
  const titles = tmdb.data?.titles
  const index = useShowcaseSelections(sourceId, kind, titles !== undefined && titles.length > 0) // 065: mesma passada das vitrines

  // O cruzamento NÃO roda na renderização (nem no `select` do react-query): com a lista real ele prendia a thread por ≈200 ms
  // e atrasava o primeiro desenho. Roda depois do desenho, em fatias que cedam a thread (`matchDiscoveryTitlesAsync`), e o
  // índice dos registros é montado uma vez para o Top 10 e a Dica do mesmo tipo. Enquanto recalcula (categoria nova, outro
  // dia) fica o resultado anterior da MESMA lista, para a fileira e o foco não piscarem.
  const scope = `${sourceId}|${kind}`
  const [computed, setComputed] = useState<
    { scope: string; value: R; images: ReadonlyMap<string, string>; ratings: ReadonlyMap<string, TmdbRating>; coveredCategories: number; totalCategories: number } | undefined
  >()
  const showcase = index.data
  const indexData = useMemo(() => (showcase?.entries ? { ...showcase, entries: showcase.entries } : undefined), [showcase])
  useEffect(() => {
    if (sourceId === null || indexData === undefined || titles === undefined || titles.length === 0) return
    const controller = new AbortController()
    void matchDiscoveryTitlesAsync(titles, indexData.entries, DISCOVERY_READ, { signal: controller.signal }).then((matches) => {
      // Feature 060: o fundo 16:9 que já veio com cada título do TMDB, por id do item da lista (sem consulta nova).
      const images = new Map<string, string>()
      const ratings = new Map<string, TmdbRating>()
      for (const match of matches) {
        if (match.title.backdropUrl !== undefined) images.set(DISCOVERY_READ.id(match.local), match.title.backdropUrl)
        ratings.set(DISCOVERY_READ.id(match.local), { average: match.title.voteAverage, votes: match.title.voteCount })
      }
      setComputed({
        scope,
        value: project(matches, { now, seed: `${dayKey(now)}|${kind}|${sourceId}`, kind }),
        images,
        ratings,
        coveredCategories: indexData.coveredCategories,
        totalCategories: indexData.totalCategories,
      })
    }).catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError')) throw error
    })
    return () => controller.abort()
  }, [indexData, titles, scope, sourceId, kind, now, project])

  const settledEmpty = tmdb.data !== undefined && tmdb.data.titles.length === 0
  const current = computed?.scope === scope ? computed : undefined
  return {
    data: settledEmpty ? (project([], { now, seed: '', kind }) as R) : current?.value,
    images: current?.images ?? EMPTY_BACKDROPS,
    ratings: current?.ratings,
    coveredCategories: current?.coveredCategories ?? 0,
    totalCategories: current?.totalCategories ?? 0,
    isLoading: tmdb.isLoading || index.isLoading,
  }
}
function projectTop10(matches: MatchedTitle<DiscoveryEntries[number]>[], context: DiscoveryContext): DiscoveryPick[] {
  return selectTop10(matches).map(({ local, rank }) => ({ item: toItemOut(local.record, context.kind), rank }))
}

function projectTip(matches: MatchedTitle<DiscoveryEntries[number]>[], context: DiscoveryContext): CatalogItemOut[] {
  return selectTip(matches, { now: context.now, seed: context.seed }).map((local) => toItemOut(local.record, context.kind))
}

/**
 * Top 10 da semana (feature 057, FR-001..FR-004, FR-013..FR-016 — `logic/descoberta.md` §6): o ranking semanal do TMDB cruzado
 * com a lista. `data` é `[]` quando não há `TOP10_MIN` cruzados, sem chave ou sem cache.
 */
export function useWeeklyTop10(
  sourceId: string | null,
  kind: 'movie' | 'series',
): DiscoveryRowResult<DiscoveryPick[]> {
  return useDiscoveryRow('trending', sourceId, kind, projectTop10)
}

/**
 * Dica do dia (feature 057, FR-005..FR-008 — `logic/descoberta.md` §6): candidatos do TMDB cruzados com a lista e sorteados com
 * semente do dia. `data` é `[]` quando não há `TIP_MIN` candidatos válidos.
 */
export function useDailyTip(
  sourceId: string | null,
  kind: 'movie' | 'series',
): DiscoveryRowResult<CatalogItemOut[]> {
  return useDiscoveryRow('pool', sourceId, kind, projectTip)
}

/** Prévia de uma categoria para o carrossel da tela hero (feature 053): `pending` = ainda não obtida no aparelho. */
export interface CategoryPreview {
  status: 'pending' | 'ready' | 'empty'
  /** Até `PREVIEW_LIMIT` itens, na ordem da fonte. Vazio fora de `ready`. */
  items: CatalogItemOut[]
}

/**
 * Prévia, SÓ DO APARELHO, das categorias informadas (as que estão na janela da tela hero): lê o bloco da categoria
 * (`getActiveCategoryBlock`, ou as linhas antigas) e devolve os primeiros itens; nunca chama `ensureCategory` nem rede.
 * Chave `['category-preview', sourceId, categoryId]`, invalidada pela pré-carga (038) quando a categoria chega.
 */
export function useCategoryPreviews(
  sourceId: string | null,
  categories: readonly CatalogCategory[],
): ReadonlyMap<number, CategoryPreview> {
  // Um único `useQuery` para a janela inteira (a tela renderiza a cada tecla e a janela desliza: `useQueries` com um
  // conjunto de observadores que muda a cada tecla chegou a estourar "Maximum update depth" numa descida longa). O cache
  // por categoria fica dentro (`fetchQuery`, chave `['category-preview', sourceId, id]`), então deslizar a janela não
  // relê o disco de quem já foi lido há pouco; a pré-carga invalida as duas camadas (`createPrefetchInvalidator`).
  const queryClient = useQueryClient()
  const idsKey = categories.map((category) => category.id).join(',')
  const query = useQuery({
    queryKey: categoryPreviewWindowKey(sourceId, idsKey),
    queryFn: async (): Promise<Map<number, CategoryPreview>> => {
      const loaded = await Promise.all(
        categories.map(async (category) => {
          const preview = await queryClient.fetchQuery({
            queryKey: categoryPreviewKey(sourceId, category.id),
            queryFn: () => loadCategoryPreview(sourceId as string, category),
            staleTime: PREVIEW_STALE_MS,
            gcTime: 30_000,
          })
          return [category.id, preview] as const
        }),
      )
      return new Map(loaded)
    },
    enabled: sourceId !== null && categories.length > 0,
    placeholderData: keepPreviousData,
  })
  return query.data ?? EMPTY_PREVIEWS
}
const EMPTY_PREVIEWS: ReadonlyMap<number, CategoryPreview> = new Map()
/** Dentro desta janela a prévia de uma categoria já lida não é relida ao deslizar. */
const PREVIEW_STALE_MS = 10_000

export function categoryPreviewWindowKey(sourceId: string | null, idsKey: string) {
  return ['category-preview', sourceId, 'window', idsKey] as const
}
/**
 * Imagem horizontal (backdrop) já guardada no cache de metadata, por id de item (feature 053, D-006): leitura SÓ local
 * (`titleMetadata`), sem consulta nova — o `wide` da tela hero só usa o que a pessoa já abriu antes num detalhe.
 */
export function useCachedBackdrops(items: readonly CatalogItemOut[]): ReadonlyMap<string, string> {
  const pairs: { itemId: string; stableId: string }[] = []
  for (const item of items) {
    const stableId = stableIdOf(item)
    if (stableId) pairs.push({ itemId: item.id, stableId })
  }
  const key = pairs.map((pair) => pair.stableId).join('|')
  const query = useQuery({
    queryKey: ['cached-backdrops', key],
    queryFn: async (): Promise<Map<string, string>> => {
      const records = await db.titleMetadata.bulkGet(pairs.map((pair) => pair.stableId))
      const found = new Map<string, string>()
      records.forEach((record, index) => {
        const url = record?.provider?.backdropUrl ?? (record?.tmdb?.status === 'matched' ? record.tmdb.fields.backdropUrl : undefined)
        if (url) found.set(pairs[index].itemId, url)
      })
      return found
    },
    enabled: pairs.length > 0,
    gcTime: 30_000,
  })
  return query.data ?? EMPTY_BACKDROPS
}
const EMPTY_BACKDROPS: ReadonlyMap<string, string> = new Map()

/**
 * A metadata já guardada de um título (sinopse, duração, gêneros), lida SÓ do cache local (`titleMetadata`) — o card
 * expandido do Início a usa ao receber o foco (feature 060, FR-009): nunca consulta o provedor nem o TMDB, e sem registro
 * devolve a visão vazia (a linha simplesmente não aparece).
 */
export function useCachedTitleView(item: CatalogItemOut | null): TitleMetadataView | undefined {
  const language = useLanguage()
  const stableId = item ? stableIdOf(item) : null
  const query = useQuery({
    queryKey: ['cached-title-view', stableId, language],
    queryFn: async (): Promise<TitleMetadataView> => {
      const record = await db.titleMetadata.get(stableId as string)
      return mergeTitleMetadata(record?.provider, record?.tmdb, language)
    },
    enabled: stableId !== null,
    staleTime: 60_000,
  })
  return query.data
}

/**
 * Imagem 16:9 de cada item do Início (feature 060, D-006 — `logic/fileiras-e-dados.md` §1), só do que já está no aparelho,
 * pela primeira que existir: fundo da listagem (série, 055) → backdrop guardado no cache de metadata (053) → o que veio com a
 * fileira (`extra`: respostas do TMDB do Top 10, da Dica e de Semelhantes). Item sem nenhuma não entra no mapa: o card cai no
 * pôster + cor da capa. Nunca uma consulta.
 */
export function useHomeImages(
  items: readonly CatalogItemOut[],
  extra?: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const cached = useCachedBackdrops(items)
  return useMemo(() => {
    const images = new Map<string, string>()
    for (const item of items) {
      const url = item.provider_backdrop_url ?? cached.get(item.id) ?? extra?.get(item.id)
      if (url) images.set(item.id, url)
    }
    return images
  }, [items, cached, extra])
}

/** Itens por carrossel de categoria na tela hero (feature 053). */
export const PREVIEW_LIMIT = 12

export function categoryPreviewKey(sourceId: string | null, categoryId: number) {
  return ['category-preview', sourceId, categoryId] as const
}

/**
 * Lê só do aparelho (nunca `ensureCategory`/rede): bloco da categoria (feature 039) ou, no formato antigo, as primeiras
 * linhas. Sem nada gravado = ainda não obtida (`pending`); a pré-carga 038 é quem a traz.
 */
async function loadCategoryPreview(sourceId: string, category: CatalogCategory): Promise<CategoryPreview> {
  const projected = await readCategoryWindow(sourceId, category.id, 0, PREVIEW_LIMIT)
  if (projected.items.length > 0) return { status: 'ready', items: projected.items.map((record) => toItemOut(record, category.kind)) }
  const block = await getActiveCategoryBlock(sourceId, category.id)
  if (block) {
    const items = block.items.slice(0, PREVIEW_LIMIT).map((item, index) => blockItemOut(block, item, index, category.kind))
    return { status: items.length > 0 ? 'ready' : 'empty', items }
  }
  const records = await listChannels(sourceId, category.order, 0, PREVIEW_LIMIT, category.kind)
  if (records.length === 0) return { status: 'pending', items: [] }
  return { status: 'ready', items: records.map((record) => toItemOut(record, category.kind)) }
}

export interface FavoritesContent {
  items: CatalogItemOut[]
  /**
   * Quantos favoritos gravados não resolveram em nenhum registro da
   * geração ativa (categoria ainda não obtida, ou item que saiu da fonte)
   * — nunca vira cartão inventado nem entra na contagem de `items`
   * (FR-009, princípio "Progresso e Capacidades São Reais").
   */
  unresolved: number
}

/**
 * Conteúdo da categoria virtual "Favoritos" de uma fonte e tipo.
 *
 * Só resolve favorito em registro do catálogo quando `enabled` — a pessoa
 * **entrou** na categoria (mesmo contrato de `useCategoryContent`, D-005):
 * focar a entrada "Favoritos" na trilha nunca chama isto habilitada.
 */
export function useFavoritesContent(sourceId: string | null, kind: FavoritableKind, enabled: boolean) {
  return useQuery({
    queryKey: ['favorites-content', sourceId, kind],
    queryFn: async (): Promise<FavoritesContent> => {
      if (!sourceId) return { items: [], unresolved: 0 }
      const favorites = await listFavorites(sourceId, kind, db)
      const parsed = favorites
        .map((favorite) => parseStableId(favorite.stableId))
        .filter((parts): parts is NonNullable<typeof parts> => parts !== null)
      const { records, unresolved } = await resolveFavorites(sourceId, kind, parsed, db)
      return { items: records.map((record) => toItemOut(record, kind)), unresolved }
    },
    enabled: enabled && sourceId !== null,
    gcTime: 30_000,
  })
}

/**
 * Alterna o favorito de um item (segurar OK — feature 013) e invalida
 * tudo que depende dele: a estrela em qualquer tela onde o item aparece,
 * a categoria "Favoritos" da fonte/tipo, e o estado do detalhe
 * (`useUserState`). Recusa episódio (D-009) e item sem identidade
 * estável, em vez de gravar uma chave inventada.
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item: CatalogItemOut): Promise<boolean> => {
      if (item.kind !== 'channel' && item.kind !== 'movie' && item.kind !== 'series') {
        throw new Error(`Tipo "${item.kind}" não é favoritável.`)
      }
      const stableId = stableIdOf(item)
      if (!stableId || !item.source_id) {
        throw new Error('Item sem identidade estável: não é possível favoritar.')
      }

      const current = await getUserState(stableId, db)
      const next = !(current?.isFavorite ?? false)
      await toggleFavorite(stableId, item.source_id, next, db)
      return next
    },
    onSuccess: (_isFavoriteNow, item) => {
      const stableId = stableIdOf(item)
      void queryClient.invalidateQueries({ queryKey: ['favorite-ids', item.source_id, item.kind] })
      void queryClient.invalidateQueries({ queryKey: ['favorites-content', item.source_id, item.kind] })
      if (stableId) void queryClient.invalidateQueries({ queryKey: ['user-state', stableId] })
      // Feature 026: o hero e a rail "Minha Lista" do Início dependem do
      // mesmo favorito (`logic/hero-home.md` §6).
      void queryClient.invalidateQueries({ queryKey: ['home-hero'] })
      void queryClient.invalidateQueries({ queryKey: ['my-list-content'] })
    },
  })
}

/**
 * Correção manual de "assistido" (feature 019, D-004) — recebe a
 * identidade já calculada pela tela (`MovieDetailScreen`, mesmo par
 * `stableId`/`sourceId` que `progressRecorder`/`useUserState` usam), não
 * um `CatalogItemOut`: diferente de favorito, "assistido" não depende do
 * `kind` do item pra decidir se é aplicável.
 */
export function useToggleWatched() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { stableId: string; sourceId: string; watched: boolean }): Promise<void> => {
      await setWatchedManually(params.stableId, params.sourceId, params.watched, db)
    },
    onSuccess: (_result, params) => {
      void queryClient.invalidateQueries({ queryKey: ['user-state', params.stableId] })
      // Prefixo, não uma combinação sourceId/kind específica — mesmo padrão
      // de `invalidateUserStates`: o card na grade (D-006) não precisa saber
      // qual tela disparou o toggle.
      void queryClient.invalidateQueries({ queryKey: ['watched-ids'] })
      // Marcar manualmente como assistido apaga o progresso de retomada
      // (D-004) — sem isto, o hub continuaria mostrando o item em
      // "Continuar assistindo" até uma navegação nova forçar releitura
      // (achado real durante o E2E desta feature, T023).
      void queryClient.invalidateQueries({ queryKey: ['continue-watching', params.sourceId] })
      // Feature 025: o selo de assistido no Histórico e o denominador da
      // hero band de retomada dependem do mesmo `UserStateRecord`.
      void queryClient.invalidateQueries({ queryKey: ['history-content'] })
      void queryClient.invalidateQueries({ queryKey: ['resume-positions'] })
      // Feature 026: marcar assistido pode tirar o item de "Continuar
      // assistindo" e mudar o hero (`logic/hero-home.md` §6).
      void queryClient.invalidateQueries({ queryKey: ['home-hero'] })
    },
  })
}

/**
 * Tudo que remover/limpar o Histórico pode mudar (feature 036, D-010 —
 * lista fechada, `logic/remocao-historico.md` §10). Prefixo de chave, sem
 * `sourceId`: faltar uma delas é o bug que a 019 já teve ("Continuar" não
 * sumia até uma navegação nova).
 */
function invalidateHistoryRemoval(queryClient: QueryClient): void {
  for (const key of [
    'user-state',
    'user-states',
    'history-content',
    'continue-watching',
    'resume-positions',
    'home-hero',
    'history-summary',
  ]) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}

/** Filme pelo `stableId`; série pelo `seriesId` do catálogo (todos os episódios dela, D-009). */
export type HistoryRemovalTarget =
  | { kind: 'movie'; stableId: string; sourceId: string }
  | { kind: 'series'; seriesId: string; sourceId: string }

/** Remove um título do "↺ Histórico" — grade (tecla vermelha) e detalhe (feature 036, US1). */
export function useRemoveFromHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ target, mode }: { target: HistoryRemovalTarget; mode: HistoryRemovalMode }): Promise<void> => {
      if (target.kind === 'movie') await removeMovieFromHistory(target.stableId, target.sourceId, mode, db)
      else await removeSeriesFromHistory(target.sourceId, target.seriesId, mode, db)
    },
    onSuccess: () => invalidateHistoryRemoval(queryClient),
  })
}

/** Limpeza em lote da aba Privacidade (feature 036, US2) — só a lista `sourceId`. */
export function useClearHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { sourceId: string; scope: HistoryClearScope; mode: HistoryRemovalMode }): Promise<void> => {
      await clearHistory(params.sourceId, params.scope, params.mode, db)
    },
    onSuccess: () => invalidateHistoryRemoval(queryClient),
  })
}

/** Contagens da aba Privacidade — só lida com a aba aberta (`enabled`), nunca só por abrir Configurações. */
export function useHistorySummary(sourceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['history-summary', sourceId],
    queryFn: () => summarizeHistory(sourceId as string, db),
    enabled: enabled && sourceId !== null,
  })
}
