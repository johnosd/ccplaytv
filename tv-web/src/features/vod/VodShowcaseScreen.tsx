import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import {
  groupLabel,
  stableIdOf,
  useCategoryFocusPrefetch,
  useCategoryList,
  useCachedBackdrops,
  useCategoryPreviews,
  useFavoritesContent,
  useHistoryContent,
  useDailyTip,
  useRecentlyAdded,
  useTopRated,
  useWeeklyTop10,
  useResumePositions,
  useSeriesWatchedSummary,
  useWatchedIds,
  type CatalogCategory,
  type CatalogItemOut,
} from '../catalog/catalogApi'
import { prioritizeCategory, usePrefetchHint } from '../catalog/prefetchApi'
import { knownCategoryCount } from '../catalog/categoryCount'
import { formatTime } from '../../lib/player/formatTime'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useIdFocus } from '../../lib/focus/useIdFocus'
import { useVirtualFocusSync } from '../../lib/focus/useVirtualFocusSync'
import { useToast } from '../../lib/useToast'
import { useOnlineStatus } from '../../lib/onlineStatus'
import { useAnnounce } from '../../lib/announcer'
import { comingSoonMessage, comingSoonToast } from '../../lib/comingSoon'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { Toast } from '../../components/Toast'
import { ContentCard } from '../../components/ContentCard'
import { RatingBadge } from '../../components/RatingBadge'
import { Rail } from '../../components/Rail'
import { SideCategoryNav, type SideCategoryNavEntry } from '../../components/SideCategoryNav'
import { useScrollFocusedIntoView } from '../../lib/focus/useScrollFocusedIntoView'
import { useOverflowEdges, type OverflowEdges } from '../../lib/focus/useOverflowEdges'
import { SeeAllCard } from '../../components/SeeAllCard'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { Spinner } from '../../components/Spinner'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import type { TopbarItem } from '../../navigation/appNav'
import { VodHeroArt } from './VodHeroArt'
import { vodGroupDisplay } from './vodGroupDisplay'
import type { VodShellProps } from './vodShell'
import type { VodSection } from './vodSessionMemory'
import { DISCOVERY_LIMIT } from '../../lib/metadata/discoveryRules'
import { SHOWCASE_LIMIT, allHaveBackdrop } from './vodShowcase'
import { ROW_FORMATS, type RowFormatMetrics } from './vodRowFormats'
import { measuredRowPitch, pagedIndex, pageSizeFor, scrollByPage } from '../../lib/focus/paging'
import { SEE_ALL_ID, SLOT_ENTRY_ID, buildShowcaseRows, type ShowcaseRowSpec } from './vodShowcaseRows'
import {
  focusedEntryId,
  initialShowcaseFocus,
  moveShowcaseHorizontal,
  moveShowcaseVertical,
  reconcileShowcaseFocus,
  type ShowcaseFocusState,
} from './vodShowcaseFocus'
import type { VodShowcaseFocus, VodShowcaseRow, VodTarget } from './vodTarget'

export interface VodShowcaseScreenProps {
  section: VodSection
  sourceId: string
  /** OK num card de item: abre o detalhe. `from` é o foco da vitrine naquele instante (devolvido em `restore`). */
  onOpenItem: (itemId: string, from: VodShowcaseFocus) => void
  /** OK num cartão de categoria ou "Ver tudo": abre a tela de categoria. */
  onOpenTarget: (target: VodTarget, from: VodShowcaseFocus) => void
  /** Foco a restaurar ao voltar de uma categoria ou do detalhe — por id, nunca por índice. */
  restore?: VodShowcaseFocus
  onBack: () => void
  /** Feature 014, D-008: ressincroniza a fonte quando o arquivo de uma categoria sumiu do aparelho. */
  onResync: () => void
  shell?: VodShellProps
  initialTopbarItem?: TopbarItem
}

/** Fileiras de categoria consultadas ao redor da focada (`logic/carrosseis-e-foco.md` §4): −1 … +3. */
const WINDOW_BEFORE = 1
const WINDOW_AFTER = 3
/** Espera antes de pedir prioridade à pré-carga: passar o foco rápido por categorias não dispara nada. */
const PRIORITIZE_DEBOUNCE_MS = 300
/** Até quando dados que chegam ainda podem decidir o foco inicial (ver `startedInSide`). */
const INITIAL_FOCUS_SETTLE_MS = 1200
/** Cartões fantasma (decorativos) de um slot reservado, contando o cartão focável. */
const SLOT_CARD_COUNT = 6

