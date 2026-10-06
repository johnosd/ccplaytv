import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  useCategoryList,
  useContinueCards,
  useDailyTip,
  useFavoriteIds,
  useFavoritesContent,
  useHomeImages,
  useRecentlyAdded,
  useWeeklyTop10,
  useHomeHero,
  useMyListContent,
  useSeriesWatchedSummary,
  useTitleMetadata,
  useUserState,
  useWatchedIds,
  type CatalogItemOut,
  type DiscoveryPick,
} from '../catalog/catalogApi'
import { stableIdOf, useEpgPrograms, useTmdbStatus } from '../catalog/catalogApi'
import { useBecauseYouWatched } from '../catalog/becauseApi'
import { channelNumberOf } from '../live/channelNumber'
import { TMDB_DOCK_LABEL_KEY } from '../settings/integrationsModel'
import { nowNextForChannel } from '../../lib/epg/nowNext'
import { useNow } from '../../lib/useNow'
import type { HomeFocus, TopDestination } from '../../navigation/appNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useIdFocus } from '../../lib/focus/useIdFocus'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { useToast } from '../../lib/useToast'
import { useT } from '../../lib/i18n/I18nProvider'
import { Toast } from '../../components/Toast'
import { useAnnounce } from '../../lib/announcer'
import { comingSoonToast } from '../../lib/comingSoon'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { Translator } from '../../lib/i18n/translate'
import { ComingSoon } from '../../components/ComingSoon'
import { RatingBadge } from '../../components/RatingBadge'
import { ContentRatingBadge } from '../../components/ContentRatingBadge'
import { TmdbRatingBadge } from '../../components/TmdbRatingBadge'
import { SeeAllCard } from '../../components/SeeAllCard'
import { Rail } from '../../components/Rail'
import { Icon } from '../../components/Icon'
import { TrailerLayer } from '../../components/TrailerLayer'
import type { IconName } from '../../components/iconPaths'
import { DetailChips } from '../vod/DetailChips'
import { formatDurationMinutes } from '../vod/detailMetadataFormat'
import { groupLabelDisplay } from '../vod/vodGroupDisplay'
import {
  trailerActionLabel,
  trailerActionSoftDisabled,
  trailerActionState,
  trailerActionToast,
  type TrailerActionState,
} from '../vod/trailerAction'
import { HomeAmbient } from './HomeAmbient'
import { HomeBillboard, type BillboardAction } from './HomeBillboard'
import { HomeLiveCard } from './HomeLiveCard'
import { HomeTitleCard } from './HomeTitleCard'
import { mergeDiscoveryRatings } from './homeTmdbRatings'
import { cardBadges, type CardBadges } from './cardBadges'
import {
  HOME_AMBIENT_DELAY_MS,
  HOME_DEFERRED_MS,
  HOME_PEEK_HEIGHT,
  HOME_ROW_FORMATS,
  FOCUS_PAD,
  type HomeRowFormat,
} from './homeRowFormats'
import { HOME_ROW_ORDER, buildHomeRows, type HomeRowKey } from './homeRows'
import { useDeferred } from './useDeferred'

/** Foco de origem que o Início sabe restaurar dentro do conteúdo (a topbar é do `HomeScreen`). */
export type HomeContentFocus = Exclude<HomeFocus, { zone: 'topbar' }>

export interface HomeContentProps {
  sourceId: string
  /** Feature 023 (D-004, `logic/foco-shell.md`): só o escopo ativo reage ao teclado e desenha o foco. */
  active?: boolean
  /** UP na linha mais alta do conteúdo (o dock do billboard) — o Início leva o foco à topbar (FR-015). */
  onExitUp?: () => void
  onBack: () => void
  /** Hero de boas-vindas (FR-008): abre TV ao vivo/Filmes. */
  onNavigate: (destination: TopDestination, from: HomeFocus) => void
  /** "Mais informações"/card de filme ou série (FR-007/FR-012). */
  onOpenItem: (item: CatalogItemOut, from: HomeFocus) => void
  /** Card de "Canais favoritos" (FR-013). */
  onOpenChannel: (channel: CatalogItemOut, from: HomeFocus) => void
  /** "Ver todos (N)"/"Filmes (N)"/"Séries (N)" (FR-014). */
  onOpenFavorites: (destination: TopDestination, from: HomeFocus) => void
  /**
   * Ícone "TMDB" do dock (feature 032, FR-016): leva a Configurações › Integrações
   * & BYOK. Opcional só porque os contratos travados da 026 montam o Início sem
   * ele; ausente, o ícone volta a só anunciar o estado.
   */
  onOpenIntegrations?: (from: HomeFocus) => void
  /** Ação primária do hero quando resolve em reprodução (FR-005). */
  onPlay: (params: { itemId: string; title: string; startAtMs: number | undefined }) => void
  /** Foco a restaurar ao voltar de um destino (FR-017/FR-029). */
  initialFocus?: HomeContentFocus
  /**
   * Linha de estado do catálogo (feature 038, US6, FR-031): informativa, nunca
   * focável. Ausente/`null` = nada a dizer.
   */
  statusLine?: string | null
  /**
   * Feature 060 (D-004): onde o fundo ambiente é desenhado. `undefined` = dentro do próprio conteúdo (testes e usos sem
   * moldura); um elemento = por portal nele (o `HomeScreen` passa a camada de fundo do `AppShell`, atrás da topbar);
   * `null` = a camada ainda não existe, nada é desenhado até ela chegar.
   */
  ambientHost?: HTMLElement | null
}

