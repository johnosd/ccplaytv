import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  groupLabel,
  resolveCatalogItemId,
  stableIdOf,
  useAggregatedItems,
  useCategoryContent,
  useCategoryWindow,
  useCategoryList,
  useFavoriteIds,
  useFavoritesContent,
  useHistoryContent,
  useKindSortFields,
  useRemoveFromHistory,
  useSeriesWatchedSummary,
  useWatchedIds,
  type CatalogItemOut,
  type HistoryRemovalTarget,
} from '../catalog/catalogApi'
import { usePrefetchHint } from '../catalog/prefetchApi'
import { historyTargetHasProgress, type HistoryRemovalMode } from '../../lib/catalog/historyRemoval'
import { isRemoveColorKeyRegistered } from '../../lib/tizenColorKey'
import { computeNeighbor } from '../favorites/neighbor'
import { HistoryRemovalModal } from '../history/HistoryRemovalModal'
import { normalizeForSearch, searchWithinItems, SEARCH_MIN_CHARS } from '../../lib/catalog/catalogSearch'
import { gridNextIndex, useRemoteNav } from '../../lib/useRemoteNav'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { locateOrNeighbor, type LastFocus } from '../../lib/focus/reconcileFocus'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { FavoritesEmptyState, FavoritesUnresolvedNote } from '../favorites/FavoritesState'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { ContentCard } from '../../components/ContentCard'
import { RatingBadge } from '../../components/RatingBadge'
import { EmptyState } from '../../components/EmptyState'
import { LockedCategoryState } from '../../components/LockedCategoryState'
import { ErrorState } from '../../components/ErrorState'
import { describeError } from '../../lib/errors/errorCatalog'
import { useOnlineStatus } from '../../lib/onlineStatus'
import { Spinner } from '../../components/Spinner'
import { Modal } from '../../components/Modal'
import { Chip } from '../../components/Chip'
import { Icon } from '../../components/Icon'
import { AppShell } from '../../components/AppShell'
import { useOverflowEdges, type OverflowEdges } from '../../lib/focus/useOverflowEdges'
import { availableSortOptions, sortVodItems, VOD_SORT_LABEL_KEYS, type VodSortOption } from './vodSort'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { vodGroupDisplay } from './vodGroupDisplay'
import { recalledFocus, rememberFocus, sessionSort, setSessionSort, markHistoryKnown, type VodEntryKey, type VodSection } from './vodSessionMemory'
import type { VodCategoryRestore, VodTarget } from './vodTarget'

/** Moldura rolável com degradê de continuação (feature 050, D-008) — só nas bordas com itens ocultos. */
function scrollFrameClass(edges: OverflowEdges): string {
  return `vod-scroll-frame${edges.above ? ' is-more-above' : ''}${edges.below ? ' is-more-below' : ''}`
}

/** Card portrait de geometria fixa (D-006 do plan.md — sem `ResizeObserver`, mesma escolha do `Rail`, feature 022 R-002). */
const GRID_COLS = 6
/** Altura mínima de uma linha da grade (célula + vão). A largura da célula é CSS: as 6 colunas dividem a largura toda. */
const ROW_HEIGHT = 402
/** Teto da linha (acima, o pôster 2:3 cortaria demais nas laterais) e vão da coluna (`gap` de `.vod-content-column`). */
const ROW_HEIGHT_MAX = 470, COLUMN_GAP = 8
/** Linhas além das visíveis — as mesmas que a grade por células (lanes + 6 itens) desenhava; virtualiza linhas de 6 (065). */
const OVERSCAN_ABOVE = 3, OVERSCAN_BELOW = 2
/** "Todos" aos poucos (feature 039, T022): a próxima página é pedida a 10 fileiras do fim. */
const ALL_LOAD_AHEAD = GRID_COLS * 10

/**
 * O que difere entre Filmes e Séries — só rótulos (`logic/foco-vod.md` §1 da 025). Nenhuma decisão de dados aqui:
 * os hooks de catálogo são os mesmos para os dois, parametrizados por `kind`.
 */
interface VodSectionConfig {
  kind: 'movie' | 'series'
  /** Chaves do catálogo (`vod.movies.*` / `vod.series.*`, feature 054) — o texto vem de `t()`. */
  label: MessageKey
  loadingLabel: MessageKey
  emptyTitle: MessageKey
  emptyDescription: MessageKey
  searchPlaceholder: MessageKey
  loadError: MessageKey
  declared: MessageKey
  truncated: MessageKey
}

