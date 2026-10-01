import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  resolveCatalogItemId,
  stableIdOf,
  useAggregatedItems,
  useCategoryContent,
  useCategoryFocusPrefetch,
  useCategoryList,
  useFavoriteIds,
  useFavoritesContent,
  useHistoryContent,
  useKindSortFields,
  useRemoveFromHistory,
  useResumePositions,
  useSeriesWatchedSummary,
  useWatchedIds,
  type CatalogCategory,
  type CatalogItemOut,
  type HistoryRemovalTarget,
} from '../catalog/catalogApi'
import { historyTargetHasProgress, type HistoryRemovalMode } from '../../lib/catalog/historyRemoval'
import { isRemoveColorKeyRegistered } from '../../lib/tizenColorKey'
import { computeNeighbor } from '../favorites/neighbor'
import { HistoryRemovalModal } from '../history/HistoryRemovalModal'
import { usePrefetchHint } from '../catalog/prefetchApi'
import { normalizeForSearch, searchWithinItems, SEARCH_MIN_CHARS } from '../../lib/catalog/catalogSearch'
import { formatTime } from '../../lib/player/formatTime'
import { clamp, gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { locateOrNeighbor, type LastFocus } from '../../lib/focus/reconcileFocus'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { FavoriteHint, FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { ContentCard } from '../../components/ContentCard'
import { PosterArt } from '../../components/PosterArt'
import { SideCategoryNav, type SideCategoryNavEntry } from '../../components/SideCategoryNav'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Modal } from '../../components/Modal'
import { Spinner } from '../../components/Spinner'
import { Chip } from '../../components/Chip'
import { Icon } from '../../components/Icon'
import { knownCategoryCount } from '../catalog/categoryCount'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { HintItem } from '../shell/HintBar'
import type { TopbarItem } from '../../navigation/appNav'
import type { CategoryScreenSnapshot } from '../catalog/categoryScreenSnapshot'
import type { VodShellProps } from './vodShell'
import { availableSortOptions, sortVodItems, VOD_SORT_LABELS, type VodSortOption } from './vodSort'
import {
  isHistoryKnown,
  markHistoryKnown,
  recalledFocus,
  rememberFocus,
  sessionSort,
  setSessionSort,
  type VodEntryKey,
  type VodSection,
} from './vodSessionMemory'

/** Card portrait de geometria fixa (D-006 do plan.md — sem `ResizeObserver`, mesma escolha do `Rail`, feature 022 R-002). */
const GRID_COLS = 6
const CARD_WIDTH = 205
const CARD_GAP = 24 // token --space-3
/**
 * Espaço vertical que cada linha precisa além da altura do pôster
 * (205×302): título + metadado + o espaçamento entre linhas que a posição
 * absoluta não herda de `gap` (mesmo valor já validado pela feature 009).
 */
const ROW_EXTRA_PX = 68
const ROW_HEIGHT = (CARD_WIDTH * 302) / 205 + ROW_EXTRA_PX
const GRID_OVERSCAN = GRID_COLS
/** "Todos" aos poucos (feature 039, T022): a próxima página é pedida a 10 fileiras do fim. */
const ALL_LOAD_AHEAD = GRID_COLS * 10

const VOD_HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Abrir' },
  { keyLabel: 'Segurar OK', action: 'Favoritar' },
  { keyLabel: 'RETURN', action: 'Voltar' },
]

/**
 * O que difere entre Filmes e Séries — só rótulos e qual selo o card
 * mostra (`logic/foco-vod.md` §1). Nenhuma decisão de dados aqui: os hooks
 * de catálogo são os mesmos para os dois, parametrizados por `kind`.
 */
interface VodSectionConfig {
  section: VodSection
  kind: 'movie' | 'series'
  label: string
  singular: string
  loadingLabel: string
  emptyTitle: string
  emptyDescription: string
  searchPlaceholder: string
}

const SECTION_CONFIG: Record<VodSection, VodSectionConfig> = {
  movies: {
    section: 'movies',
    kind: 'movie',
    label: 'Filmes',
    singular: 'filme',
    loadingLabel: 'Carregando filmes…',
    emptyTitle: 'Nenhum filme nesta lista',
    emptyDescription: 'A importação pode não ter encontrado filmes nesta fonte, ou ainda estar em andamento.',
    searchPlaceholder: 'Buscar filmes',
  },
  series: {
    section: 'series',
    kind: 'series',
    label: 'Séries',
    singular: 'série',
    loadingLabel: 'Carregando séries…',
    emptyTitle: 'Nenhuma série nesta lista',
    emptyDescription: 'A importação pode não ter encontrado séries nesta fonte, ou ainda estar em andamento.',
    searchPlaceholder: 'Buscar séries',
  },
}

export interface VodCatalogScreenProps {
  section: VodSection
  sourceId: string
  /** `snapshot` (feature 017/025): o estado da tela no instante em que o item foi aberto. */
  onOpenItem: (itemId: string, snapshot?: CategoryScreenSnapshot) => void
  /** Estado a restaurar ao voltar do detalhe (feature 017, FR-019/FR-031). */
  restore?: CategoryScreenSnapshot
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
  /** Feature 025 (FR-001..FR-004): moldura V14, mesmo padrão da Live (024). */
  shell?: VodShellProps
  /** Remonta com a topbar ativa neste item — volta de Busca/Configurações (feature 026, FR-034/FR-044). */
  initialTopbarItem?: TopbarItem
}

/**
 * Identidade de cada entrada da side nav — Favoritos, Histórico, Todos ou
 * uma categoria real por nome declarado (nunca índice, feature 025
 * `logic/foco-vod.md` §1, mesmo critério de `LiveScreen`/`MoviesScreen`).
 */
type TrailKey =
  | { kind: 'favorites' }
  | { kind: 'history' }
  | { kind: 'all' }
  | { kind: 'category'; name: string }

function sameTrailKey(a: TrailKey, b: TrailKey): boolean {
  if (a.kind === 'category') return b.kind === 'category' && b.name === a.name
  return a.kind === b.kind
}