/** Chaves do catálogo por seção (feature 054): `vod.<seção>.*` (compartilhadas com a tela de categoria) e o eyebrow. */
const SECTION_COPY: Record<
  VodSection,
  {
    kind: 'movie' | 'series'
    label: MessageKey
    loadingLabel: MessageKey
    loadError: MessageKey
    emptyTitle: MessageKey
    emptyDescription: MessageKey
    eyebrow: MessageKey
  }
> = {
  movies: {
    kind: 'movie',
    label: 'vod.movies.label',
    loadingLabel: 'vod.movies.loading',
    loadError: 'vod.movies.loadError',
    emptyTitle: 'vod.movies.emptyTitle',
    emptyDescription: 'vod.movies.emptyDescription',
    eyebrow: 'showcase.eyebrow.movies',
  },
  series: {
    kind: 'series',
    label: 'vod.series.label',
    loadingLabel: 'vod.series.loading',
    loadError: 'vod.series.loadError',
    emptyTitle: 'vod.series.emptyTitle',
    emptyDescription: 'vod.series.emptyDescription',
    eyebrow: 'showcase.eyebrow.series',
  },
}

type ItemEntry = { id: string; kind: 'item'; item: CatalogItemOut }
type SeeAllEntry = { id: typeof SEE_ALL_ID; kind: 'see-all' }
type SlotEntry = { id: typeof SLOT_ENTRY_ID; kind: 'slot' }
type Entry = ItemEntry | SeeAllEntry | SlotEntry

/** Entrada da lista lateral de categorias (a lista lateral não é uma fileira — E-1 da 052). */
type SideEntry = {
  id: string
  label: string
  count?: number
  target: VodTarget
}

const SEE_ALL_ENTRY: SeeAllEntry = { id: SEE_ALL_ID, kind: 'see-all' }
const SLOT_ENTRY: SlotEntry = { id: SLOT_ENTRY_ID, kind: 'slot' }

function itemEntries(items: readonly CatalogItemOut[]): Entry[] {
  if (items.length === 0) return []
  const shown = items.slice(0, SHOWCASE_LIMIT).map((item): Entry => ({ id: item.id, kind: 'item', item }))
  return [...shown, SEE_ALL_ENTRY]
}

/** Fileiras do TMDB (feature 057): só os cards, sem "Ver tudo" — não há uma grade "de todos" para elas. */
function plainEntries(items: readonly CatalogItemOut[]): Entry[] {
  return items.slice(0, DISCOVERY_LIMIT).map((item): Entry => ({ id: item.id, kind: 'item', item }))
}

/** Moldura rolável com degradê de continuação (features 050/052) — só nas bordas com itens ocultos. */
function scrollFrameClass(edges: OverflowEdges): string {
  return `vod-scroll-frame${edges.above ? ' is-more-above' : ''}${edges.below ? ' is-more-below' : ''}`
}

/**
 * Tela hero de Filmes/Séries (features 052/053): hero do card focado + lista lateral de categorias + fileiras
 * (Continue assistindo, Top 10 da semana (feature 057; TMDB, só com dado), ★ Favoritos, Adicionados recentemente, Bem avaliados
 * (feature 056; só com nota real), Dica (feature 057; TMDB, só com dado), Porque você assistiu* e um carrossel por categoria;
 * *reservada "Em breve"). As fileiras são descritores (`buildShowcaseRows`), o foco é puro
 * (`vodShowcaseFocus`) e a pilha vertical é virtualizada. Focar nunca consulta nem reproduz (ADR-011): só OK age.
 */