const SECTION_CONFIG: Record<VodSection, VodSectionConfig> = {
  movies: {
    kind: 'movie',
    label: 'vod.movies.label',
    loadingLabel: 'vod.movies.loading',
    emptyTitle: 'vod.movies.emptyTitle',
    emptyDescription: 'vod.movies.emptyDescription',
    searchPlaceholder: 'vod.movies.searchPlaceholder',
    loadError: 'vod.movies.loadError',
    declared: 'vod.movies.declared',
    truncated: 'vod.movies.truncated',
  },
  series: {
    kind: 'series',
    label: 'vod.series.label',
    loadingLabel: 'vod.series.loading',
    emptyTitle: 'vod.series.emptyTitle',
    emptyDescription: 'vod.series.emptyDescription',
    searchPlaceholder: 'vod.series.searchPlaceholder',
    loadError: 'vod.series.loadError',
    declared: 'vod.series.declared',
    truncated: 'vod.series.truncated',
  },
}

export interface VodCategoryScreenProps {
  section: VodSection
  sourceId: string
  target: VodTarget
  /** OK num card: abre o detalhe. `restore` é o que a tela precisa para reaparecer igual ao voltar. */
  onOpenItem: (itemId: string, restore: VodCategoryRestore) => void
  restore?: VodCategoryRestore
  /** RETURN (sem busca aberta): volta à vitrine. */
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo guardado de uma categoria sumiu do aparelho. */
  onResync: () => void
}

/** Chave estável da entrada, para `vodSessionMemory` — nunca índice. */
function entryKeyOf(target: VodTarget): VodEntryKey {
  return target.kind === 'category' ? `category:${target.name}` : target.kind
}

/**
 * Tela de categoria de Filmes/Séries (feature 052, US1): só Pesquisar, Ordenar e a grade em tela cheia. É o
 * `VodCatalogScreen` sem a trilha, a sidebar e a hero — a entrada vem de `target` (D-003/D-010) e RETURN volta à
 * vitrine. Busca inline, ordenação, favoritos, remoção do histórico e memória de foco por entrada são as de sempre.
 */