/** Linhas navegáveis, de cima para baixo (D-017): o dock do billboard, as ações do billboard e as fileiras. */
type LineKey = 'dock' | 'hero' | HomeRowKey
type DiscoveryRowKey = 'top10-movies' | 'top10-series' | 'tip-movies' | 'tip-series'
const DISCOVERY_ROWS: DiscoveryRowKey[] = ['top10-movies', 'top10-series', 'tip-movies', 'tip-series']
const ALL_LINES: LineKey[] = ['dock', 'hero', ...HOME_ROW_ORDER]

const DISCOVERY_TITLE: Record<DiscoveryRowKey, MessageKey> = {
  // No Início filmes e séries aparecem juntos: títulos distintos (na hero cada tela já é do seu tipo).
  'top10-movies': 'home.row.trendingMovies',
  'top10-series': 'home.row.trendingSeries',
  'tip-movies': 'showcase.row.tipMovies',
  'tip-series': 'showcase.row.tipSeries',
}

const SEE_ALL_ID = '__see-all__'
const MOVIES_ID = '__movies__'
const SERIES_ID = '__series__'

type MyListRailItem = { kind: 'item'; item: CatalogItemOut } | { kind: 'movies'; count: number } | { kind: 'series'; count: number }
type ChannelRailItem = { kind: 'channel'; item: CatalogItemOut } | { kind: 'see-all'; count: number }

function myListRailId(entry: MyListRailItem): string {
  if (entry.kind === 'item') return entry.item.id
  return entry.kind === 'movies' ? MOVIES_ID : SERIES_ID
}

function channelRailId(entry: ChannelRailItem): string {
  return entry.kind === 'channel' ? entry.item.id : SEE_ALL_ID
}

function isDiscoveryRow(line: LineKey): line is DiscoveryRowKey {
  return (DISCOVERY_ROWS as LineKey[]).includes(line)
}

/** Resultado de `useWeeklyTop10`/`useDailyTip` → itens (na ordem do ranking) e cobertura. A posição real no TMDB não vira número de card (ver `index + 1` abaixo). */
function discoveryOf(query: {
  data: CatalogItemOut[] | DiscoveryPick[] | undefined
  coveredCategories: number
  totalCategories: number
}): { items: CatalogItemOut[]; covered: number; total: number } {
  const data = query.data ?? []
  const items: CatalogItemOut[] = data.map((entry) => ('item' in entry ? entry.item : entry))
  return { items, covered: query.coveredCategories, total: query.totalCategories }
}

interface DockIconDef {
  id: string
  icon: IconName
  /** Rótulo no catálogo; o ícone do TMDB não tem (nome próprio) e usa o estado do serviço. */
  labelKey?: MessageKey
}

/** Único ícone do dock que já é real (feature 032); o id não é mais um mock registrado em `comingSoon.ts`. */
const TMDB_DOCK_ID = 'dock-tmdb'

const DOCK_ICONS: DockIconDef[] = [
  { id: TMDB_DOCK_ID, icon: 'info' },
  { id: 'dock-ai', icon: 'device', labelKey: 'settings.integrations.soon.dock-ai' },
  { id: 'dock-weather', icon: 'live', labelKey: 'settings.integrations.soon.dock-weather' },
  { id: 'dock-speedtest', icon: 'quality', labelKey: 'settings.integrations.soon.dock-speedtest' },
]

type HeroEntry = BillboardAction

function heroEntries(
  hero: ReturnType<typeof useHomeHero>['data'],
  isFavorite: boolean,
  trailer: TrailerActionState,
  t: Translator,
): HeroEntry[] {
  if (!hero || hero.kind === 'welcome') {
    return [
      { id: 'shortcut-live', label: t('home.shortcut.live') },
      { id: 'shortcut-movies', label: t('home.shortcut.movies') },
    ]
  }
  const primaryLabel = hero.primary.type === 'open-detail' || !hero.primary.resume ? t('home.hero.watch') : t('home.hero.continue')
  return [
    { id: 'primary', label: primaryLabel },
    { id: 'details', label: t('home.hero.details') },
    { id: 'mylist', label: isFavorite ? t('home.hero.inMyList') : t('home.hero.addMyList') },
    // Trailer real (feature 060, item 32): os estados e textos são os do detalhe (033), nada é consultado ao focar.
    { id: 'trailer', label: trailerActionLabel(trailer, t), softDisabled: trailerActionSoftDisabled(trailer) },
  ]
}

/** Medidas de uma fileira como variáveis CSS: o CSS nunca repete px (FR-024, `homeRowFormats.ts`). */
function rowStyle(format: HomeRowFormat): CSSProperties {
  const m = HOME_ROW_FORMATS[format]
  return {
    '--home-card-w': `${m.cardWidth}px`,
    '--home-card-h': `${m.cardHeight}px`,
    '--home-card-expanded-w': `${m.expandedCardWidth}px`,
    '--home-card-expanded-h': `${m.expandedCardHeight}px`,
    '--home-focus-pad': `${FOCUS_PAD}px`,
    '--home-numeral-w': `${m.numeralWidth}px`,
    '--home-numeral-overlap': `${m.numeralOverlap}px`,
  } as CSSProperties
}