interface TrailEntry {
  key: TrailKey
  category?: CatalogCategory
}

/**
 * O que entrou de fato — Favoritos, Histórico, Todos, ou uma categoria por
 * id. Mesmo shape de `SnapshotEntered` (feature 017) de propósito: `entered`
 * é inicializado direto de `restore?.entered`, sem campo extra pra
 * reconciliar.
 */
type EnteredKey = { kind: 'favorites' } | { kind: 'history' } | { kind: 'all' } | { kind: 'category'; id: number }

/** Chave estável da entrada, para `vodSessionMemory` — nunca índice. */
function vodEntryKey(key: TrailKey): VodEntryKey {
  return key.kind === 'category' ? `category:${key.name}` : key.kind
}

function trailEntryId(entry: TrailEntry): string {
  if (entry.key.kind === 'category') return `cat-${entry.category!.id}`
  return entry.key.kind
}


/**
 * Padrão sem navegação prévia: a primeira categoria REAL, depois de
 * "★ Favoritos", "↺ Histórico" e "Todos" — mesma decisão de `LiveScreen`.
 * `VIRTUAL_TRAIL_COUNT` é constante: sempre 3 (feature 025 acrescenta
 * "↺ Histórico" às 2 virtuais que já existiam desde a 018).
 */
const VIRTUAL_TRAIL_COUNT = 3

function defaultTrailIdx(trail: TrailEntry[]): number {
  return Math.min(VIRTUAL_TRAIL_COUNT, trail.length - 1)
}