export function VodShowcaseScreen({
  section,
  sourceId,
  onOpenItem,
  onOpenTarget,
  restore,
  onBack,
  onResync,
  shell,
  initialTopbarItem,
}: VodShowcaseScreenProps): ReactNode {
  const t = useT()
  const copy = SECTION_COPY[section]
  const online = useOnlineStatus()
  const { toastMessage, toastKey } = useToast()
  const announce = useAnnounce()

  // Composição de foco topbar ↔ conteúdo (feature 023/024) — só existe de fato com `shell`.
  const [zone, setZone] = useState<'topbar' | 'content'>(initialTopbarItem ? 'topbar' : 'content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>(initialTopbarItem ?? section)
  const active = !shell || zone === 'content'

  const categoriesQuery = useCategoryList(sourceId, copy.kind)
  const categories: CatalogCategory[] = categoriesQuery.data ?? []
  const historyQuery = useHistoryContent(sourceId, copy.kind, true)
  const favoritesQuery = useFavoritesContent(sourceId, copy.kind, true)
  const addedQuery = useRecentlyAdded(sourceId, copy.kind)
  const ratedQuery = useTopRated(sourceId, copy.kind)
  // Feature 057: Top 10 da semana e Dica (TMDB cruzado com a lista); sem chave/cache/cruzamento não há dado e a fileira não existe.
  const top10Query = useWeeklyTop10(sourceId, copy.kind)
  const tipQuery = useDailyTip(sourceId, copy.kind)

  // Metadados reais do hero (os mesmos da 050): nada é consultado ao focar, só lido do que já está carregado.
  const watchedIds = useWatchedIds(sourceId, section === 'movies' ? copy.kind : 'channel').data ?? new Set<string>()
  const watchedSummary =
    useSeriesWatchedSummary(section === 'series' ? sourceId : null).data ??
    new Map<string, { known: number; watched: number; upToDate: boolean }>()
  const resumePositions = useResumePositions(section === 'movies' ? sourceId : null, 'movie').data ?? new Map<string, number>()

  const history = historyQuery.data?.items ?? []
  const favorites = favoritesQuery.data?.items ?? []
  const added = addedQuery.data ?? []
  const rated = ratedQuery.data ?? []
  const top10 = top10Query.data ?? []
  const tip = tipQuery.data ?? []
  // Posição REAL no ranking do TMDB (sem renumerar): é o número que o card mostra.
  const rankById = new Map(top10.map((pick) => [pick.item.id, pick.rank]))

  // `wide` (D-006): "Continue assistindo" vira card largo só se TODOS os itens mostrados já têm backdrop guardado.
  const backdrops = useCachedBackdrops(history.slice(0, SHOWCASE_LIMIT))
  const continueWide = allHaveBackdrop(history, backdrops)
  const rows = buildShowcaseRows(
    {
      section,
      hasContinue: history.length > 0,
      hasFavorites: favorites.length > 0,
      hasAdded: added.length > 0,
      hasRated: rated.length > 0,
      hasTop10: top10.length > 0,
      hasTip: tip.length > 0,
      categoryNames: categories.map((category) => category.name ?? ''),
    },
    t,
  ).map((spec): ShowcaseRowSpec => (spec.key === 'continue' && continueWide ? { ...spec, format: 'wide' } : spec))
  const specByKey = new Map(rows.map((spec) => [spec.key as string, spec]))
  const rowIndexByKey = new Map(rows.map((spec, index) => [spec.key as string, index]))

  // Categoria da fonte por nome declarado (a primeira vence, como em `buildShowcaseRows`).
  const categoryByName = new Map<string, CatalogCategory>()
  for (const category of categories) {
    const name = groupLabel(category.name)
    if (!categoryByName.has(name)) categoryByName.set(name, category)
  }
  const categoryOfRow = (spec: ShowcaseRowSpec | undefined): CatalogCategory | undefined =>
    spec && spec.kind === 'category' && spec.seeAll?.kind === 'category' ? categoryByName.get(spec.seeAll.name) : undefined

  // Janela de prévias: a fileira focada −1 … +3 (só o disco, só ao se aproximar — nunca ao focar um card).
  const [windowAnchor, setWindowAnchor] = useState(0)
  const windowCategories: CatalogCategory[] = []
  for (const spec of rows.slice(Math.max(0, windowAnchor - WINDOW_BEFORE), windowAnchor + WINDOW_AFTER + 1)) {
    const category = categoryOfRow(spec)
    if (category) windowCategories.push(category)
  }
  const previews = useCategoryPreviews(sourceId, windowCategories)

  const entriesCache = new Map<string, Entry[]>()
  function entriesOf(spec: ShowcaseRowSpec): Entry[] {
    const cached = entriesCache.get(spec.key)
    if (cached) return cached
    let entries: Entry[]
    if (spec.kind === 'slot') entries = [SLOT_ENTRY]
    else if (spec.key === 'continue') entries = itemEntries(history)
    else if (spec.key === 'favorites') entries = itemEntries(favorites)
    else if (spec.key === 'added') entries = itemEntries(added)
    else if (spec.key === 'rated') entries = itemEntries(rated)
    else if (spec.key === 'top10') entries = plainEntries(top10.map((pick) => pick.item))
    else if (spec.key === 'tip') entries = plainEntries(tip)
    else {
      const category = categoryOfRow(spec)
      const preview = category ? previews.get(category.id) : undefined
      entries = preview?.status === 'ready' ? itemEntries(preview.items) : [SEE_ALL_ENTRY]
    }
    entriesCache.set(spec.key, entries)
    return entries
  }
  const entryIdsOf = (rowKey: string): string[] => {
    const spec = specByKey.get(rowKey)
    return spec ? entriesOf(spec).map((entry) => entry.id) : []
  }

  // --- Foco: derivado a cada render (o estado só guarda o que a pessoa moveu) ---
  const [focusState, setFocusState] = useState<ShowcaseFocusState | null>(null)
  const [sideFocused, setSideFocused] = useState(restore?.row === 'categories')
  const restoreFocus = restore && restore.row !== 'categories' ? { row: restore.row, id: restore.id } : undefined
  // Enquanto a pessoa não moveu o foco, ele é o inicial (ou o restaurado) recalculado com os dados do momento.
  const effective: ShowcaseFocusState | null = focusState
    ? reconcileShowcaseFocus(focusState, rows, entryIdsOf)
    : initialShowcaseFocus(rows, entryIdsOf, restoreFocus)
  const inSide = sideFocused || effective === null
  // Janela inicial: dados que chegam logo (histórico, favoritos) ainda decidem o foco inicial; passada ela, quem está na
  // lista lateral fica nela — uma fileira lenta (ex.: "Adicionados recentemente" lê o índice inteiro) não rouba o foco.
  const startedInSide = useRef(false)
  startedInSide.current = effective === null
  useEffect(() => {
    const timer = setTimeout(() => {
      if (startedInSide.current) setSideFocused(true)
    }, INITIAL_FOCUS_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])
  const focusRowIndex = effective ? (rowIndexByKey.get(effective.rowKey) ?? 0) : 0
  useEffect(() => {
    setWindowAnchor(focusRowIndex)
  }, [focusRowIndex])

  const focusedRowSpec = effective ? specByKey.get(effective.rowKey) : undefined
  const focusedId = effective ? focusedEntryId(effective, entryIdsOf) : null
  const focusedEntry: Entry | undefined =
    focusedRowSpec && focusedId !== null ? entriesOf(focusedRowSpec).find((entry) => entry.id === focusedId) : undefined

  // --- Lista lateral de categorias (foco por id) ---
  // Ela só fica recolhida enquanto o foco está nas fileiras: ← volta e expande; → no fim da lista entra nos cards e recolhe.
  const collapsed = !inSide
  const sideEntries: SideEntry[] = [
    { id: 'pinned:favorites', label: t('live.favoritesStar'), target: { kind: 'favorites' } },
    { id: 'pinned:history', label: t('vod.historyStar'), target: { kind: 'history' } },
    { id: 'pinned:all', label: t('live.all'), target: { kind: 'all' } },
    ...categories.map(
      (category): SideEntry => ({
        id: `cat:${groupLabel(category.name)}`,
        label: vodGroupDisplay(category.name, t),
        count: knownCategoryCount(category),
        target: { kind: 'category', name: groupLabel(category.name) },
      }),
    ),
  ]
  const sideFocus = useIdFocus(sideEntries, restore?.row === 'categories' ? restore.id : null)
  const focusedSide: SideEntry | undefined = sideEntries[sideFocus.index]

  const sideScrollRef = useRef<HTMLDivElement>(null)
  const sideFocusRef = useScrollFocusedIntoView<HTMLButtonElement>(sideFocus.index)
  const sideEdges = useOverflowEdges(sideScrollRef, sideEntries.length)
  const sideNavEntries: SideCategoryNavEntry[] = sideEntries.map((entry) => {
    if (entry.id === 'pinned:favorites') {
      return {
        id: entry.id,
        label: t('live.favorites'),
        icon: 'favorite',
        count: favorites.length,
        pinned: true,
        pinnedBadge: false,
        groupLabel: t('showcase.side.library'),
      }
    }
    if (entry.id === 'pinned:history') {
      return { id: entry.id, label: t('showcase.side.history'), icon: 'history', pinned: true, pinnedBadge: false, groupLabel: t('showcase.side.library') }
    }
    if (entry.id === 'pinned:all') {
      return { id: entry.id, label: t('live.all'), pinned: true, pinnedBadge: false, groupLabel: t('showcase.side.catalog') }
    }
    return { id: entry.id, label: entry.label, count: entry.count }
  })

  // Pré-carga por foco (features 010/038, E-5 da 052): a categoria em foco — na lista lateral ou na fileira — é buscada
  // em segundo plano (com amortecimento) e a seção passa à frente da fila.
  let focusedCategory: CatalogCategory | undefined
  if (inSide) {
    const target = focusedSide?.target
    focusedCategory = target?.kind === 'category' ? categoryByName.get(target.name) : undefined
  } else {
    focusedCategory = categoryOfRow(focusedRowSpec)
  }
  useCategoryFocusPrefetch(sourceId, focusedCategory)
  usePrefetchHint(copy.kind, focusedCategory?.id)

  // Categorias da janela ainda não obtidas: pede prioridade à pré-carga (038) depois de uma pausa — nunca por foco rápido.
  const pendingKey = windowCategories
    .filter((category) => previews.get(category.id)?.status === 'pending')
    .map((category) => category.id)
    .join(',')
  useEffect(() => {
    if (pendingKey === '') return
    const timer = setTimeout(() => {
      for (const id of pendingKey.split(',')) prioritizeCategory(Number(id))
    }, PRIORITIZE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [pendingKey])

  function focusNow(): VodShowcaseFocus {
    if (inSide) return { row: 'categories', id: focusedSide?.id ?? '' }
    return { row: (effective?.rowKey ?? 'categories') as VodShowcaseRow, id: focusedId ?? '' }
  }

  function goToTopbar() {
    if (!shell) return
    setTopbarItem(section)
    setZone('topbar')
  }

  const hasAnyItems = history.length > 0 || favorites.length > 0 || added.length > 0 || rated.length > 0
  const blocked = categoriesQuery.isLoading || categoriesQuery.isError || (categories.length === 0 && !hasAnyItems)

  function handleSelect() {
    if (blocked) {
      if (categoriesQuery.isError) void categoriesQuery.refetch()
      else if (online && !categoriesQuery.isLoading) onResync()
      else onBack()
      return
    }
    if (inSide) {
      if (focusedSide) onOpenTarget(focusedSide.target, focusNow())
      return
    }
    const entry = focusedEntry
    if (!entry || !focusedRowSpec) return
    if (entry.kind === 'item') onOpenItem(entry.item.id, focusNow())
    else if (entry.kind === 'see-all') {
      if (focusedRowSpec.seeAll) onOpenTarget(focusedRowSpec.seeAll, focusNow())
    } else if (focusedRowSpec.slotId) {
      // Slot reservado: soft-disabled, só anuncia "Em breve" (nada abre, nada é consultado).
      announce(comingSoonToast(focusedRowSpec.slotId, t))
    }
  }

  /** Pagina a lista lateral (← → na lista, feature 049): o foco anda uma página e a lista rola o mesmo tanto. */
  function pageSideList(direction: 'next' | 'previous') {
    const container = sideScrollRef.current
    const pitch = measuredRowPitch(container, '.side-category-nav-item')
    const next = pagedIndex(sideFocus.index, sideEntries.length, pageSizeFor(container?.clientHeight ?? 0, pitch), direction)
    if (next === null || next === sideFocus.index) return
    scrollByPage(container, direction, Math.abs(next - sideFocus.index), pitch)
    sideFocus.moveTo(next)
  }

  useRemoteNav(
    active
      ? {
          onDirection: (direction) => {
            if (inSide) {
              // Mexer na lista fixa o foco nela: uma fileira que passa a existir depois (dados que chegam) não o rouba.
              setSideFocused(true)
              // Lista lateral: ↑↓ andam nas categorias (↑ da 1ª sobe à topbar); ← → paginam a lista (feature 049) e
              // → no fim da lista entra nos cards — é aí que ela recolhe (recolhida = foco nas fileiras).
              if (direction === 'up') {
                if (sideFocus.index === 0) goToTopbar()
                else sideFocus.moveTo(sideFocus.index - 1)
              } else if (direction === 'down') {
                sideFocus.moveTo(sideFocus.index + 1)
              } else if (direction === 'left') {
                pageSideList('previous')
              } else if (direction === 'right') {
                if (sideFocus.index >= sideEntries.length - 1) {
                  if (rows.length === 0) return
                  setSideFocused(false)
                  // Sem cartão elegível, a entrada nas fileiras é a primeira (um slot ou um "Ver tudo" focável).
                  if (effective === null) setFocusState({ rowKey: rows[0].key, memory: {} })
                } else {
                  pageSideList('next')
                }
              }
              return
            }
            if (!effective) return
            if (direction === 'up' || direction === 'down') {
              const next = moveShowcaseVertical(effective, rows, entryIdsOf, direction)
              if (next === 'top') goToTopbar()
              else if (next) setFocusState(next)
              return
            }
            const next = moveShowcaseHorizontal(effective, entryIdsOf, direction)
            if (next) setFocusState(next)
            else if (direction === 'left') setSideFocused(true) // ← no 1º cartão volta à lista lateral
          },
          onSelect: handleSelect,
          onBack,
        }
      : {},
  )

  // --- Pilha vertical virtualizada (centenas de categorias) ---
  const rowsScrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => rowsScrollRef.current,
    estimateSize: (index) => ROW_FORMATS[rows[index].format].rowHeight,
    getItemKey: (index) => rows[index].key,
    overscan: 2,
    // A fileira focada fica montada mesmo sem rolagem real (e em jsdom): o `tv-focus` precisa de um nó.
    rangeExtractor: (range: Range) => {
      const base = defaultRangeExtractor(range)
      if (inSide || !effective || base.includes(focusRowIndex)) return base
      return [...base, focusRowIndex].sort((a, b) => a - b)
    },
  })
  // A rolagem até a fileira focada é calculada aqui, com as alturas conhecidas e o `clientHeight` REAL do contêiner: a
  // altura de viewport que o virtualizador guardou ficou 200 px maior que a visível (medida antes de a hero aparecer) e
  // `scrollToIndex` parava com a fileira cortada embaixo. O virtualizador segue só decidindo quais fileiras montar.
  // (A hero agora ocupa o lugar mesmo vazia, então a altura do contêiner não muda sob o foco.)
  const scrollRowIntoView = (index: number) => {
    const element = rowsScrollRef.current
    if (!element || index < 0 || index >= rows.length) return
    let start = 0
    for (let i = 0; i < index; i += 1) start += ROW_FORMATS[rows[i].format].rowHeight
    const padding = parseFloat(getComputedStyle(element).paddingTop) || 0
    const top = padding + start
    const bottom = top + ROW_FORMATS[rows[index].format].rowHeight
    if (top - padding < element.scrollTop) element.scrollTop = Math.max(0, top - padding)
    else if (bottom > element.scrollTop + element.clientHeight) element.scrollTop = bottom - element.clientHeight
  }
  useVirtualFocusSync({
    focusedIndex: focusRowIndex,
    scrollToIndex: scrollRowIntoView,
    enabled: !inSide && rows.length > 0,
  })

  function renderSlotCard(spec: ShowcaseRowSpec, focused: boolean): ReactNode {
    const message = spec.slotId ? comingSoonMessage(spec.slotId, t) : ''
    return (
      <button type="button" className={`vod-slot-card is-soft-disabled${focused ? ' tv-focus' : ''}`} aria-disabled="true" tabIndex={-1}>
        <span className="vod-slot-badge">{t('showcase.soon')}</span>
        <span className="vod-slot-message">{message}</span>
      </button>
    )
  }

  function renderEntry(entry: Entry, focused: boolean, spec: ShowcaseRowSpec): ReactNode {
    if (entry.kind === 'item') {
      if (spec.format === 'wide') {
        return <ContentCard variant="wide" title={entry.item.name} iconUrl={backdrops.get(entry.item.id)} focused={focused} />
      }
      return (
        <ContentCard
          variant="portrait"
          title={entry.item.name}
          iconUrl={entry.item.icon_url ?? undefined}
          focused={focused}
          badge={<RatingBadge value={entry.item.provider_rating} />}
          rank={spec.key === 'top10' ? rankById.get(entry.item.id) : undefined}
        />
      )
    }
    if (entry.kind === 'see-all') return <SeeAllCard label={t('showcase.seeAll')} focused={focused} className="vod-see-all-card" />
    return renderSlotCard(spec, focused)
  }

  function renderRowBody(spec: ShowcaseRowSpec, entries: Entry[], focusedHere: boolean, format: RowFormatMetrics): ReactNode {
    const focusIndex = focusedHere ? Math.max(0, entries.findIndex((entry) => entry.id === focusedId)) : -1
    const cardFocused = (index: number) => active && !inSide && focusedHere && index === focusIndex
    if (spec.kind === 'slot') {
      return (
        <div className="vod-row-strip" style={{ height: format.itemHeight }}>
          {renderSlotCard(spec, cardFocused(0))}
          {Array.from({ length: SLOT_CARD_COUNT - 1 }, (_, index) => (
            <div key={index} className="vod-ghost-card" aria-hidden="true" />
          ))}
        </div>
      )
    }
    if (spec.kind === 'category' && entries.length === 1 && entries[0].kind === 'see-all') {
      // Categoria ainda sem itens no aparelho (ou vazia): só o "Ver tudo" focável — nunca um card inventado.
      const category = categoryOfRow(spec)
      const pending = category !== undefined && previews.get(category.id)?.status === 'pending'
      return (
        <div className="vod-row-strip" style={{ height: format.itemHeight }}>
          <SeeAllCard label={t('showcase.seeAll')} focused={cardFocused(0)} className="vod-see-all-card" />
          {pending &&
            Array.from({ length: 5 }, (_, index) => <div key={index} className="vod-ghost-card vod-ghost-card--skeleton" aria-hidden="true" />)}
        </div>
      )
    }
    return (
      <Rail
        items={entries}
        itemWidth={format.itemWidth}
        itemHeight={format.itemHeight}
        focusedIndex={focusIndex}
        renderItem={(entry, index) => renderEntry(entry, cardFocused(index), spec)}
      />
    )
  }

  function renderRow(spec: ShowcaseRowSpec, start: number): ReactNode {
    const format = ROW_FORMATS[spec.format]
    const category = categoryOfRow(spec)
    const pending = category !== undefined && previews.get(category.id)?.status === 'pending'
    const style = {
      transform: `translateY(${start}px)`,
      height: format.rowHeight,
      '--vod-card-w': `${format.cardWidth}px`,
      '--vod-card-h': `${format.itemHeight}px`,
    } as CSSProperties
    return (
      <section
        key={spec.key}
        className={`vod-row vod-row--${spec.format} vod-row--${spec.kind}`}
        aria-label={spec.title}
        aria-busy={pending ? 'true' : undefined}
        style={style}
      >
        <div className="vod-row-head">
          <h2 className="vod-row-title">{spec.title}</h2>
          {(spec.key === 'top10' || spec.key === 'tip') && (
            // Feature 057 (FR-012): procedência visível — os dados vêm do TMDB; a nota do selo segue sendo a do provedor.
            <span className="vod-row-source">{t('showcase.source.tmdb')}</span>
          )}
          {(() => {
            const coverage = spec.key === 'rated' ? ratedQuery : spec.key === 'top10' ? top10Query : spec.key === 'tip' ? tipQuery : null
            return (
              coverage !== null &&
              coverage.totalCategories > 0 &&
              coverage.coveredCategories < coverage.totalCategories && (
                <span className="vod-row-coverage">
                  {t('showcase.ratedCoverage', { covered: coverage.coveredCategories, total: coverage.totalCategories })}
                </span>
              )
            )
          })()}
          {spec.seeAll && (
            <span className="vod-row-seeall" aria-hidden="true">
              {t('showcase.seeAllArrow')}
            </span>
          )}
        </div>
        {renderRowBody(spec, entriesOf(spec), effective?.rowKey === spec.key, format)}
      </section>
    )
  }

  // Hero (D-010): item focado → capa/título/metadados reais; categoria da lista lateral → nome e contagem; "Ver tudo"
  // e slot mantêm o último item (nunca um placeholder rotulado nem texto inventado).
  const lastHeroItem = useRef<{ item: CatalogItemOut; row: string } | null>(null)
  let heroItem: CatalogItemOut | null = null
  let heroRowKey: string | null = null
  if (!inSide && focusedEntry?.kind === 'item') {
    heroItem = focusedEntry.item
    heroRowKey = effective?.rowKey ?? null
    lastHeroItem.current = { item: focusedEntry.item, row: heroRowKey ?? '' }
  } else if (!inSide && focusedEntry && focusedRowSpec) {
    const rowItems = entriesOf(focusedRowSpec).filter((entry): entry is ItemEntry => entry.kind === 'item')
    heroItem = rowItems.length > 0 ? rowItems[rowItems.length - 1].item : (lastHeroItem.current?.item ?? null)
    heroRowKey = rowItems.length > 0 ? focusedRowSpec.key : (lastHeroItem.current?.row ?? null)
  }
  const heroCategory = inSide ? focusedSide : null
  const heroEyebrow =
    heroCategory !== null && heroCategory !== undefined
      ? t('showcase.eyebrow.category')
      : heroRowKey === 'favorites'
        ? t('showcase.eyebrow.favorites')
        : heroRowKey === 'continue'
          ? t('showcase.eyebrow.recent')
          : heroRowKey === 'top10'
            ? t('showcase.eyebrow.top10')
            : heroRowKey === 'tip'
              ? t('showcase.eyebrow.tip')
              : t(copy.eyebrow)

  function renderHero(): ReactNode {
    // Sem nada a mostrar (ex.: foco num slot antes de qualquer item), a hero segue ocupando o lugar: se ela aparecesse e
    // sumisse, a área das fileiras mudaria de altura sob o foco e o card focado sairia da vista.
    if (!heroCategory && heroItem === null) return <div className="vod-hero-band" aria-hidden="true" />

    const stableId = heroItem ? (stableIdOf(heroItem) ?? '') : ''
    const summary = heroItem?.series_id ? watchedSummary.get(heroItem.series_id) : undefined
    return (
      <div className="vod-hero-band" aria-hidden="true">
        {/* Feature 055 (D-010): série usa o fundo da listagem quando houver; filme segue com a capa. */}
        <VodHeroArt url={(heroItem?.kind === 'series' ? heroItem.provider_backdrop_url : null) ?? heroItem?.icon_url ?? undefined} />
        <div className="vod-hero-info">
          <div className="vod-hero-eyebrow">{heroEyebrow}</div>
          <div className="vod-hero-title">{heroItem ? heroItem.name : heroCategory?.label}</div>
          <div className="vod-hero-meta">
            {heroCategory && heroCategory.count !== undefined && <span>{t('vod.titleCount', { n: heroCategory.count })}</span>}
            {heroItem && heroItem.year != null && <span>{heroItem.year}</span>}
            {heroItem && <RatingBadge value={heroItem.provider_rating} showSource />}
            {heroItem?.kind === 'series' && heroItem.provider_genres && <span>{heroItem.provider_genres}</span>}
            {heroItem && <span>{vodGroupDisplay(heroItem.original_group, t)}</span>}
            {heroItem && section === 'movies' && watchedIds.has(stableId) && <span>{t('vod.watched')}</span>}
            {heroItem && section === 'movies' && !watchedIds.has(stableId) && resumePositions.has(stableId) && (
              <span>{t('showcase.resumeFrom', { time: formatTime((resumePositions.get(stableId) ?? 0) * 1000) })}</span>
            )}
            {heroItem && section === 'series' && summary && summary.known > 0 && (
              <span>{summary.upToDate ? t('vod.upToDate') : `${summary.watched}/${summary.known}`}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  function withShell(children: ReactNode): ReactNode {
    if (!shell) return children
    return (
      <AppShell
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
          <EmptyState title={t(copy.loadingLabel)} action={{ label: t('common.back'), onSelect: onBack }} focused />
        </div>
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  if (categoriesQuery.isError) {
    return withShell(
      <div className="screen vod-screen">
        <ErrorState
          title={t(copy.loadError)}
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

  if (categories.length === 0 && !hasAnyItems) {
    return withShell(
      <div className="screen vod-screen">
        <EmptyState
          title={t(copy.emptyTitle)}
          description={t(copy.emptyDescription)}
          action={{ label: t('common.back'), onSelect: onBack }}
          focused
        />
        <Toast message={toastMessage} messageKey={toastKey} />
      </div>,
    )
  }

  return withShell(
    <div className="screen vod-screen vod-showcase">
      <div className="vod-body">
        <div className={`vod-side-panel${collapsed ? ' is-collapsed' : ''}`}>
          <div className="vod-side-head">
            <span className="vod-side-title">{t(copy.label)}</span>
          </div>
          <div className={scrollFrameClass(sideEdges)}>
            <div ref={sideScrollRef} className="vod-side-nav no-scrollbar">
              <SideCategoryNav
                entries={sideNavEntries}
                selectedId=""
                focusedId={active && inSide ? focusedSide?.id : undefined}
                focusedRef={sideFocusRef}
                collapsed={collapsed}
                onSelect={(id) => {
                  const entry = sideEntries.find((candidate) => candidate.id === id)
                  if (entry) onOpenTarget(entry.target, { row: 'categories', id })
                }}
              />
            </div>
          </div>
        </div>
        <div className="vod-showcase-main">
          {renderHero()}
          <div ref={rowsScrollRef} className="vod-showcase-rows no-scrollbar">
            <div className="vod-showcase-rows-inner" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => renderRow(rows[virtualRow.index], virtualRow.start))}
            </div>
          </div>
        </div>
      </div>
      <Toast message={toastMessage} messageKey={toastKey} />
    </div>,
  )
}