/**
 * Conteúdo do Início "Vitrine expandida" (feature 060, `logic/billboard-e-navegacao.md`): um billboard de um título que
 * recolhe quando o foco desce, fileiras que ocupam a tela com a focada no topo e um fundo ambiente que acompanha o item
 * focado. Continua sendo o único dono da navegação (um só `useRemoteNav`, D-001): os componentes de baixo são só
 * apresentação. A moldura do Início (026) segue a mesma: hero + rails reais + mocks honestos.
 */
export function HomeContent({
  sourceId,
  active = true,
  onExitUp,
  onBack,
  onNavigate,
  onOpenItem,
  onOpenChannel,
  onOpenFavorites,
  onOpenIntegrations,
  onPlay,
  initialFocus,
  statusLine,
  ambientHost,
}: HomeContentProps): ReactNode {
  const heroQuery = useHomeHero(sourceId)
  const hero = heroQuery.data ?? { kind: 'welcome' as const }
  const continueQuery = useContinueCards(sourceId)
  const myListQuery = useMyListContent(sourceId)
  const channelsQuery = useFavoritesContent(sourceId, 'channel', true)
  // Feature 057: Top 10 e Dica (TMDB cruzado com a lista). Sem chave/cache/cruzamento não há dado e a linha não existe.
  const top10MoviesQuery = useWeeklyTop10(sourceId, 'movie')
  const top10SeriesQuery = useWeeklyTop10(sourceId, 'series')
  const tipMoviesQuery = useDailyTip(sourceId, 'movie')
  const tipSeriesQuery = useDailyTip(sourceId, 'series')
  const t = useT()
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)
  const announce = useAnnounce()
  // Estado do TMDB no dock (feature 032): lê só o IndexedDB, nunca a rede — seguro ao focar.
  const tmdbStatusQuery = useTmdbStatus()
  const tmdbState = tmdbStatusQuery.data?.state ?? 'not_configured'

  const heroItem = hero.kind !== 'welcome' ? hero.item : null
  const heroStableId = heroItem ? stableIdOf(heroItem) : null
  const heroUserState = useUserState(heroStableId)
  const heroIsFavorite = heroUserState.data?.isFavorite ?? false

  // Metadata do título do billboard: a mesma consulta do detalhe, feita ao ABRIR a Home (nunca ao focar). Falha ou id sem
  // registro = billboard sem backdrop/sinopse, nunca um erro na tela (R-011).
  const metadataQuery = useTitleMetadata(heroItem?.id ?? null)
  const heroMetadata = metadataQuery.data
  const trailerState = trailerActionState({
    metadata: heroMetadata,
    checking: heroItem !== null && (metadataQuery.isFetching || heroMetadata === undefined),
    tmdbState: tmdbStatusQuery.data?.state,
  })
  const [trailerOpen, setTrailerOpen] = useState(false)

  const continueCards = useMemo(() => continueQuery.data ?? [], [continueQuery.data])
  const continueItems = useMemo(() => continueCards.map((card) => card.item), [continueCards])
  const continueCardOf = useMemo(() => new Map(continueCards.map((card) => [card.item.id, card])), [continueCards])

  // Selos dos cards (FR-008): assistido e favorito saem de UMA leitura local por tipo, nunca de uma consulta por card. O resumo
  // de séries em dia lê os episódios do aparelho; fica para depois do 1º desenho (D-013).
  const deferred = useDeferred(HOME_DEFERRED_MS)
  const watchedMovieIds = useWatchedIds(sourceId, 'movie').data
  const favoriteMovieIds = useFavoriteIds(sourceId, 'movie').data
  const favoriteSeriesIds = useFavoriteIds(sourceId, 'series').data
  const seriesSummary = useSeriesWatchedSummary(deferred ? sourceId : null).data

  // Fileiras novas (feature 060). "Adicionados" lê o índice de busca inteiro de cada tipo: só depois do 1º desenho (D-013, R-001).
  // "Porque você assistiu" só lê o IndexedDB sem chave TMDB (D-011) e a metadata da semente ao ABRIR a tela, nunca ao focar.
  const addedMoviesQuery = useRecentlyAdded(sourceId, 'movie', deferred)
  const addedSeriesQuery = useRecentlyAdded(sourceId, 'series', deferred)
  const becauseRow = useBecauseYouWatched(sourceId, 'any')
  const channelCategories = useCategoryList(sourceId, 'channel').data
  const myListContent = myListQuery.data ?? { items: [], movieCount: 0, seriesCount: 0 }
  const channelsContent = channelsQuery.data ?? { items: [], unresolved: 0 }
  // EPG (feature 030, FR-027): programa atual de cada canal favorito, lido só
  // do aparelho; `useNow` faz o título virar sem sair da Home.
  const epgNow = useNow()
  const epgLookup = useEpgPrograms(
    sourceId,
    channelsContent.items.map((item) => item.epg_channel_id),
  ).data

  const mylistRailItems: MyListRailItem[] = [
    ...myListContent.items.map((item): MyListRailItem => ({ kind: 'item', item })),
    ...(myListContent.movieCount > 0 ? [{ kind: 'movies' as const, count: myListContent.movieCount }] : []),
    ...(myListContent.seriesCount > 0 ? [{ kind: 'series' as const, count: myListContent.seriesCount }] : []),
  ]
  const channelRailItems: ChannelRailItem[] = [
    ...channelsContent.items.map((item): ChannelRailItem => ({ kind: 'channel', item })),
    ...(channelsContent.items.length > 0 ? [{ kind: 'see-all' as const, count: channelsContent.items.length }] : []),
  ]

  const discovery: Record<DiscoveryRowKey, { items: CatalogItemOut[]; covered: number; total: number }> = {
    'top10-movies': discoveryOf(top10MoviesQuery),
    'top10-series': discoveryOf(top10SeriesQuery),
    'tip-movies': discoveryOf(tipMoviesQuery),
    'tip-series': discoveryOf(tipSeriesQuery),
  }
  const addedMovies = addedMoviesQuery.data ?? []
  const addedSeries = addedSeriesQuery.data ?? []
  const becauseItems = becauseRow?.items ?? []

  // Fileira sem dado — ou ainda carregando — não existe (FR-018): sem skeleton, sem "Em breve". A Curadoria por IA sempre.
  const rowKeys = buildHomeRows({
    continue: continueItems.length > 0,
    'top10-movies': discovery['top10-movies'].items.length > 0,
    'added-movies': addedMovies.length > 0,
    'tip-movies': discovery['tip-movies'].items.length > 0,
    because: becauseItems.length > 0,
    channels: channelRailItems.length > 0,
    mylist: mylistRailItems.length > 0,
    'top10-series': discovery['top10-series'].items.length > 0,
    'added-series': addedSeries.length > 0,
    'tip-series': discovery['tip-series'].items.length > 0,
  })
  const lines: LineKey[] = ['dock', 'hero', ...rowKeys]

  const initialLine: LineKey =
    initialFocus?.zone === 'rail' ? initialFocus.rail : initialFocus?.zone === 'dock' ? 'dock' : 'hero'
  const [line, setLine] = useState<LineKey>(initialLine)
  const effectiveLine: LineKey = lines.includes(line)
    ? line
    : (() => {
        const idx = ALL_LINES.indexOf(line)
        for (let i = idx - 1; i >= 0; i -= 1) {
          if (lines.includes(ALL_LINES[i])) return ALL_LINES[i]
        }
        return 'hero'
      })()
  const mode: 'billboard' | 'rows' = effectiveLine === 'hero' || effectiveLine === 'dock' ? 'billboard' : 'rows'

  const heroInitialId =
    initialFocus?.zone === 'hero'
      ? initialFocus.action
      : initialFocus?.zone === 'shortcuts'
        ? `shortcut-${initialFocus.destination}`
        : null
  const heroActions = heroEntries(heroQuery.data, heroIsFavorite, trailerState, t)
  const heroFocus = useIdFocus(heroActions, heroInitialId)

  const continueInitialId =
    initialFocus?.zone === 'rail' && initialFocus.rail === 'continue' ? initialFocus.itemId : null
  const continueFocus = useIdFocus(continueItems, continueInitialId)

  const myListInitialId = initialFocus?.zone === 'rail' && initialFocus.rail === 'mylist' ? initialFocus.itemId : null
  const myListRailKeyed = mylistRailItems.map((entry) => ({ id: myListRailId(entry), entry }))
  const myListFocus = useIdFocus(myListRailKeyed, myListInitialId)

  const channelsInitialId =
    initialFocus?.zone === 'rail' && initialFocus.rail === 'channels' ? initialFocus.itemId : null
  const channelRailKeyed = channelRailItems.map((entry) => ({ id: channelRailId(entry), entry }))
  const channelsFocus = useIdFocus(channelRailKeyed, channelsInitialId)

  const railInitialId = (key: HomeRowKey) =>
    initialFocus?.zone === 'rail' && initialFocus.rail === key ? initialFocus.itemId : null
  const discoveryFocus = {
    'top10-movies': useIdFocus(discovery['top10-movies'].items, railInitialId('top10-movies')),
    'top10-series': useIdFocus(discovery['top10-series'].items, railInitialId('top10-series')),
    'tip-movies': useIdFocus(discovery['tip-movies'].items, railInitialId('tip-movies')),
    'tip-series': useIdFocus(discovery['tip-series'].items, railInitialId('tip-series')),
  }
  const addedMoviesFocus = useIdFocus(addedMovies, railInitialId('added-movies'))
  const addedSeriesFocus = useIdFocus(addedSeries, railInitialId('added-series'))
  const becauseFocus = useIdFocus(becauseItems, railInitialId('because'))

  // As fileiras de TÍTULOS (todas menos "Minha Lista", "Ao vivo agora" e a Curadoria IA) se comportam igual: ←/→ andam pelos
  // cards e OK abre o título. Um só mapa evita repetir seleção, direção e fundo por fileira.
  const titleRows: Partial<Record<HomeRowKey, { items: CatalogItemOut[]; focus: { index: number; moveTo: (index: number) => void } }>> = {
    continue: { items: continueItems, focus: continueFocus },
    'top10-movies': { items: discovery['top10-movies'].items, focus: discoveryFocus['top10-movies'] },
    'added-movies': { items: addedMovies, focus: addedMoviesFocus },
    'tip-movies': { items: discovery['tip-movies'].items, focus: discoveryFocus['tip-movies'] },
    because: { items: becauseItems, focus: becauseFocus },
    'top10-series': { items: discovery['top10-series'].items, focus: discoveryFocus['top10-series'] },
    'added-series': { items: addedSeries, focus: addedSeriesFocus },
    'tip-series': { items: discovery['tip-series'].items, focus: discoveryFocus['tip-series'] },
  }

  const dockInitialId = initialFocus?.zone === 'dock' ? initialFocus.service : null
  const dockFocus = useIdFocus(DOCK_ICONS, dockInitialId)

  function moveLine(direction: 'up' | 'down') {
    const idx = lines.indexOf(effectiveLine)
    if (direction === 'up') {
      if (idx <= 0) {
        // Voltar da topbar (↓) sempre pousa no billboard, nunca num ícone "Em breve" do dock.
        setLine('hero')
        onExitUp?.()
        return
      }
      setLine(lines[idx - 1])
      return
    }
    if (idx === -1 || idx === lines.length - 1) return
    setLine(lines[idx + 1])
  }

  function handleHeroSelect() {
    const action = heroActions[heroFocus.index]
    if (!action) return
    if (action.id === 'shortcut-live') {
      onNavigate('live', { zone: 'shortcuts', destination: 'live' })
      return
    }
    if (action.id === 'shortcut-movies') {
      onNavigate('movies', { zone: 'shortcuts', destination: 'movies' })
      return
    }
    if (hero.kind === 'welcome') return
    const from: HomeFocus = { zone: 'hero', action: action.id as 'primary' | 'details' | 'mylist' | 'trailer' }
    if (action.id === 'primary') {
      if (hero.primary.type === 'open-detail') {
        onOpenItem(hero.item, from)
        return
      }
      onPlay({ itemId: hero.primary.itemId, title: hero.primary.title, startAtMs: hero.primary.startAtMs })
      return
    }
    if (action.id === 'details') {
      onOpenItem(hero.item, from)
      return
    }
    if (action.id === 'mylist') {
      void favoriteToggle.toggle(hero.item)
      return
    }
    if (action.id === 'trailer') {
      const toast = trailerActionToast(trailerState, t)
      if (toast !== null) showToast(toast)
      // `trailerOpen` cobre o instante entre um OK repetido e a camada do trailer montar (como no detalhe, FR-012).
      else if (!trailerOpen) setTrailerOpen(true)
    }
  }

  function handleSelect() {
    if (effectiveLine === 'hero') {
      handleHeroSelect()
      return
    }
    const titleRow = titleRows[effectiveLine as HomeRowKey]
    if (titleRow) {
      const item = titleRow.items[titleRow.focus.index]
      if (item) onOpenItem(item, { zone: 'rail', rail: effectiveLine as HomeRowKey, itemId: item.id })
      return
    }
    if (effectiveLine === 'mylist') {
      const keyed = myListRailKeyed[myListFocus.index]
      if (!keyed) return
      const from: HomeFocus = { zone: 'rail', rail: 'mylist', itemId: keyed.id }
      if (keyed.entry.kind === 'item') onOpenItem(keyed.entry.item, from)
      else if (keyed.entry.kind === 'movies') onOpenFavorites('movies', from)
      else onOpenFavorites('series', from)
      return
    }
    if (effectiveLine === 'channels') {
      const keyed = channelRailKeyed[channelsFocus.index]
      if (!keyed) return
      const from: HomeFocus = { zone: 'rail', rail: 'channels', itemId: keyed.id }
      if (keyed.entry.kind === 'channel') onOpenChannel(keyed.entry.item, from)
      else onOpenFavorites('live', from)
      return
    }
    if (effectiveLine === 'ai') {
      announce(comingSoonToast('home-ai-curation', t))
      return
    }
    if (effectiveLine === 'dock') {
      const icon = DOCK_ICONS[dockFocus.index]
      if (!icon) return
      if (icon.id === TMDB_DOCK_ID) {
        // Real desde a feature 032: leva ao card do TMDB (sem o callback, só diz o estado).
        if (onOpenIntegrations) onOpenIntegrations({ zone: 'dock', service: icon.id })
        else announce(t(TMDB_DOCK_LABEL_KEY[tmdbState]))
        return
      }
      announce(comingSoonToast(icon.id, t))
    }
  }

  useRemoteNav(
    active
      ? {
          onDirection: (direction) => {
            if (direction === 'up' || direction === 'down') {
              moveLine(direction)
              return
            }
            const delta = direction === 'left' ? -1 : 1
            if (effectiveLine === 'hero') heroFocus.moveTo(heroFocus.index + delta)
            else if (effectiveLine === 'dock') dockFocus.moveTo(dockFocus.index + delta)
            else if (effectiveLine === 'mylist') myListFocus.moveTo(myListFocus.index + delta)
            else if (effectiveLine === 'channels') channelsFocus.moveTo(channelsFocus.index + delta)
            else titleRows[effectiveLine as HomeRowKey]?.focus.moveTo((titleRows[effectiveLine as HomeRowKey]?.focus.index ?? 0) + delta)
          },
          onSelect: handleSelect,
          onBack,
        }
      : {},
  )

  // --- Posição vertical: o billboard ocupa a tela (fileiras só espiam embaixo) ou recolhe e a fileira focada sobe ao topo ---
  const contentRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const settledRef = useRef(false)
  const rowsKey = rowKeys.join('|')
  useLayoutEffect(() => {
    const stage = stageRef.current
    const track = trackRef.current
    const host = contentRef.current
    if (!stage || !track || !host) return
    let y = Math.max(0, stage.clientHeight - HOME_PEEK_HEIGHT)
    if (mode === 'rows') {
      const section = track.querySelector<HTMLElement>(`[data-row="${effectiveLine}"]`)
      y = section ? -section.offsetTop : 0
    }
    track.style.transform = `translateY(${y}px)`
    // A 1ª sincronização — inclusive a restauração do foco ao voltar de um destino — acontece sem animar (FR-020): a Home
    // já aparece no lugar. Enquanto a fileira pedida ainda não existe (dados chegando) segue "instantâneo".
    if (!settledRef.current) {
      host.dataset.instant = 'true'
      if (line === effectiveLine) {
        settledRef.current = true
        requestAnimationFrame(() => {
          delete host.dataset.instant
        })
      }
    }
  }, [mode, effectiveLine, rowsKey, line])

  // --- Fundo ambiente: o do billboard na hora; o do card focado só depois de parar (seta segurada não faz piscar) ---
  const focusedRowItem: CatalogItemOut | null = (() => {
    if (effectiveLine === 'mylist') {
      const entry = myListRailKeyed[myListFocus.index]?.entry
      return entry?.kind === 'item' ? entry.item : null
    }
    const titleRow = titleRows[effectiveLine as HomeRowKey]
    if (titleRow) return titleRow.items[titleRow.focus.index] ?? null
    return null // canal, "Ver todos" e Curadoria IA não trocam o fundo
  })()
  const [settledItem, setSettledItem] = useState<CatalogItemOut | null>(null)
  useEffect(() => {
    if (mode !== 'rows' || focusedRowItem === null) return
    const timer = setTimeout(() => setSettledItem(focusedRowItem), HOME_AMBIENT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [mode, focusedRowItem])
  const ambientItem = mode === 'billboard' ? heroItem : (settledItem ?? heroItem)

  // Imagens 16:9 já no aparelho: listagem → cache de metadata → o que veio com as respostas do TMDB (FR-021). São dezenas de
  // itens: montar a lista e o mapa a cada render custa menos que manter memos com dependências instáveis.
  const allItems: CatalogItemOut[] = []
  if (heroItem) allItems.push(heroItem)
  for (const row of Object.values(titleRows)) allItems.push(...row.items)
  for (const entry of mylistRailItems) if (entry.kind === 'item') allItems.push(entry.item)
  const extraImages = new Map<string, string>()
  for (const images of [top10MoviesQuery.images, top10SeriesQuery.images, tipMoviesQuery.images, tipSeriesQuery.images, becauseRow?.images]) {
    for (const [id, url] of images ?? []) extraImages.set(id, url)
  }
  const images = useHomeImages(allItems, extraImages)
  const tmdbRatings = mergeDiscoveryRatings(top10MoviesQuery.ratings, top10SeriesQuery.ratings, tipMoviesQuery.ratings, tipSeriesQuery.ratings)
  const ambientImage =
    ambientItem === null
      ? undefined
      : ambientItem.id === heroItem?.id
        ? (heroMetadata?.backdropUrl?.value ?? images.get(ambientItem.id))
        : images.get(ambientItem.id)
  const ambientNode = <HomeAmbient imageUrl={ambientImage} coverUrl={ambientItem?.icon_url ?? undefined} dim={mode === 'rows'} />

  // --- Billboard ---
  const heroCard = hero.kind === 'continue' && hero.primary.type === 'play' ? continueCards.find((card) => card.item.id === hero.item.id) : undefined
  const billboardActions: BillboardAction[] = heroActions.map((action) =>
    action.id === 'primary' ? { ...action, progress: heroCard?.progress ?? null, code: heroCard?.code ?? null } : action,
  )
  const heroDuration = heroMetadata?.durationSeconds?.value
  const eyebrow =
    hero.kind === 'welcome'
      ? undefined
      : t(
          hero.kind === 'continue'
            ? hero.item.kind === 'series'
              ? 'home.eyebrow.continueSeries'
              : 'home.eyebrow.continueMovie'
            : hero.item.kind === 'series'
              ? 'home.eyebrow.favoriteSeries'
              : 'home.eyebrow.favoriteMovie',
        )

  const dockNode = (
    <div className="home-dock" role="group" aria-label={t('home.dock.label')}>
      {DOCK_ICONS.map((iconDef, index) => {
        const focused = active && effectiveLine === 'dock' && index === dockFocus.index
        if (iconDef.id === TMDB_DOCK_ID) {
          // Real (feature 032, FR-016): o estado vai no nome acessível e num
          // marcador (`data-state`) — nunca só por cor.
          return (
            <button
              key={iconDef.id}
              type="button"
              className={`home-dock-icon home-dock-icon--service${focused ? ' tv-focus' : ''}`}
              aria-label={t(TMDB_DOCK_LABEL_KEY[tmdbState])}
              title={t(TMDB_DOCK_LABEL_KEY[tmdbState])}
              data-state={tmdbState}
            >
              <Icon name={iconDef.icon} />
            </button>
          )
        }
        return (
          <button
            key={iconDef.id}
            type="button"
            className={`home-dock-icon is-soft-disabled${focused ? ' tv-focus' : ''}`}
            aria-label={iconDef.labelKey ? t(iconDef.labelKey) : undefined}
            // Achado real (feature 028, FR-016): "Em breve" — o nome não
            // dizia indisponível, `aria-disabled` diz.
            aria-disabled="true"
          >
            <Icon name={iconDef.icon} />
          </button>
        )
      })}
    </div>
  )

  // --- Fileiras ---
  const focusedRowIndex = rowKeys.indexOf(effectiveLine as HomeRowKey)

  /** Selos de um card (`cardBadges`): só do que já foi lido do aparelho. Série "assistida" = série em dia (A-004). */
  function badgesOf(item: CatalogItemOut): CardBadges {
    const stableId = stableIdOf(item)
    const isSeries = item.kind === 'series'
    const watched = isSeries
      ? item.series_id != null && seriesSummary?.get(item.series_id)?.upToDate === true
      : stableId !== null && watchedMovieIds?.has(stableId) === true
    const favorite = stableId !== null && (isSeries ? favoriteSeriesIds : favoriteMovieIds)?.has(stableId) === true
    return cardBadges({ addedAt: item.added_at, providerRating: item.provider_rating, watched, favorite }, epgNow)
  }

  /** Legenda do card de Continuar (`T1:E3 · faltam 26 min`): só o que é real — sem duração conhecida, sem "faltam". */
  function continueCaption(item: CatalogItemOut): string | undefined {
    const card = continueCardOf.get(item.id)
    if (!card) return undefined
    const left = card.progress ? t('home.progress.left', { time: formatDurationMinutes(card.progress.remainingSeconds) }) : null
    const caption = [card.code, left].filter(Boolean).join(' · ')
    return caption === '' ? undefined : caption
  }

  function titleRail(key: HomeRowKey, items: CatalogItemOut[], index: number, format: Extract<HomeRowFormat, 'poster' | 'rank' | 'continue'>) {
    const m = HOME_ROW_FORMATS[format]
    const here = effectiveLine === key
    return (
      <Rail
        items={items}
        itemWidth={m.itemWidth}
        itemHeight={m.itemHeight}
        focusedIndex={here ? index : -1}
        // O card focado expande (FR-009) e vai para o início da janela (FR-019); fora do foco do conteúdo, nada se alarga.
        focusedItemWidth={active && here ? m.expandedItemWidth : undefined}
        align="start"
        renderItem={(item, itemIndex) => (
          <div className="home-rail-slot">
            <HomeTitleCard
              item={item}
              format={format}
              focused={active && here && itemIndex === index}
              // Posição NA FILEIRA (1, 2, 3…, sem buracos — feature 057); a posição real no TMDB é do TMDB, não do card.
              rank={format === 'rank' ? itemIndex + 1 : undefined}
              badges={badgesOf(item)}
              image={images.get(item.id)}
              tmdbRating={tmdbRatings.get(item.id)}
              progress={format === 'continue' ? continueCardOf.get(item.id)?.progress : undefined}
              caption={format === 'continue' ? continueCaption(item) : undefined}
            />
          </div>
        )}
      />
    )
  }

  function renderRow(key: HomeRowKey): ReactNode {
    let title = ''
    let format: HomeRowFormat = 'poster'
    let body: ReactNode = null
    let extras: ReactNode = null

    if (key === 'continue') {
      title = t('home.row.continue')
      format = 'continue'
      body = titleRail(key, continueItems, continueFocus.index, 'continue')
    } else if (key === 'mylist') {
      title = t('home.row.myList')
      body = (
        <Rail
          items={mylistRailItems}
          itemWidth={HOME_ROW_FORMATS.poster.itemWidth}
          itemHeight={HOME_ROW_FORMATS.poster.itemHeight}
          focusedIndex={effectiveLine === 'mylist' ? myListFocus.index : -1}
          // Só um título expande; "Filmes (N)"/"Séries (N)" ficam como estão.
          focusedItemWidth={
            active && effectiveLine === 'mylist' && myListRailKeyed[myListFocus.index]?.entry.kind === 'item'
              ? HOME_ROW_FORMATS.poster.expandedItemWidth
              : undefined
          }
          align="start"
          renderItem={(entry, index) => {
            const focused = active && effectiveLine === 'mylist' && index === myListFocus.index
            if (entry.kind === 'item') {
              return (
                <div className="home-rail-slot">
                  <HomeTitleCard item={entry.item} format="poster" focused={focused} badges={badgesOf(entry.item)} image={images.get(entry.item.id)} />
                </div>
              )
            }
            const label =
              entry.kind === 'movies'
                ? t('home.seeAll.movies', { n: entry.count })
                : t('home.seeAll.series', { n: entry.count })
            return (
              <div className="home-rail-slot">
                <SeeAllCard label={label} focused={focused} />
              </div>
            )
          }}
        />
      )
    } else if (key === 'channels') {
      title = t('home.row.live')
      format = 'live'
      body = (
        <Rail
          items={channelRailItems}
          itemWidth={HOME_ROW_FORMATS.live.itemWidth}
          itemHeight={HOME_ROW_FORMATS.live.itemHeight}
          focusedIndex={effectiveLine === 'channels' ? channelsFocus.index : -1}
          align="start"
          renderItem={(entry, index) => {
            const focused = active && effectiveLine === 'channels' && index === channelsFocus.index
            if (entry.kind === 'channel') {
              return (
                <div className="home-rail-slot">
                  <HomeLiveCard
                    item={entry.item}
                    number={(channelCategories && channelNumberOf(entry.item, channelCategories)) ?? undefined}
                    now={nowNextForChannel(epgLookup, entry.item.epg_channel_id, epgNow).now}
                    focused={focused}
                  />
                </div>
              )
            }
            return (
              <div className="home-rail-slot">
                <SeeAllCard label={t('home.seeAll.all', { n: entry.count })} focused={focused} />
              </div>
            )
          }}
        />
      )
    } else if (isDiscoveryRow(key)) {
      const row = discovery[key]
      const ranked = key.startsWith('top10')
      title = t(DISCOVERY_TITLE[key])
      format = ranked ? 'rank' : 'poster'
      body = titleRail(key, row.items, discoveryFocus[key].index, ranked ? 'rank' : 'poster')
      extras = (
        <>
          {/* Procedência dos dados (FR-012) e escopo parcial (D-012): texto, nunca focável. */}
          <span className="home-row-source">{t('showcase.source.tmdb')}</span>
          {row.total > 0 && row.covered < row.total && (
            <span className="home-row-coverage">{t('showcase.ratedCoverage', { covered: row.covered, total: row.total })}</span>
          )}
        </>
      )
    } else if (key === 'added-movies' || key === 'added-series') {
      const query = key === 'added-movies' ? addedMoviesQuery : addedSeriesQuery
      title = t(key === 'added-movies' ? 'home.row.addedMovies' : 'home.row.addedSeries')
      body = titleRail(key, titleRows[key]?.items ?? [], titleRows[key]?.focus.index ?? 0, 'poster')
      // Escopo parcial (FR-016): só as categorias já obtidas entram — texto, nunca focável.
      const covered = query.coveredCategories
      const total = query.totalCategories
      if (covered !== undefined && total !== undefined && total > 0 && covered < total) {
        extras = <span className="home-row-coverage">{t('showcase.ratedCoverage', { covered, total })}</span>
      }
    } else if (key === 'because') {
      title = t('showcase.row.becauseOf', { title: becauseRow?.seed.name ?? '' })
      body = titleRail(key, becauseItems, becauseFocus.index, 'poster')
      extras = <span className="home-row-source">{t('showcase.source.tmdb')}</span>
    } else if (key === 'ai') {
      title = t('home.row.ai')
      body = (
        <div className="home-row-single">
          <ComingSoon id="home-ai-curation" focused={active && effectiveLine === 'ai'} />
        </div>
      )
    }

    const above = mode === 'rows' && focusedRowIndex !== -1 && rowKeys.indexOf(key) < focusedRowIndex
    return (
      <section key={key} className={`home-row${above ? ' is-above' : ''}`} aria-label={title} data-row={key} style={rowStyle(format)}>
        <div className="home-row-head">
          <h2 className="home-row-title">{title}</h2>
          {extras}
        </div>
        {body}
      </section>
    )
  }

  return (
    <div
      ref={contentRef}
      className="home-content no-scrollbar"
      data-mode={mode}
      style={{ '--home-peek-height': `${HOME_PEEK_HEIGHT}px` } as CSSProperties}
    >
      {ambientHost === undefined ? ambientNode : ambientHost ? createPortal(ambientNode, ambientHost) : null}
      {/* Feature 038 (FR-031/FR-032): texto, não controle — sem tabIndex, fora da navegação. */}
      {statusLine && <p className="home-status-line">{statusLine}</p>}
      <div ref={stageRef} className="home-stage">
        <HomeBillboard
          state={mode === 'billboard' ? 'expanded' : 'collapsed'}
          ariaLabel={heroItem ? heroItem.name : t('home.welcome.aria')}
          eyebrow={eyebrow}
          title={heroItem ? heroItem.name : t('home.welcome.title')}
          description={heroItem ? undefined : t('home.welcome.description')}
          meta={
            heroItem && (
              <div className="home-hero-meta">
                {heroItem.year != null && <span>{heroItem.year}</span>}
                {heroDuration != null && heroDuration > 0 && <span>{formatDurationMinutes(heroDuration)}</span>}
                <RatingBadge value={heroItem.provider_rating} showSource />
                <ContentRatingBadge certifications={heroMetadata?.certifications} />
                <TmdbRatingBadge rating={heroMetadata?.tmdbRating} />
              </div>
            )
          }
          chips={heroItem && <DetailChips category={groupLabelDisplay(heroItem.original_group, t)} genres={heroMetadata?.genres} />}
          synopsis={heroMetadata?.synopsis?.value}
          actions={billboardActions}
          focusedActionId={active && effectiveLine === 'hero' ? heroActions[heroFocus.index]?.id : undefined}
          dock={dockNode}
        />
        <div className="home-rows">
          <div ref={trackRef} className="home-rows-track">
            {rowKeys.map(renderRow)}
          </div>
        </div>
      </div>

      <Toast message={toastMessage} messageKey={toastKey} />
      {/* Fechar o trailer não invalida nada: ver trailer não muda estado do usuário (constitution, feature 033 FR-016). */}
      {trailerOpen && trailerState.status === 'available' && heroItem && (
        <TrailerLayer title={heroItem.name} candidates={trailerState.candidates} onClose={() => setTrailerOpen(false)} />
      )}
    </div>
  )
}