export function VodCatalogScreen({
  section,
  sourceId,
  onOpenItem,
  restore,
  onBack,
  onResync,
  shell,
  initialTopbarItem,
}: VodCatalogScreenProps): ReactNode {
  const config = SECTION_CONFIG[section]
  const [col, setCol] = useState<0 | 1>(restore?.col ?? 0)
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  // Composição de foco topbar ↔ conteúdo (feature 023/024, `logic/foco-vod.md`
  // §1) — só existe de fato com `shell`; sem ele, `zone` nunca sai de 'content'.
  // `initialTopbarItem` (feature 026, FR-034/FR-044) começa com a topbar já
  // ativa nesse item, em vez do conteúdo.
  const [zone, setZone] = useState<'topbar' | 'content'>(initialTopbarItem ? 'topbar' : 'content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>(initialTopbarItem ?? section)
  const contentActive = !shell || zone === 'content'

  // Estrutura: rápida, nunca toca rede (FR-004).
  const categoriesQuery = useCategoryList(sourceId, config.kind)
  const categories = categoriesQuery.data ?? []

  const trail: TrailEntry[] = [
    { key: { kind: 'favorites' } },
    { key: { kind: 'history' } },
    { key: { kind: 'all' } },
    ...categories.map((category) => ({
      key: { kind: 'category', name: groupLabel(category.name) } as TrailKey,
      category,
    })),
  ]

  const [focusedTrailKey, setFocusedTrailKey] = useState<TrailKey | null>(restore?.trailKey ?? null)
  const categoryIdx =
    focusedTrailKey === null
      ? defaultTrailIdx(trail)
      : (() => {
          const idx = trail.findIndex((entry) => sameTrailKey(entry.key, focusedTrailKey))
          return idx === -1 ? defaultTrailIdx(trail) : idx
        })()
  const focusedTrailEntry = trail[categoryIdx]
  const focusedCategory = focusedTrailEntry?.category
  const isFavoritesFocused = focusedTrailEntry?.key.kind === 'favorites'
  const isHistoryFocused = focusedTrailEntry?.key.kind === 'history'
  const isAllFocused = focusedTrailEntry?.key.kind === 'all'

  const focusedCategoryRef = useScrollFocusedIntoView<HTMLButtonElement>(categoryIdx)

  const [entered, setEntered] = useState<EnteredKey | null>(restore?.entered ?? null)
  const enteredCategory = entered?.kind === 'category' ? categories.find((c) => c.id === entered.id) : undefined
  const enteredFavorites = entered?.kind === 'favorites'
  const enteredHistory = entered?.kind === 'history'
  const enteredAll = entered?.kind === 'all'
  // Chave de memória da entrada aberta (`logic/foco-vod.md` §4) — para
  // categoria, derivada do registro resolvido (`enteredCategory`), nunca do
  // `id` sozinho: o nome é o que sobrevive melhor a uma regeneração.
  const enteredEntryKey: VodEntryKey | null =
    entered === null
      ? null
      : entered.kind === 'category'
        ? enteredCategory
          ? vodEntryKey({ kind: 'category', name: groupLabel(enteredCategory.name) })
          : null
        : entered.kind

  const [searchActive, setSearchActive] = useState(restore?.searchActive ?? false)
  const [searchTerm, setSearchTerm] = useState(restore?.searchTerm ?? '')
  const [toolbarFocus, setToolbarFocus] = useState<'search' | 'sort' | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const belowMinimum = normalizeForSearch(searchTerm).length < SEARCH_MIN_CHARS

  // Ordenar (feature 025, US4, `logic/foco-vod.md` §5) — escolha por seção
  // na sessão (D-008); nunca em ★/↺, que têm ordem própria (FR-022).
  const [sortOption, setSortOption] = useState<VodSortOption>(() => sessionSort(section))
  const [sortOpen, setSortOpen] = useState(false)
  const [sortFocusIdx, setSortFocusIdx] = useState(0)

  useEffect(() => {
    if (searchActive && toolbarFocus === 'search') searchInputRef.current?.focus()
    else searchInputRef.current?.blur()
  }, [searchActive, toolbarFocus])

  // Pré-busca a categoria em foco (feature 010/015, desvio deliberado de
  // FR-004 — ver `LiveScreen.tsx`). "★"/"↺"/"Todos" nunca prefetcham, nem a
  // categoria já entrada.
  useCategoryFocusPrefetch(sourceId, focusedCategory, entered?.kind === 'category' ? entered.id : undefined)
  // Feature 038 (FR-005/FR-011): só reordena a fila da pré-carga — nenhuma consulta nasce do foco.
  usePrefetchHint(config.kind, focusedCategory?.id)

  const content = useCategoryContent(sourceId, enteredCategory)
  const favoriteIdsQuery = useFavoriteIds(sourceId, config.kind)
  const favoriteIds = favoriteIdsQuery.data ?? new Set<string>()
  const watchedIdsQuery = useWatchedIds(sourceId, section === 'movies' ? config.kind : 'channel')
  const watchedIds = section === 'movies' ? (watchedIdsQuery.data ?? new Set<string>()) : new Set<string>()
  const watchedSummaryQuery = useSeriesWatchedSummary(section === 'series' ? sourceId : null)
  const watchedSummary = watchedSummaryQuery.data ?? new Map<string, { known: number; watched: number; upToDate: boolean }>()
  const resumePositionsQuery = useResumePositions(section === 'movies' ? sourceId : null, 'movie')
  const resumePositions = resumePositionsQuery.data ?? new Map<string, number>()
  const favoritesContent = useFavoritesContent(sourceId, config.kind, enteredFavorites)
  // Feature 039 (T022): "Todos" na ordem da fonte e sem busca lê aos poucos,
  // conforme a pessoa desce; ordenar e buscar precisam do tipo inteiro.
  const allProgressive = !searchActive && sortOption === 'source'
  const aggregated = useAggregatedItems(sourceId, config.kind, enteredAll, { progressive: allProgressive })
  // T033: com "Todos" aos poucos, "Ano"/"Recém-adicionados" podem estar só em
  // categorias ainda não lidas — o modal pergunta ao tipo inteiro (só aberto).
  const kindSortFieldsQuery = useKindSortFields(sourceId, config.kind, enteredAll && allProgressive && sortOpen)
  // "↺ Histórico" (feature 025, FR-007): habilitado quando a pessoa entrou
  // nele agora ou já entrou antes nesta sessão — nada é resolvido só por
  // abrir a tela (`logic/historico.md` §5).
  const historyKnown = isHistoryKnown(sourceId, section)
  const historyContent = useHistoryContent(sourceId, config.kind, enteredHistory || historyKnown)

  const baseItems = enteredFavorites
    ? (favoritesContent.data?.items ?? [])
    : enteredHistory
      ? (historyContent.data?.items ?? [])
      : enteredAll
        ? aggregated.items
        : (content.data?.items ?? [])
  const contentIsLoading = enteredFavorites
    ? favoritesContent.isLoading
    : enteredHistory
      ? historyContent.isLoading
      : enteredAll
        ? aggregated.isLoading
        : content.isLoading
  const contentFailed = enteredFavorites
    ? favoritesContent.isError
    : enteredHistory
      ? historyContent.isError
      : enteredAll
        ? false
        : content.data?.outcome === 'failed' || content.isError
  const contentMissing = entered?.kind === 'category' && content.data?.outcome === 'source_missing'
  const contentUnavailable = contentFailed || contentMissing

  // "Pesquisar" e "Ordenar" só com a entrada aberta e itens carregados
  // (FR-016/FR-017); "Ordenar" nunca em ★/↺ (FR-022).
  const canSearch = col === 1 && !contentUnavailable && baseItems.length > 0
  const canSort = canSearch && !enteredFavorites && !enteredHistory

  // "Ordenar" nunca em ★/↺ — ordem própria (mais recente primeiro, FR-022).
  const kindSortFieldsData = kindSortFieldsQuery.data
  const availableOptions = useMemo(() => {
    if (enteredFavorites || enteredHistory) return []
    const loaded = availableSortOptions(baseItems)
    if (!enteredAll || !kindSortFieldsData) return loaded
    // União com o tipo inteiro: nunca some uma opção que os itens lidos já mostram.
    return (['source', 'az', 'year', 'added'] as const).filter(
      (option) =>
        loaded.includes(option) ||
        (option === 'year' && kindSortFieldsData.year) ||
        (option === 'added' && kindSortFieldsData.addedAt),
    )
  }, [enteredFavorites, enteredHistory, enteredAll, baseItems, kindSortFieldsData])
  // Opção salva pode não estar disponível nesta entrada (ex.: "Ano" numa
  // categoria M3U) — a grade usa "Ordem da fonte" sem apagar a escolha da
  // seção (D-008).
  const effectiveSortOption: VodSortOption = availableOptions.includes(sortOption) ? sortOption : 'source'

  const items = useMemo(() => {
    const filtered = !searchActive ? baseItems : belowMinimum ? [] : searchWithinItems(baseItems, searchTerm, (item) => item.name)
    if (enteredFavorites || enteredHistory || effectiveSortOption === 'source') return filtered
    return sortVodItems(filtered, effectiveSortOption)
  }, [searchActive, belowMinimum, baseItems, searchTerm, enteredFavorites, enteredHistory, effectiveSortOption])

  const [focusedItemId, setFocusedItemId] = useState<string | null>(restore?.focusedItemId ?? null)
  // Feature 038 (FR-027): se a renovação em segundo plano tirou o item em
  // foco, o foco fica no vizinho (mesma posição), não volta ao topo.
  const lastItemFocusRef = useRef<LastFocus | null>(null)
  const itemListKey = JSON.stringify(enteredEntryKey)
  // Feature 036 (T021, US1/AC9): voltando do detalhe, o card de origem pode
  // não existir mais (removido do Histórico lá). `focusedIndexHint` do
  // snapshot — gravado desde a 025, nunca lido até aqui — dá o vizinho na
  // mesma posição. Vale enquanto o foco ainda é o id restaurado e a lista é a
  // restaurada (a 1ª seta foca um id que existe); não dá para semear o
  // `lastItemFocusRef`, que o efeito abaixo grava com 0 enquanto a lista
  // ainda está vazia.
  const [restoreHint] = useState<LastFocus | null>(() =>
    restore?.focusedIndexHint !== undefined ? { listKey: itemListKey, index: restore.focusedIndexHint } : null,
  )
  const applyRestoreHint =
    restoreHint !== null && restoreHint.listKey === itemListKey && focusedItemId === (restore?.focusedItemId ?? null)
  const itemIdx = locateOrNeighbor(
    items,
    (item) => item.id === focusedItemId,
    itemListKey,
    applyRestoreHint ? restoreHint : lastItemFocusRef.current,
  )
  useEffect(() => {
    lastItemFocusRef.current = { listKey: itemListKey, index: itemIdx }
  }, [itemListKey, itemIdx])
  const activeItem: CatalogItemOut | undefined = items[itemIdx]

  // Feature 039 (T022): "Todos" aos poucos pede a próxima página quando o foco
  // chega perto do fim do que já foi lido — e também enquanto o item a
  // restaurar (volta do detalhe, memória de foco) ainda não apareceu, para
  // "Voltar restaura foco" valer mesmo lá embaixo.
  const { hasMore: allHasMore, loadMore: loadMoreAll } = aggregated
  const focusedNotLoaded = focusedItemId !== null && !items.some((item) => item.id === focusedItemId)
  // Só persegue um item que ainda existe: um que saiu numa renovação (ou um id
  // antigo que a conversão para blocos trocou) faria ler todas as páginas do
  // tipo atrás de algo que nunca aparece. Confere primeiro, lendo só o bloco
  // do item; id trocado vira o id novo.
  const [focusCheck, setFocusCheck] = useState<{ id: string; exists: boolean } | null>(null)
  useEffect(() => {
    if (!enteredAll || !focusedNotLoaded || focusedItemId === null) return
    if (focusCheck?.id === focusedItemId) return
    let cancelled = false
    void resolveCatalogItemId(focusedItemId).then(
      (currentId) => {
        if (cancelled) return
        if (currentId !== null && currentId !== focusedItemId) setFocusedItemId(currentId)
        else setFocusCheck({ id: focusedItemId, exists: currentId !== null })
      },
      () => {
        if (!cancelled) setFocusCheck({ id: focusedItemId, exists: false })
      },
    )
    return () => {
      cancelled = true
    }
  }, [enteredAll, focusedNotLoaded, focusedItemId, focusCheck])
  const chasingFocus = focusedNotLoaded && focusCheck?.id === focusedItemId && focusCheck.exists
  useEffect(() => {
    if (!enteredAll || !allHasMore || !loadMoreAll) return
    if (chasingFocus || itemIdx >= items.length - ALL_LOAD_AHEAD) loadMoreAll()
  }, [enteredAll, allHasMore, loadMoreAll, chasingFocus, itemIdx, items.length])

  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const itemVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => gridContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    lanes: GRID_COLS,
    overscan: GRID_OVERSCAN,
  })

  const itemsNavigable = col === 1 && !contentIsLoading && !contentUnavailable && items.length > 0
  useVirtualFocusSync({
    focusedIndex: itemIdx,
    scrollToIndex: itemVirtualizer.scrollToIndex,
    enabled: itemsNavigable,
  })

  /** Memória de foco por entrada (FR-030, `logic/foco-vod.md` §4): grava a cada foco na grade. */
  useEffect(() => {
    if (col !== 1 || !enteredEntryKey || !focusedItemId) return
    rememberFocus(sourceId, section, enteredEntryKey, focusedItemId)
  }, [col, enteredEntryKey, focusedItemId, sourceId, section])

  function resetSearchState() {
    setSearchActive(false)
    setSearchTerm('')
    setToolbarFocus(null)
  }

  /**
   * Foco inicial ao entrar numa entrada: lembrado pela sessão, senão `null`
   * (FR-030). Não precisa validar se o id lembrado ainda existe na lista —
   * `locate()` já cai no 1º item quando não existe (`logic/foco-vod.md` §4).
   */
  function initialFocusFor(entryKey: VodEntryKey): string | null {
    return recalledFocus(sourceId, section, entryKey)
  }

  function enterCategory(category: CatalogCategory) {
    if (entered?.kind !== 'category' || entered.id !== category.id) {
      setEntered({ kind: 'category', id: category.id })
      setFocusedItemId(initialFocusFor(vodEntryKey({ kind: 'category', name: groupLabel(category.name) })))
    }
    resetSearchState()
    setCol(1)
  }

  function enterFavorites() {
    if (entered?.kind !== 'favorites') {
      setEntered({ kind: 'favorites' })
      setFocusedItemId(initialFocusFor('favorites'))
    }
    resetSearchState()
    setCol(1)
  }

  /** Entra em "↺ Histórico" (feature 025, FR-009): marca conhecido, para a contagem passar a existir (§5 de `logic/historico.md`). */
  function enterHistory() {
    markHistoryKnown(sourceId, section)
    if (entered?.kind !== 'history') {
      setEntered({ kind: 'history' })
      setFocusedItemId(initialFocusFor('history'))
    }
    resetSearchState()
    setCol(1)
  }

  function enterAll() {
    if (entered?.kind !== 'all') {
      setEntered({ kind: 'all' })
      setFocusedItemId(initialFocusFor('all'))
    }
    resetSearchState()
    setCol(1)
  }

  function enterFocusedTrailItem() {
    if (isFavoritesFocused) enterFavorites()
    else if (isHistoryFocused) enterHistory()
    else if (isAllFocused) enterAll()
    else if (focusedCategory) enterCategory(focusedCategory)
  }

  function retryContent() {
    if (enteredFavorites) void favoritesContent.refetch()
    else if (enteredHistory) void historyContent.refetch()
    else void content.refetch()
  }

  /** Segurar OK/tecla amarela favorita — nunca em "↺ Histórico" (só leitura, FR-014) nem na toolbar. */
  const canToggleFavorite = col === 1 && toolbarFocus === null && !enteredHistory && activeItem !== undefined

  function toggleFocusedFavorite() {
    if (!activeItem) return
    void favoriteToggle.toggle(activeItem, {
      visibleItems: enteredFavorites ? items : undefined,
      onFocusNeighbor: enteredFavorites ? setFocusedItemId : undefined,
    })
  }

  // Remover do "↺ Histórico" pela tecla vermelha (feature 036, `logic/
  // remocao-historico.md` §8). `removal` é o modal aberto; `removalOpening`
  // cobre a leitura local de "tem progresso" que precede a abertura.
  const removeFromHistory = useRemoveFromHistory()
  const [removal, setRemoval] = useState<{ item: CatalogItemOut; hasProgress: boolean; error: boolean } | null>(null)
  const [removalOpening, setRemovalOpening] = useState(false)

  /**
   * Só na grade do Histórico, com um item focado, nada aberto por cima. Com o
   * modal (de remoção ou de Ordenar) aberto a tecla NÃO pode ter handler: o
   * `Modal` não intercepta tecla não mapeada, e ela chegaria aqui (FR-021).
   */
  const canRemoveFromHistory =
    enteredHistory &&
    col === 1 &&
    toolbarFocus === null &&
    activeItem !== undefined &&
    removal === null &&
    !removalOpening &&
    !removeFromHistory.isPending &&
    !sortOpen

  /** Filme por `stableId`; série pelo `series_id` do catálogo (todos os episódios, D-009). */
  function historyTargetOf(item: CatalogItemOut): HistoryRemovalTarget | null {
    if (section === 'series') return item.series_id ? { kind: 'series', seriesId: item.series_id, sourceId } : null
    const stableId = stableIdOf(item)
    return stableId ? { kind: 'movie', stableId, sourceId } : null
  }

  function openHistoryRemoval() {
    const item = activeItem
    const target = item ? historyTargetOf(item) : null
    if (!item || !target) return
    setRemovalOpening(true)
    void historyTargetHasProgress(target)
      .then(
        (hasProgress) => setRemoval({ item, hasProgress, error: false }),
        // Leitura local falhou: oferece só o seguro (sem "apagar progresso").
        () => setRemoval({ item, hasProgress: false, error: false }),
      )
      .finally(() => setRemovalOpening(false))
  }

  function confirmHistoryRemoval(mode: HistoryRemovalMode) {
    if (!removal) return
    const target = historyTargetOf(removal.item)
    if (!target) return
    // Vizinho calculado ANTES de a lista mudar (FR-017).
    const neighbor = computeNeighbor(items, removal.item.id)
    removeFromHistory.mutate(
      { target, mode },
      {
        onSuccess: () => {
          setRemoval(null)
          showToast('Removido do histórico')
          setFocusedItemId(neighbor)
        },
        // O item continua na grade; o modal explica e oferece "Tentar de novo" (FR-020).
        onError: () => setRemoval((current) => (current ? { ...current, error: true } : current)),
      },
    )
  }

  /** Abre o modal de Ordenar com a opção atual marcada e focada (FR-018). */
  function openSortModal() {
    const idx = availableOptions.indexOf(effectiveSortOption)
    setSortFocusIdx(idx === -1 ? 0 : idx)
    setSortOpen(true)
  }

  /** Escolhe a ordenação (FR-018/FR-021): vale pela sessão, para a seção inteira. */
  function chooseSort(option: VodSortOption) {
    setSessionSort(section, option)
    setSortOption(option)
    setSortOpen(false)
    setToolbarFocus('sort')
  }

  useRemoteNav(
    contentActive
      ? {
          onDirection: (dir) => {
            const hasTop = col === 1 && items.length > 0
            if (hasTop && toolbarFocus !== null) {
              if (dir === 'down') {
                setToolbarFocus(null)
                setFocusedItemId(items[0].id)
                return
              }
              // ←/→ dentro da toolbar (D-007 do plan.md, `logic/foco-vod.md` §3)
              // — nunca alcançados com o campo de busca com foco DOM real
              // (a guarda de alvo editável intercepta antes).
              if (dir === 'right' && toolbarFocus === 'search' && canSort) {
                setToolbarFocus('sort')
                return
              }
              if (dir === 'left' && toolbarFocus === 'sort') {
                if (canSearch) setToolbarFocus('search')
                else setCol(0)
                return
              }
              if (dir === 'left' && toolbarFocus === 'search') {
                setCol(0)
                return
              }
              return
            }
            if (hasTop && toolbarFocus === null && dir === 'up' && itemIdx < GRID_COLS) {
              setToolbarFocus(canSearch ? 'search' : canSort ? 'sort' : null)
              return
            }

            if (col === 0) {
              if (dir === 'right') {
                enterFocusedTrailItem()
                return
              }
              if (dir === 'up' && categoryIdx === 0 && shell) {
                setTopbarItem(section)
                setZone('topbar')
                return
              }
              if (dir === 'up' || dir === 'down') {
                const next = clamp(categoryIdx + (dir === 'down' ? 1 : -1), 0, trail.length - 1)
                if (next !== categoryIdx) {
                  setFocusedTrailKey(trail[next]?.key ?? { kind: 'favorites' })
                }
              }
              return
            }

            if (dir === 'left' && itemIdx % GRID_COLS === 0) {
              setCol(0)
              return
            }
            if (toolbarFocus === null) {
              if (items.length === 0) return
              const next = gridNextIndex(dir, itemIdx, items.length, GRID_COLS)
              setFocusedItemId(items[next]?.id ?? null)
            }
          },
          onSelect: () => {
            if (col === 0) {
              enterFocusedTrailItem()
              return
            }
            // Achado real (feature 028, FR-007/FR-009): estes três estados já
            // desenhavam "Voltar" com aparência de foco (`EmptyState`,
            // `focused`), mas nenhum ramo daqui os alcançava — SELECT caía
            // direto em `items[itemIdx]` (undefined) e não fazia nada, com o
            // botão visivelmente focado (mesmo padrão de bug já corrigido na
            // 014/024). Carregando (T021).
            if (contentIsLoading) {
              setCol(0)
              return
            }
            if (enteredFavorites && !contentFailed && items.length === 0) {
              setCol(0)
              return
            }
            if (enteredHistory && !contentFailed && items.length === 0) {
              setCol(0)
              return
            }
            // "Todos" vazio (T021).
            if (enteredAll && items.length === 0) {
              setCol(0)
              return
            }
            if (contentMissing) {
              onResync()
              return
            }
            if (contentFailed) {
              retryContent()
              return
            }
            // Categoria real vazia, sem falha nem "Modo limitado" (T021).
            if (entered?.kind === 'category' && items.length === 0) {
              setCol(0)
              return
            }
            if (toolbarFocus === 'search') {
              setSearchActive(true)
              setSearchTerm('')
              return
            }
            if (toolbarFocus === 'sort') {
              openSortModal()
              return
            }
            const item = items[itemIdx]
            if (!item) return
            // Snapshot (feature 017/018/025, FR-031): guardado ANTES de abrir
            // o detalhe. `focusedIndexHint` é só dica de vizinho para quando o
            // card de origem não existir mais ao voltar — nunca identidade.
            onOpenItem(item.id, {
              trailKey: focusedTrailEntry?.key ?? null,
              entered,
              col,
              focusedItemId: item.id,
              searchTerm,
              searchActive,
              focusedIndexHint: itemIdx,
            })
          },
          onLongSelect: canToggleFavorite ? toggleFocusedFavorite : undefined,
          onFavoriteKey: canToggleFavorite ? toggleFocusedFavorite : undefined,
          onRemoveKey: canRemoveFromHistory ? openHistoryRemoval : undefined,
          onBack: () => {
            if (col === 1 && searchActive && toolbarFocus === null) {
              setToolbarFocus('search')
              return
            }
            if (col === 1 && searchActive && toolbarFocus === 'search') {
              setSearchActive(false)
              setSearchTerm('')
              return
            }
            if (col === 1) {
              setCol(0)
              return
            }
            onBack()
          },
        }
      : {},
  )

  /** Moldura V14 (feature 025, FR-001..FR-003) — mesmo padrão da Live (024, D-002 dela). */
  function withShell(children: ReactNode): ReactNode {
    if (!shell) return children
    return (
      <AppShell
        hints={VOD_HINTS}
        topBar={
          <TopBar
            sourceName={shell.sourceName}
            active={zone === 'topbar'}
            focusedItem={topbarItem}
            currentItem={section}
            onFocusItem={setTopbarItem}
            onExitDown={() => setZone('content')}
            onNavigate={(destination) => shell.onSwitchTop(destination)}
            onGoHome={shell.onGoHome}
            onOpenProfiles={shell.onOpenProfiles}
            onOpenSearch={shell.onOpenSearch}
            onOpenSettings={shell.onOpenSettings}
            onBack={onBack}
          />
        }
      >
        {children}
      </AppShell>
    )
  }

  if (categoriesQuery.isLoading) {
    return withShell(
      <div className="screen vod-screen">
        <div className="vod-state-wrapper">
          <Spinner size={48} />
          <EmptyState title={config.loadingLabel} action={{ label: 'Voltar', onSelect: onBack }} focused />
        </div>
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (categoriesQuery.isError) {
    return withShell(
      <div className="screen vod-screen">
        <ErrorState
          title={`Não foi possível carregar ${config.singular === 'filme' ? 'os filmes' : 'as séries'}`}
          description="Tente novamente em instantes."
          actions={[
            { label: 'Tentar de novo', onSelect: () => void categoriesQuery.refetch() },
            { label: 'Voltar', onSelect: onBack },
          ]}
          focusedActionIndex={0}
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (categories.length === 0) {
    return withShell(
      <div className="screen vod-screen">
        <EmptyState
          title={config.emptyTitle}
          description={config.emptyDescription}
          action={{ label: 'Voltar', onSelect: onBack }}
          focused
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  const showingContent = col === 1
  const contentStale = entered?.kind === 'category' && showingContent && content.data?.outcome === 'stale-served'
  const truncated = entered?.kind === 'category' && showingContent && (content.data?.totalCount ?? 0) > items.length
  const declaredCount = focusedCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    entered?.kind === 'category' &&
    showingContent &&
    !content.isLoading &&
    declaredCount !== undefined &&
    realCount !== undefined &&
    declaredCount !== realCount
  const unresolvedFavorites = enteredFavorites ? (favoritesContent.data?.unresolved ?? 0) : 0
  const unresolvedHistory = enteredHistory ? (historyContent.data?.unresolved ?? 0) : 0
  const searchNoResults = searchActive && !belowMinimum && items.length === 0
  const searchCoveragePartial = enteredAll && aggregated.coveredCategories < aggregated.totalCategories
  const showResultsGrid = searchActive
    ? !belowMinimum && items.length > 0
    : !contentIsLoading && !contentUnavailable && items.length > 0

  const entryLabel = isAllFocused || enteredAll
    ? 'Todos'
    : isFavoritesFocused || enteredFavorites
      ? '★ Favoritos'
      : isHistoryFocused || enteredHistory
        ? '↺ Histórico'
        : groupLabel(focusedCategory?.name)


  const sideEntries: SideCategoryNavEntry[] = trail.map((entry) => {
    if (entry.key.kind === 'favorites') {
      return {
        id: trailEntryId(entry),
        label: 'Favoritos',
        icon: 'favorite',
        count: favoriteIds.size,
        pinned: true,
        pinnedBadge: false,
        groupLabel: 'Sua biblioteca',
      }
    }
    if (entry.key.kind === 'history') {
      return {
        id: trailEntryId(entry),
        label: 'Histórico',
        icon: 'history',
        count: historyKnown ? (historyContent.data?.items.length ?? 0) : undefined,
        pinned: true,
        pinnedBadge: false,
        groupLabel: 'Sua biblioteca',
      }
    }
    if (entry.key.kind === 'all') {
      return { id: trailEntryId(entry), label: 'Todos', pinned: true, pinnedBadge: false, groupLabel: 'Catálogo' }
    }
    return {
      id: trailEntryId(entry),
      label: groupLabel(entry.category?.name),
      count: entry.category ? knownCategoryCount(entry.category) : undefined,
    }
  })
  const selectedTrailId = entered
    ? entered.kind === 'category'
      ? `cat-${entered.id}`
      : entered.kind
    : ''
  const focusedTrailId = contentActive && col === 0 && focusedTrailEntry ? trailEntryId(focusedTrailEntry) : undefined

  // Hero band (FR-025/FR-026, D-014): o card focado, ou o lembrado/1º item
  // fora da grade — sem itens, ela não aparece. Nenhuma leitura própria.
  const heroItem: CatalogItemOut | undefined = col === 1 ? activeItem : items[0]

  return (
    <>
      {withShell(
        <div className="screen vod-screen">
          <div className="vod-body">
            <div className="vod-side-nav no-scrollbar">
              <SideCategoryNav
                entries={sideEntries}
                selectedId={selectedTrailId}
                focusedId={focusedTrailId}
                focusedRef={focusedCategoryRef}
                onSelect={(id) => {
                  const target = trail.find((entry) => trailEntryId(entry) === id)
                  if (target) {
                    if (target.key.kind === 'favorites') enterFavorites()
                    else if (target.key.kind === 'history') enterHistory()
                    else if (target.key.kind === 'all') enterAll()
                    else if (target.category) enterCategory(target.category)
                  }
                }}
              />
            </div>

            <div className="vod-content-column">
              <div className="vod-toolbar">
                <div className="vod-toolbar-title">
                  <Chip selected={false}>{entryLabel}</Chip>
                  {content.data?.totalCount !== undefined && entered?.kind === 'category' && (
                    <Chip selected={false}>{content.data.totalCount} títulos</Chip>
                  )}
                </div>
                {canSearch && !searchActive && (
                  <button
                    type="button"
                    className={`vod-toolbar-search-button${toolbarFocus === 'search' ? ' tv-focus' : ''}`}
                  >
                    <Icon name="search" />
                    <span>Pesquisar</span>
                  </button>
                )}
                {searchActive && (
                  <div className="vod-toolbar-search-field">
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="search-field field-box"
                      // Achado real (feature 028, FR-015): sem aria-label nem <label>, o campo não tinha nome acessível.
                      aria-label="Pesquisar nesta categoria"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.keyCode !== 65376) return
                        event.preventDefault()
                        if (items.length > 0) {
                          setToolbarFocus(null)
                          setFocusedItemId(items[0].id)
                        }
                      }}
                      placeholder={config.searchPlaceholder}
                    />
                    <div className="search-status">
                      {belowMinimum && <span>Digite pelo menos 3 letras</span>}
                      {!belowMinimum && <span>{items.length === 1 ? '1 resultado' : `${items.length} resultados`}</span>}
                      {searchCoveragePartial && (
                        <span className="search-coverage">
                          Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {canSort && (
                  <button
                    type="button"
                    className={`vod-toolbar-sort-button${toolbarFocus === 'sort' ? ' tv-focus' : ''}`}
                  >
                    Ordenar · {VOD_SORT_LABELS[effectiveSortOption]} ▾
                  </button>
                )}
              </div>

              {sortOpen && (
                <Modal
                  ariaLabel="Ordenar"
                  onBack={() => {
                    setSortOpen(false)
                    setToolbarFocus('sort')
                  }}
                  onDirection={(dir) => {
                    if (dir === 'up' || dir === 'down') {
                      setSortFocusIdx((i) => clamp(i + (dir === 'down' ? 1 : -1), 0, availableOptions.length - 1))
                    }
                  }}
                  onSelect={() => {
                    const option = availableOptions[sortFocusIdx]
                    if (option) chooseSort(option)
                  }}
                >
                  <ul className="vod-sort-modal-list">
                    {availableOptions.map((option, index) => (
                      <li
                        key={option}
                        className={`vod-sort-modal-item${index === sortFocusIdx ? ' tv-focus' : ''}`}
                      >
                        {option === effectiveSortOption && <span aria-hidden="true">✓ </span>}
                        {VOD_SORT_LABELS[option]}
                      </li>
                    ))}
                  </ul>
                </Modal>
              )}

              {!showingContent && (
                <div className="vod-state-copy">Aponte para uma categoria e pressione OK para ver os títulos.</div>
              )}

              {showingContent && heroItem && (
                <div className="vod-hero-band" aria-hidden="true">
                  <div className="vod-hero-poster">
                    <PosterArt url={heroItem.icon_url ?? undefined} title={heroItem.name} />
                  </div>
                  <div className="vod-hero-info">
                    <div className="vod-hero-eyebrow">
                      {enteredFavorites
                        ? '★ SEUS FAVORITOS'
                        : enteredHistory
                          ? '↺ VISTOS RECENTEMENTE'
                          : enteredAll
                            ? 'TODOS'
                            : groupLabel(heroItem.original_group ?? undefined).toUpperCase()}
                    </div>
                    <div className="vod-hero-title">{heroItem.name}</div>
                    <div className="vod-hero-meta">
                      {heroItem.year !== undefined && heroItem.year !== null && <span>{heroItem.year}</span>}
                      <span>{groupLabel(heroItem.original_group ?? undefined)}</span>
                      {section === 'movies' && watchedIds.has(stableIdOf(heroItem) ?? '') && <span>Assistido</span>}
                      {section === 'movies' &&
                        !watchedIds.has(stableIdOf(heroItem) ?? '') &&
                        resumePositions.has(stableIdOf(heroItem) ?? '') && (
                          <span>Continuar de {formatTime((resumePositions.get(stableIdOf(heroItem) ?? '') ?? 0) * 1000)}</span>
                        )}
                      {section === 'series' &&
                        heroItem.series_id &&
                        watchedSummary.get(heroItem.series_id) &&
                        (watchedSummary.get(heroItem.series_id)!.known > 0 ? (
                          <span>
                            {watchedSummary.get(heroItem.series_id)!.upToDate
                              ? 'Em dia'
                              : `${watchedSummary.get(heroItem.series_id)!.watched}/${watchedSummary.get(heroItem.series_id)!.known}`}
                          </span>
                        ) : null)}
                    </div>
                  </div>
                </div>
              )}

              {searchNoResults && (
                <div className="vod-state">
                  <div className="vod-state-title">Nenhum resultado para "{searchTerm}"</div>
                  {searchCoveragePartial && (
                    <div className="vod-state-copy">
                      Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
                    </div>
                  )}
                </div>
              )}

              {enteredAll && !searchActive && searchCoveragePartial && (
                <div className="vod-truncated-note">
                  Busca em {aggregated.coveredCategories} de {aggregated.totalCategories} categorias
                </div>
              )}

              {showingContent && !searchActive && contentIsLoading && (
                <div className="vod-state-wrapper">
                  <Spinner size={32} />
                  <EmptyState title={config.loadingLabel} action={{ label: 'Voltar', onSelect: () => setCol(0) }} focused />
                </div>
              )}

              {showingContent && !searchActive && !contentIsLoading && contentFailed && (
                <ErrorState
                  title="Não foi possível carregar esta categoria"
                  actions={[{ label: 'Tentar de novo', onSelect: retryContent }]}
                  focusedActionIndex={0}
                />
              )}

              {showingContent && !searchActive && !contentIsLoading && contentMissing && (
                <ErrorState
                  title="O conteúdo desta lista não está mais no aparelho"
                  actions={[{ label: 'Ressincronizar lista', onSelect: onResync }]}
                  focusedActionIndex={0}
                />
              )}

              {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && items.length === 0 && (
                <FavoritesEmptyState kind={config.kind} focused onBack={() => setCol(0)} />
              )}

              {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredHistory && items.length === 0 && (
                <EmptyState
                  title="Seu histórico está vazio"
                  description="Os filmes e séries reproduzidos neste perfil aparecerão aqui."
                  action={{ label: 'Voltar', onSelect: () => setCol(0) }}
                  focused
                />
              )}

              {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredAll && items.length === 0 && (
                <EmptyState
                  title="Nenhuma categoria foi obtida ainda"
                  description='Entre numa categoria para trazê-la para "Todos".'
                  action={{ label: 'Voltar', onSelect: () => setCol(0) }}
                  focused
                />
              )}

              {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && entered?.kind === 'category' && items.length === 0 && (
                <EmptyState title="Esta categoria está vazia." action={{ label: 'Voltar', onSelect: () => setCol(0) }} focused />
              )}

              {showingContent && !searchActive && contentStale && (
                <div className="vod-truncated-note">Não foi possível atualizar agora — mostrando o que já estava salvo.</div>
              )}

              {countsDiverge && (
                <div className="vod-truncated-note">
                  O provedor declarou {declaredCount} {config.singular === 'filme' ? 'filmes' : 'séries'} nesta categoria, mas entregou {realCount}.
                </div>
              )}

              {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && (
                <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
              )}

              {showingContent && !searchActive && !contentIsLoading && !contentUnavailable && enteredHistory && unresolvedHistory > 0 && (
                <div className="vod-truncated-note">
                  {section === 'movies'
                    ? `${unresolvedHistory} ${unresolvedHistory === 1 ? 'filme assistido não está' : 'filmes assistidos não estão'} mais nesta lista.`
                    : `${unresolvedHistory} episódios assistidos não puderam ser associados a uma série desta lista.`}
                </div>
              )}

              {showResultsGrid && <FavoriteHint />}
              {/* Só com a tecla vermelha registrada de fato (FR-003, D-007): nunca prometer uma tecla que não chega. */}
              {showResultsGrid && enteredHistory && isRemoveColorKeyRegistered() && (
                <div className="fav-hint">● Remover do histórico</div>
              )}

              {showResultsGrid && (
                <div ref={gridContainerRef} className="vod-grid no-scrollbar">
                  <div
                    className="vod-grid-inner"
                    style={{
                      height: itemVirtualizer.getTotalSize(),
                      width: GRID_COLS * CARD_WIDTH + (GRID_COLS - 1) * CARD_GAP,
                    }}
                  >
                    {itemVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = items[virtualRow.index]
                      if (!item) return null
                      const isFavorite = favoriteIds.has(stableIdOf(item) ?? '')
                      const isWatched = section === 'movies' && watchedIds.has(stableIdOf(item) ?? '')
                      const summary = section === 'series' && item.series_id ? watchedSummary.get(item.series_id) : undefined
                      const watchedLabel =
                        summary && summary.known > 0 ? (summary.upToDate ? 'Em dia' : `${summary.watched}/${summary.known}`) : undefined
                      return (
                        <div
                          key={item.id}
                          className="vod-grid-cell"
                          style={{
                            left: (virtualRow.lane % GRID_COLS) * (CARD_WIDTH + CARD_GAP),
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <ContentCard
                            variant="portrait"
                            title={item.name}
                            meta={enteredAll ? groupLabel(item.original_group ?? undefined) : (item.original_group ?? config.label)}
                            iconUrl={item.icon_url ?? undefined}
                            focused={col === 1 && toolbarFocus === null && itemIdx === virtualRow.index && removal === null}
                            badge={
                              <>
                                {isFavorite && (
                                  <span className="fav-star" aria-hidden="true">
                                    ★
                                  </span>
                                )}
                                {isWatched && <span className="watched-badge">Assistido</span>}
                                {watchedLabel && <span className="watched-badge">{watchedLabel}</span>}
                              </>
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {truncated && (
                <div className="vod-truncated-note">
                  Mostrando os primeiros {items.length} de {content.data?.totalCount} {config.singular === 'filme' ? 'filmes' : 'séries'} desta categoria.
                </div>
              )}
            </div>
          </div>

          {removal && (
            <HistoryRemovalModal
              subject={{ kind: 'item', name: removal.item.name }}
              hasProgress={removal.hasProgress}
              error={removal.error}
              onCancel={() => setRemoval(null)}
              onConfirm={confirmHistoryRemoval}
            />
          )}

          <Toast message={toastMessage} messageKey={toastKey} />
        </div>,
      )}
    </>
  )
}