export function VodCategoryScreen({
  section,
  sourceId,
  target,
  onOpenItem,
  restore,
  onBack,
  onResync: onResyncRequested,
}: VodCategoryScreenProps): ReactNode {
  const t = useT()
  // Feature 042 (FR-004): ressincronizar precisa de internet — offline é soft disabled na
  // tela e o OK do teclado (mesma função) também não a dispara.
  const online = useOnlineStatus()
  const onResync = online ? onResyncRequested : (): void => {}
  const config = SECTION_CONFIG[section]
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  const enteredFavorites = target.kind === 'favorites'
  const enteredHistory = target.kind === 'history'
  const enteredAll = target.kind === 'all'
  const enteredByName = target.kind === 'category'
  const entryKey = entryKeyOf(target)

  // Estrutura: rápida, nunca toca rede (FR-004). Só a categoria real precisa dela (nome → registro).
  const categoriesQuery = useCategoryList(sourceId, config.kind)
  const categories = categoriesQuery.data ?? []
  const namedCategory = enteredByName ? categories.find((c) => groupLabel(c.name) === target.name) : undefined
  // Feature 066 (FR-013/FR-014): categoria bloqueada não é lida nem pedida à rede — as consultas a recebem como ausente.
  const enteredLocked = namedCategory?.locked === true
  const enteredCategory = enteredLocked ? undefined : namedCategory
  // O OK que trouxe a pessoa até aqui já pediu a categoria: o PIN abre junto (`logic/pin.md` §4).
  const [pinOpen, setPinOpen] = useState(true)
  // A seção da categoria aberta segue à frente da fila de pré-carga (feature 038).
  usePrefetchHint(config.kind, enteredCategory?.id)

  const [searchActive, setSearchActive] = useState(restore?.searchActive ?? false)
  const [searchTerm, setSearchTerm] = useState(restore?.searchTerm ?? '')
  const [toolbarFocus, setToolbarFocus] = useState<'search' | 'sort' | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const belowMinimum = normalizeForSearch(searchTerm).length < SEARCH_MIN_CHARS

  // Ordenar (feature 025, US4) — escolha por seção na sessão (D-008); nunca em ★/↺, que têm ordem própria (FR-022).
  // "Ver tudo" de Adicionados recentemente abre "Todos" já em Recém-adicionados SÓ nesta abertura (D-010 da 052).
  const [sortOption, setSortOption] = useState<VodSortOption>(() =>
    target.kind === 'all' && target.sort ? target.sort : sessionSort(section),
  )
  const [sortOpen, setSortOpen] = useState(false)
  const [sortFocusIdx, setSortFocusIdx] = useState(0)

  useEffect(() => {
    if (searchActive && toolbarFocus === 'search') searchInputRef.current?.focus()
    else searchInputRef.current?.blur()
  }, [searchActive, toolbarFocus])

  // "↺ Histórico": marcar conhecido para a contagem passar a existir noutras telas (§5 de `logic/historico.md` da 025).
  useEffect(() => {
    if (enteredHistory) markHistoryKnown(sourceId, section)
  }, [enteredHistory, sourceId, section])

  // Feature 065 (SC-007): categoria grande na ordem da fonte e sem busca lê por janela; busca/ordenar, a categoria inteira.
  const categoryWindow = useCategoryWindow(sourceId, enteredCategory, !searchActive && sortOption === 'source')
  const { windowed, loadMore: loadWindow } = categoryWindow
  const fullContent = useCategoryContent(sourceId, windowed ? undefined : enteredCategory)
  const content = windowed ? categoryWindow : fullContent
  const favoriteIdsQuery = useFavoriteIds(sourceId, config.kind)
  const favoriteIds = favoriteIdsQuery.data ?? new Set<string>()
  const watchedIdsQuery = useWatchedIds(sourceId, section === 'movies' ? config.kind : 'channel')
  const watchedIds = section === 'movies' ? (watchedIdsQuery.data ?? new Set<string>()) : new Set<string>()
  const watchedSummaryQuery = useSeriesWatchedSummary(section === 'series' ? sourceId : null)
  const watchedSummary = watchedSummaryQuery.data ?? new Map<string, { known: number; watched: number; upToDate: boolean }>()
  const favoritesContent = useFavoritesContent(sourceId, config.kind, enteredFavorites)
  // Feature 039 (T022): "Todos" na ordem da fonte e sem busca lê aos poucos,
  // conforme a pessoa desce; ordenar e buscar precisam do tipo inteiro.
  const allProgressive = !searchActive && sortOption === 'source'
  // T033: com "Todos" aos poucos, "Ano"/"Recém-adicionados" podem estar só em
  // categorias ainda não lidas — o modal pergunta ao tipo inteiro (só aberto).
  const kindSortFieldsQuery = useKindSortFields(sourceId, config.kind, enteredAll && allProgressive && sortOpen)
  const aggregated = useAggregatedItems(sourceId, config.kind, enteredAll, { progressive: allProgressive })
  const historyContent = useHistoryContent(sourceId, config.kind, enteredHistory)

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
        : categoriesQuery.isLoading || content.isLoading
  const contentFailed = enteredFavorites
    ? favoritesContent.isError
    : enteredHistory
      ? historyContent.isError
      : enteredAll
        ? false
        : content.data?.outcome === 'failed' || content.isError
  const contentMissing = enteredByName && content.data?.outcome === 'source_missing'
  const contentUnavailable = contentFailed || contentMissing
  // Feature 042: código da tabela de erros da falha da categoria (nunca o erro cru).
  const contentErrorCode = enteredByName ? content.data?.errorCode : undefined

  // "Pesquisar" e "Ordenar" só com itens carregados (FR-016/FR-017); "Ordenar" nunca em ★/↺ (FR-022).
  const canSearch = !contentUnavailable && baseItems.length > 0
  const canSort = canSearch && !enteredFavorites && !enteredHistory

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
  // Opção salva pode não estar disponível nesta entrada (ex.: "Ano" numa categoria M3U) — a grade usa "Ordem da
  // fonte" sem apagar a escolha da seção (D-008).
  // "Nota" (feature 056) não é opção do modal: só vale como destino do "Ver tudo" de "Bem avaliados", em "Todos".
  const effectiveSortOption: VodSortOption =
    (sortOption === 'rating' && enteredAll) || availableOptions.includes(sortOption) ? sortOption : 'source'

  const items = useMemo(() => {
    const filtered = !searchActive ? baseItems : belowMinimum ? [] : searchWithinItems(baseItems, searchTerm, (item) => item.name)
    if (enteredFavorites || enteredHistory || effectiveSortOption === 'source') return filtered
    return sortVodItems(filtered, effectiveSortOption)
  }, [searchActive, belowMinimum, baseItems, searchTerm, enteredFavorites, enteredHistory, effectiveSortOption])

  const [focusedItemId, setFocusedItemId] = useState<string | null>(
    () => restore?.focusedItemId ?? recalledFocus(sourceId, section, entryKey),
  )
  // Feature 038 (FR-027): se a renovação em segundo plano tirou o item em foco, o foco fica no vizinho (mesma
  // posição), não volta ao topo.
  const lastItemFocusRef = useRef<LastFocus | null>(null)
  const itemListKey = JSON.stringify(entryKey)
  // Feature 036 (T021, US1/AC9): voltando do detalhe, o card de origem pode não existir mais (removido do Histórico
  // lá). `focusedIndexHint` do restore dá o vizinho na mesma posição. Vale enquanto o foco ainda é o id restaurado.
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

  // Feature 039 (T022): "Todos" aos poucos pede a próxima página quando o foco chega perto do fim do que já foi lido
  // — e também enquanto o item a restaurar ainda não apareceu, para "Voltar restaura foco" valer mesmo lá embaixo.
  const { hasMore: allHasMore, loadMore: loadMoreAll }: { hasMore?: boolean; loadMore?: (index?: number) => void } = windowed ? categoryWindow : aggregated
  const focusedNotLoaded = focusedItemId !== null && !items.some((item) => item.id === focusedItemId)
  // Só persegue um item que ainda existe: confere primeiro, lendo só o bloco do item; id trocado vira o id novo.
  const [focusCheck, setFocusCheck] = useState<{ id: string; exists: boolean } | null>(null)
  useEffect(() => {
    if (!(enteredAll || windowed) || !focusedNotLoaded || focusedItemId === null) return
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
  }, [enteredAll, windowed, focusedNotLoaded, focusedItemId, focusCheck])
  const chasingFocus = focusedNotLoaded && focusCheck?.id === focusedItemId && focusCheck.exists
  useEffect(() => {
    if (!(enteredAll || windowed) || !allHasMore || !loadMoreAll) return
    if (chasingFocus || itemIdx >= items.length - ALL_LOAD_AHEAD) loadMoreAll(chasingFocus && applyRestoreHint ? restoreHint?.index : undefined)
  }, [enteredAll, windowed, allHasMore, loadMoreAll, chasingFocus, applyRestoreHint, restoreHint, itemIdx, items.length])

  const gridContainerRef = useRef<HTMLDivElement | null>(null)
  const gridFrameRef = useRef<HTMLDivElement | null>(null)
  // Ad-hoc 2026-10-09: sem a topbar, as 2 linhas crescem até ocupar a coluna, descontados os avisos abaixo da grade (entre
  // ROW_HEIGHT e ROW_HEIGHT_MAX). Medido a cada desenho, sem ResizeObserver; `setRowPx` só roda se a altura mudar.
  const [rowPx, setRowPx] = useState(ROW_HEIGHT)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- medição de layout a cada desenho, convergente (máx. 1 ajuste)
  useLayoutEffect(() => {
    const frame = gridFrameRef.current
    const column = frame?.parentElement
    const scale = frame && frame.offsetWidth > 0 ? frame.getBoundingClientRect().width / frame.offsetWidth : 0 // palco escalado
    if (!frame || !column || !(scale > 0)) return // sem layout real (testes): fica no mínimo
    let below = 0
    for (let el = frame.nextElementSibling; el; el = el.nextElementSibling) below += el.getBoundingClientRect().height / scale + COLUMN_GAP
    const free = (column.getBoundingClientRect().bottom - frame.getBoundingClientRect().top) / scale - below
    const next = Math.min(ROW_HEIGHT_MAX, Math.max(ROW_HEIGHT, Math.floor(free / 2)))
    if (next !== rowPx) setRowPx(next)
  })
  const estimateRow = useCallback(() => rowPx, [rowPx]) // estável por altura: nunca uma função nova a cada desenho
  const itemVirtualizer = useVirtualizer({
    count: Math.ceil((windowed ? (content.data?.totalCount ?? 0) : items.length) / GRID_COLS),
    getScrollElement: () => gridContainerRef.current,
    estimateSize: estimateRow,
    rangeExtractor: ({ startIndex, endIndex, count }) => { const first = Math.max(0, startIndex - OVERSCAN_ABOVE); return Array.from({ length: Math.max(0, Math.min(count - 1, endIndex + OVERSCAN_BELOW) - first + 1) }, (_, i) => first + i) },
  })
  // `estimateSize` novo não invalida as medidas já feitas: refaz só quando a altura muda de fato (nunca na montagem).
  const measuredRowPx = useRef(rowPx)
  useEffect(() => { if (measuredRowPx.current !== rowPx) { measuredRowPx.current = rowPx; itemVirtualizer.measure() } })
  const lastVisibleIndex = ((itemVirtualizer.getVirtualItems().at(-1)?.index ?? 0) + 1) * GRID_COLS - 1 // por janela, rolar até linhas não lidas as lê
  useEffect(() => { if (windowed && lastVisibleIndex >= items.length - GRID_COLS) loadWindow(lastVisibleIndex) }, [windowed, loadWindow, lastVisibleIndex, items.length])
  // Indicador de continuação (feature 050, FR-010): só desenho, nenhuma regra de foco depende dele.
  const gridEdges = useOverflowEdges(gridContainerRef, items.length)

  const itemsNavigable = !contentIsLoading && !contentUnavailable && items.length > 0
  // A grade mostra sempre 2 linhas INTEIRAS: o foco rola de linha em linha (scrollTop múltiplo da altura da linha), nunca
  // deixando uma linha cortada em cima ou embaixo — o `scrollToIndex` do virtualizador alinharia à borda do contêiner,
  // que tem folga de anel.
  const scrollToRow = (index: number) => {
    const el = gridContainerRef.current
    if (!el) return
    const row = Math.floor(index / GRID_COLS)
    const top = Math.round(el.scrollTop / rowPx)
    const next = row < top ? row : row > top + 1 ? row - 1 : top
    if (next !== top) el.scrollTop = next * rowPx
  }
  useVirtualFocusSync({
    focusedIndex: itemIdx,
    scrollToIndex: scrollToRow,
    enabled: itemsNavigable,
  })

  /** Memória de foco por entrada (FR-030, `logic/foco-vod.md` §4 da 025): grava a cada foco na grade. */
  useEffect(() => {
    if (!focusedItemId) return
    rememberFocus(sourceId, section, entryKey, focusedItemId)
  }, [entryKey, focusedItemId, sourceId, section])

  function retryContent() {
    if (enteredFavorites) void favoritesContent.refetch()
    else if (enteredHistory) void historyContent.refetch()
    else void content.refetch()
  }

  /** Segurar OK/tecla amarela favorita — nunca em "↺ Histórico" (só leitura, FR-014) nem na toolbar. */
  const canToggleFavorite = toolbarFocus === null && !enteredHistory && activeItem !== undefined

  function toggleFocusedFavorite() {
    if (!activeItem) return
    void favoriteToggle.toggle(activeItem, {
      visibleItems: enteredFavorites ? items : undefined,
      onFocusNeighbor: enteredFavorites ? setFocusedItemId : undefined,
    })
  }

  // Remover do "↺ Histórico" pela tecla vermelha (feature 036, `logic/remocao-historico.md` §8). `removal` é o modal
  // aberto; `removalOpening` cobre a leitura local de "tem progresso" que precede a abertura.
  const removeFromHistory = useRemoveFromHistory()
  const [removal, setRemoval] = useState<{ item: CatalogItemOut; hasProgress: boolean; error: boolean } | null>(null)
  const [removalOpening, setRemovalOpening] = useState(false)

  /**
   * Só na grade do Histórico, com um item focado, nada aberto por cima. Com o modal (de remoção ou de Ordenar) aberto
   * a tecla NÃO pode ter handler: o `Modal` não intercepta tecla não mapeada, e ela chegaria aqui (FR-021).
   */
  const canRemoveFromHistory =
    enteredHistory &&
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
    const historyTarget = item ? historyTargetOf(item) : null
    if (!item || !historyTarget) return
    setRemovalOpening(true)
    void historyTargetHasProgress(historyTarget)
      .then(
        (hasProgress) => setRemoval({ item, hasProgress, error: false }),
        // Leitura local falhou: oferece só o seguro (sem "apagar progresso").
        () => setRemoval({ item, hasProgress: false, error: false }),
      )
      .finally(() => setRemovalOpening(false))
  }

  function confirmHistoryRemoval(mode: HistoryRemovalMode) {
    if (!removal) return
    const historyTarget = historyTargetOf(removal.item)
    if (!historyTarget) return
    // Vizinho calculado ANTES de a lista mudar (FR-017).
    const neighbor = computeNeighbor(items, removal.item.id)
    removeFromHistory.mutate(
      { target: historyTarget, mode },
      {
        onSuccess: () => {
          setRemoval(null)
          showToast(t('vod.removedFromHistory'))
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

  // Estados que ocupam a tela inteira (sem grade): o OK nelas faz a ação do botão focado.
  const blockedByCategories =
    enteredByName && (categoriesQuery.isError || (!categoriesQuery.isLoading && categories.length === 0))

  useRemoteNav({
    onDirection: (dir) => {
      if (enteredLocked) return // só "Desbloquear": nada a mover
      const hasTop = items.length > 0
      if (hasTop && toolbarFocus !== null) {
        if (dir === 'down') {
          setToolbarFocus(null)
          setFocusedItemId(items[0].id)
          return
        }
        // Sem topbar nesta tela (ad-hoc 2026-10-09): ↑ na toolbar fica nela — RETURN volta à vitrine, que tem a topbar.
        if (dir === 'up') return
        // ←/→ dentro da toolbar (D-007 do plan.md da 025) — nunca alcançados com o campo de busca com foco DOM
        // real (a guarda de alvo editável intercepta antes).
        if (dir === 'right' && toolbarFocus === 'search' && canSort) {
          setToolbarFocus('sort')
          return
        }
        if (dir === 'left' && toolbarFocus === 'sort' && canSearch) {
          setToolbarFocus('search')
          return
        }
        return
      }
      if (hasTop && toolbarFocus === null && dir === 'up' && itemIdx < GRID_COLS) {
        const toolbar = canSearch ? 'search' : canSort ? 'sort' : null
        if (toolbar) setToolbarFocus(toolbar)
        return
      }
      if (!hasTop) return
      // Sem trilha à esquerda: ← na 1ª coluna não faz nada (RETURN volta à vitrine).
      if (dir === 'left' && itemIdx % GRID_COLS === 0) return
      if (toolbarFocus === null) {
        const next = gridNextIndex(dir, itemIdx, items.length, GRID_COLS)
        setFocusedItemId(items[next]?.id ?? null)
      }
    },
    onSelect: () => {
      if (enteredLocked) {
        setPinOpen(true)
        return
      }
      // Estados de tela cheia (carregando, vazios, lista sem categorias): o botão focado é "Voltar".
      if (blockedByCategories || contentIsLoading) {
        onBack()
        return
      }
      if (enteredFavorites && !contentFailed && items.length === 0) {
        onBack()
        return
      }
      if (enteredHistory && !contentFailed && items.length === 0) {
        onBack()
        return
      }
      if (enteredAll && items.length === 0) {
        onBack()
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
      // Categoria real vazia (ou que não existe mais), sem falha (T021 da 025).
      if (enteredByName && items.length === 0 && !searchActive) {
        onBack()
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
      // Estado de volta (feature 017/018/025/052): guardado ANTES de abrir o detalhe. `focusedIndexHint` é só
      // dica de vizinho para quando o card de origem não existir mais ao voltar — nunca identidade.
      onOpenItem(item.id, { focusedItemId: item.id, searchTerm, searchActive, focusedIndexHint: itemIdx })
    },
    onLongSelect: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onFavoriteKey: canToggleFavorite ? toggleFocusedFavorite : undefined,
    onRemoveKey: canRemoveFromHistory ? openHistoryRemoval : undefined,
    onBack: () => {
      if (searchActive && toolbarFocus === null) {
        setToolbarFocus('search')
        return
      }
      if (searchActive && toolbarFocus === 'search') {
        setSearchActive(false)
        setSearchTerm('')
        return
      }
      onBack()
    },
  })

  /**
   * Moldura V14 sem a topbar (ad-hoc 2026-10-09): a grade sobe e ganha a altura dela. O shell fica pelo banner de
   * conexão e pela safe zone; Início/Live/Séries/Busca/Configurações continuam na vitrine, a um RETURN daqui.
   */
  function withShell(children: ReactNode): ReactNode {
    return <AppShell topBar={null}>{children}</AppShell>
  }

  if (enteredByName && categoriesQuery.isLoading) {
    return withShell(
      <div className="screen vod-screen">
        <div className="vod-state-wrapper">
          <Spinner size={48} />
          <EmptyState title={t(config.loadingLabel)} action={{ label: t('common.back'), onSelect: onBack }} focused />
        </div>
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (enteredByName && categoriesQuery.isError) {
    return withShell(
      <div className="screen vod-screen">
        <ErrorState
          title={t(config.loadError)}
          description={t('vod.retryLater')}
          actions={[
            { label: t('common.retry'), onSelect: () => void categoriesQuery.refetch() },
            { label: t('common.back'), onSelect: onBack },
          ]}
          focusedActionIndex={0}
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (enteredLocked && namedCategory) {
    return withShell(
      <div className="screen vod-screen">
        <LockedCategoryState
          name={vodGroupDisplay(namedCategory.name, t)}
          focused
          pinOpen={pinOpen}
          onOpenPin={() => setPinOpen(true)}
          onClosePin={() => setPinOpen(false)}
          sourceId={sourceId}
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (enteredByName && categories.length === 0) {
    return withShell(
      <div className="screen vod-screen">
        <EmptyState
          title={t(config.emptyTitle)}
          description={t(config.emptyDescription)}
          action={{ label: t('common.back'), onSelect: onBack }}
          focused
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  const contentStale = enteredByName && content.data?.outcome === 'stale-served'
  const truncated = enteredByName && !windowed && (content.data?.totalCount ?? 0) > items.length
  const declaredCount = enteredCategory?.declaredCount
  const realCount = content.data?.totalCount
  const countsDiverge =
    enteredByName &&
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

  const entryLabel = enteredAll
    ? t('live.all')
    : enteredFavorites
      ? t('live.favoritesStar')
      : enteredHistory
        ? t('vod.historyStar')
        : vodGroupDisplay(target.kind === 'category' ? target.name : undefined, t)

  return withShell(
    <div className="screen vod-screen">
      <div className="vod-body">
        <div className="vod-content-column">
          <div className="vod-toolbar">
            <div className="vod-toolbar-title">
              <span className="vod-page-title">{t(config.label)}</span>
              <Chip selected={false}>{entryLabel}</Chip>
              {content.data?.totalCount !== undefined && enteredByName && (
                <Chip selected={false}>{t('vod.titleCount', { n: content.data.totalCount })}</Chip>
              )}
            </div>
            {canSearch && !searchActive && (
              <button
                type="button"
                className={`vod-toolbar-search-button${toolbarFocus === 'search' ? ' tv-focus' : ''}`}
              >
                <Icon name="search" />
                <span>{t('vod.search')}</span>
                <span className="vod-toolbar-search-hint" aria-hidden="true">
                  OK
                </span>
              </button>
            )}
            {searchActive && (
              <div className="vod-toolbar-search-field">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="search-field field-box"
                  // Achado real (feature 028, FR-015): sem aria-label nem <label>, o campo não tinha nome acessível.
                  aria-label={t('live.searchCategory')}
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
                  placeholder={t(config.searchPlaceholder)}
                />
                <div className="search-status">
                  {belowMinimum && <span>{t('live.searchMin')}</span>}
                  {!belowMinimum && <span>{t.plural('live.results', items.length)}</span>}
                  {searchCoveragePartial && (
                    <span className="search-coverage">
                      {t('live.searchCoverage', { covered: aggregated.coveredCategories, total: aggregated.totalCategories })}
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
                <span className="vod-toolbar-sort-label">{t('vod.sort')}</span>
                <span className="vod-toolbar-sort-sep" aria-hidden="true">
                  {' · '}
                </span>
                <span className="vod-toolbar-sort-value">{t(VOD_SORT_LABEL_KEYS[effectiveSortOption])} ▾</span>
              </button>
            )}
          </div>

          {sortOpen && (
            <Modal
              ariaLabel={t('vod.sort')}
              onBack={() => {
                setSortOpen(false)
                setToolbarFocus('sort')
              }}
              onDirection={(dir) => {
                if (dir === 'up' || dir === 'down') {
                  setSortFocusIdx((i) => Math.min(Math.max(i + (dir === 'down' ? 1 : -1), 0), availableOptions.length - 1))
                }
              }}
              onSelect={() => {
                const option = availableOptions[sortFocusIdx]
                if (option) chooseSort(option)
              }}
            >
              <ul className="vod-sort-modal-list">
                {availableOptions.map((option, index) => (
                  <li key={option} className={`vod-sort-modal-item${index === sortFocusIdx ? ' tv-focus' : ''}`}>
                    {option === effectiveSortOption && <span aria-hidden="true">✓ </span>}
                    {t(VOD_SORT_LABEL_KEYS[option])}
                  </li>
                ))}
              </ul>
            </Modal>
          )}

          {searchNoResults && (
            <div className="vod-state">
              <div className="vod-state-title">{t('live.noResults', { term: searchTerm })}</div>
              {searchCoveragePartial && (
                <div className="vod-state-copy">
                  {t('live.searchCoverage', { covered: aggregated.coveredCategories, total: aggregated.totalCategories })}
                </div>
              )}
            </div>
          )}

          {enteredAll && !searchActive && searchCoveragePartial && (
            <div className="vod-truncated-note">
              {t('live.searchCoverage', { covered: aggregated.coveredCategories, total: aggregated.totalCategories })}
            </div>
          )}

          {!searchActive && contentIsLoading && (
            <div className="vod-state-wrapper">
              <Spinner size={32} />
              <EmptyState title={t(config.loadingLabel)} action={{ label: t('common.back'), onSelect: onBack }} focused />
            </div>
          )}

          {!searchActive && !contentIsLoading && contentFailed && (
            <ErrorState
              title={t('live.categoryError')}
              description={contentErrorCode ? describeError(contentErrorCode, t).title : undefined}
              code={contentErrorCode}
              actions={[{ label: t('common.retry'), onSelect: retryContent }]}
              focusedActionIndex={0}
            />
          )}

          {!searchActive && !contentIsLoading && contentMissing && (
            <ErrorState
              title={t('live.missingTitle')}
              description={online ? undefined : t('live.missingOffline')}
              actions={[
                {
                  label: t('live.resync'),
                  onSelect: onResync,
                  softDisabledReason: online ? undefined : t('live.unavailableOffline'),
                },
              ]}
              focusedActionIndex={0}
            />
          )}

          {!searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && items.length === 0 && (
            <FavoritesEmptyState kind={config.kind} focused onBack={onBack} />
          )}

          {!searchActive && !contentIsLoading && !contentUnavailable && enteredHistory && items.length === 0 && (
            <EmptyState
              title={t('vod.historyEmptyTitle')}
              description={t('vod.historyEmptyDescription')}
              action={{ label: t('common.back'), onSelect: onBack }}
              focused
            />
          )}

          {!searchActive && !contentIsLoading && !contentUnavailable && enteredAll && items.length === 0 && (
            <EmptyState
              title={t('live.noneFetchedTitle')}
              description={t('live.noneFetchedDescription')}
              action={{ label: t('common.back'), onSelect: onBack }}
              focused
            />
          )}

          {!searchActive && !contentIsLoading && !contentUnavailable && enteredByName && items.length === 0 && (
            <EmptyState title={t('vod.emptyCategory')} action={{ label: t('common.back'), onSelect: onBack }} focused />
          )}

          {!searchActive && contentStale && <div className="vod-truncated-note">{t('live.stale')}</div>}

          {countsDiverge && (
            <div className="vod-truncated-note">
              {t(config.declared, { declared: declaredCount ?? '', real: realCount ?? '' })}
            </div>
          )}

          {!searchActive && !contentIsLoading && !contentUnavailable && enteredFavorites && (
            <FavoritesUnresolvedNote unresolved={unresolvedFavorites} />
          )}

          {!searchActive && !contentIsLoading && !contentUnavailable && enteredHistory && unresolvedHistory > 0 && (
            <div className="vod-truncated-note">
              {section === 'movies'
                ? t.plural('vod.historyUnresolvedMovies', unresolvedHistory)
                : t('vod.historyUnresolvedSeries', { n: unresolvedHistory })}
            </div>
          )}

          {/* A dica de favoritar fica só no rodapé (HintBar): o espaço vira linha de cards (feature 052). */}
          {/* Só com a tecla vermelha registrada de fato (FR-003, D-007 da 036): nunca prometer uma tecla que não chega. */}
          {showResultsGrid && enteredHistory && isRemoveColorKeyRegistered() && (
            <div className="fav-hint">{t('vod.removeHint')}</div>
          )}

          {showResultsGrid && (
            <div ref={gridFrameRef} className={scrollFrameClass(gridEdges)} style={{
                // Só 2 linhas: a folga do .vod-grid (anel de foco) não deixa a 3ª linha aparecer embaixo; em cima e nos lados continua livre.
                maxHeight: 2 * rowPx,
                ['--vod-row-height' as string]: `${rowPx}px`,
                clipPath: 'inset(calc(var(--space-1) / 2) -40px calc(var(--space-1) / 2) -40px)',
              }}>
              <div ref={gridContainerRef} className="vod-grid no-scrollbar">
                <div className="vod-grid-inner" style={{ height: itemVirtualizer.getTotalSize() }}>
                  {itemVirtualizer.getVirtualItems().flatMap((virtualRow) => Array.from({ length: GRID_COLS }, (_, lane) => ({ index: virtualRow.index * GRID_COLS + lane, lane, start: virtualRow.start }))).map((virtualRow) => {
                    const item = items[virtualRow.index]
                    if (!item) return null
                    const isFavorite = favoriteIds.has(stableIdOf(item) ?? '')
                    const isWatched = section === 'movies' && watchedIds.has(stableIdOf(item) ?? '')
                    const summary = section === 'series' && item.series_id ? watchedSummary.get(item.series_id) : undefined
                    const watchedLabel =
                      summary && summary.known > 0 ? (summary.upToDate ? t('vod.upToDate') : `${summary.watched}/${summary.known}`) : undefined
                    return (
                      <div
                        key={item.id}
                        className="vod-grid-cell"
                        style={{
                          // A coluna vira `left` em CSS (`.vod-grid-cell`): as 6 colunas se distribuem pela largura disponível.
                          ['--lane' as string]: virtualRow.lane % GRID_COLS,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <ContentCard
                          variant="portrait"
                          title={item.name}
                          meta={enteredAll || item.original_group ? vodGroupDisplay(item.original_group, t) : t(config.label)}
                          iconUrl={item.icon_url ?? undefined}
                          focused={toolbarFocus === null && itemIdx === virtualRow.index && removal === null}
                          badge={
                            <>
                              {isFavorite && (
                                <span className="fav-star" aria-hidden="true">
                                  ★
                                </span>
                              )}
                              <RatingBadge value={item.provider_rating} />
                              {isWatched && <span className="watched-badge">{t('vod.watched')}</span>}
                              {watchedLabel && <span className="watched-badge">{watchedLabel}</span>}
                            </>
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {truncated && (
            <div className="vod-truncated-note">
              {t(config.truncated, { shown: items.length, total: content.data?.totalCount ?? '' })}
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
  )
}

