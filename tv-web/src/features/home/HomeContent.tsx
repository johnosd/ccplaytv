import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  useContinueCards,
  useFavoriteIds,
  useFavoritesContent,
  useHomeImages,
  useRecentlyAdded,
  useHomeHero,
  useMyListContent,
  useSeriesWatchedSummary,
  useTitleMetadata,
  useUserState,
  useWatchedIds,
  type CatalogItemOut,
} from '../catalog/catalogApi'
import { stableIdOf } from '../catalog/catalogApi'
import { useNow } from '../../lib/useNow'
import type { HomeFocus, TopDestination } from '../../navigation/appNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useIdFocus } from '../../lib/focus/useIdFocus'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { useToast } from '../../lib/useToast'
import { useT } from '../../lib/i18n/I18nProvider'
import { Toast } from '../../components/Toast'
import { Spinner } from '../../components/Spinner'
import { EmptyState } from '../../components/EmptyState'
import { RatingBadge } from '../../components/RatingBadge'
import { ContentRatingBadge } from '../../components/ContentRatingBadge'
import { TmdbRatingBadge } from '../../components/TmdbRatingBadge'
import { SeeAllCard } from '../../components/SeeAllCard'
import { Rail } from '../../components/Rail'
import { DetailChips } from '../vod/DetailChips'
import { formatDurationMinutes } from '../vod/detailMetadataFormat'
import { groupLabelDisplay } from '../vod/vodGroupDisplay'
import { HomeAmbient } from './HomeAmbient'
import { HomeBillboard, type BillboardAction } from './HomeBillboard'
import { HomeLiveCard } from './HomeLiveCard'
import { HomeTitleCard } from './HomeTitleCard'
import { cardBadges, type CardBadges } from './cardBadges'
import {
  HOME_AMBIENT_DELAY_MS,
  HOME_CHANNELS_VISIBLE,
  HOME_DEFERRED_MS,
  HOME_PEEK_HEIGHT,
  HOME_ROW_FORMATS,
  type HomeRowFormat,
} from './homeRowFormats'
import { HOME_ROW_ORDER, buildHomeRows, type HomeRowKey } from './homeRows'
import { useDeferred } from './useDeferred'
import { useHomeAssembly } from './useHomeAssembly'
import { channelRailId, heroEntries, myListRailId, rowStyle, type ChannelRailItem, type MyListRailItem } from './homeContentModel'

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
  /** Card de filme ou série (FR-012) e a primária de um favorito ainda não começado. */
  onOpenItem: (item: CatalogItemOut, from: HomeFocus) => void
  /** Card de "Canais favoritos" (FR-013). */
  onOpenChannel: (channel: CatalogItemOut, from: HomeFocus) => void
  /** "Ver todos (N)"/"Filmes (N)"/"Séries (N)" (FR-014). */
  onOpenFavorites: (destination: TopDestination, from: HomeFocus) => void
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
  /** Feature 079 (FR-009): muda quando a pessoa fecha o player — o que a releitura trouxer entra na posição. */
  userActionKey?: number
}

/** Linhas navegáveis, de cima para baixo (D-017): as ações do billboard e as fileiras. */
type LineKey = 'hero' | HomeRowKey
const ALL_LINES: LineKey[] = ['hero', ...HOME_ROW_ORDER]

/** Sem imagens além das da listagem e da metadata (as que vinham do Top 10/Dica saíram com essas fileiras). */
const EMPTY_IMAGES: ReadonlyMap<string, string> = new Map()

/**
 * Conteúdo do Início "Vitrine expandida" (feature 060, `logic/billboard-e-navegacao.md`): um billboard de um título que
 * recolhe quando o foco desce, fileiras que ocupam a tela com a focada no topo e um fundo ambiente que acompanha o item
 * focado. Continua sendo o único dono da navegação (um só `useRemoteNav`, D-001): os componentes de baixo são só
 * apresentação. Desde o ad-hoc de 2026-10-09 só há fileiras do próprio aparelho (canais favoritos, continuar, Minha Lista e
 * adicionados), sem Top 10/Dica/"Porque você assistiu"/Curadoria IA e sem o dock de serviços.
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
  onPlay,
  initialFocus,
  statusLine,
  ambientHost,
  userActionKey,
}: HomeContentProps): ReactNode {
  const heroQuery = useHomeHero(sourceId)
  const continueQuery = useContinueCards(sourceId)
  const myListQuery = useMyListContent(sourceId)
  const channelsQuery = useFavoritesContent(sourceId, 'channel', true)
  // Feature 079 (D-010): "adicionados" entram na espera da montagem — não são mais adiados para depois do 1º desenho.
  const addedMoviesQuery = useRecentlyAdded(sourceId, 'movie')
  const addedSeriesQuery = useRecentlyAdded(sourceId, 'series')
  const t = useT()
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)

  const continueCards = useMemo(() => continueQuery.data ?? [], [continueQuery.data])
  const continueItems = useMemo(() => continueCards.map((card) => card.item), [continueCards])
  const continueCardOf = useMemo(() => new Map(continueCards.map((card) => [card.item.id, card])), [continueCards])
  const addedMovies = addedMoviesQuery.data ?? []
  const addedSeries = addedSeriesQuery.data ?? []

  // Imagens 16:9 já no aparelho: listagem → cache de metadata → o que veio com as respostas do TMDB (FR-021). São dezenas de
  // itens: montar a lista e o mapa a cada render custa menos que manter memos com dependências instáveis.
  const allItems: CatalogItemOut[] = []
  if (heroQuery.data && heroQuery.data.kind !== 'welcome') allItems.push(heroQuery.data.item)
  allItems.push(...continueItems, ...addedMovies, ...addedSeries, ...(myListQuery.data?.items ?? []))
  const images = useHomeImages(allItems, EMPTY_IMAGES)

  // Feature 079 (`logic/montagem-de-tela.md`): nada aparece até o billboard, as fileiras e as capas da primeira tela
  // estarem prontos (ou o teto de 2 s); o hero que chega depois do teto não troca o billboard (modo neutro).
  const assembly = useHomeAssembly(
    { hero: heroQuery, channels: channelsQuery, continue: continueQuery, mylist: myListQuery, addedMovies: addedMoviesQuery, addedSeries: addedSeriesQuery },
    images,
    userActionKey,
  )
  const waiting = assembly.phase === 'waiting'
  const heroData = assembly.isShown('hero') ? heroQuery.data : undefined
  const hero = heroData ?? { kind: 'welcome' as const }
  const neutralHero = heroData === undefined
  const heroItem = hero.kind !== 'welcome' ? hero.item : null
  const heroStableId = heroItem ? stableIdOf(heroItem) : null
  const heroUserState = useUserState(heroStableId)
  const heroIsFavorite = heroUserState.data?.isFavorite ?? false

  // Metadata do título do billboard: a mesma consulta do detalhe, feita ao ABRIR a Home (nunca ao focar). Falha ou id sem
  // registro = billboard sem backdrop/sinopse, nunca um erro na tela (R-011).
  const metadataQuery = useTitleMetadata(heroItem?.id ?? null)
  const heroMetadata = metadataQuery.data

  // Selos dos cards (FR-008): assistido e favorito saem de UMA leitura local por tipo, nunca de uma consulta por card. O resumo
  // de séries em dia lê os episódios do aparelho; fica para depois do 1º desenho (D-013).
  const deferred = useDeferred(HOME_DEFERRED_MS)
  const watchedMovieIds = useWatchedIds(sourceId, 'movie').data
  const favoriteMovieIds = useFavoriteIds(sourceId, 'movie').data
  const favoriteSeriesIds = useFavoriteIds(sourceId, 'series').data
  const seriesSummary = useSeriesWatchedSummary(deferred ? sourceId : null).data

  const myListContent = myListQuery.data ?? { items: [], movieCount: 0, seriesCount: 0 }
  const channelsContent = channelsQuery.data ?? { items: [], unresolved: 0 }
  const epgNow = useNow()

  const mylistRailItems: MyListRailItem<CatalogItemOut>[] = [
    ...myListContent.items.map((item): MyListRailItem<CatalogItemOut> => ({ kind: 'item', item })),
    ...(myListContent.movieCount > 0 ? [{ kind: 'movies' as const, count: myListContent.movieCount }] : []),
    ...(myListContent.seriesCount > 0 ? [{ kind: 'series' as const, count: myListContent.seriesCount }] : []),
  ]
  const channelRailItems: ChannelRailItem<CatalogItemOut>[] = [
    // Só os ícones que cabem na tela; o resto fica a um "Ver todos (N)" da categoria Favoritos da TV ao vivo.
    ...channelsContent.items.slice(0, HOME_CHANNELS_VISIBLE).map((item): ChannelRailItem<CatalogItemOut> => ({ kind: 'channel', item })),
    ...(channelsContent.items.length > 0 ? [{ kind: 'see-all' as const, count: channelsContent.items.length }] : []),
  ]

  // Fileira sem dado não existe (FR-018): sem skeleton, sem "Em breve"; e só aparece o que a montagem já mostrou (079).
  const rowKeys = buildHomeRows({
    channels: channelRailItems.length > 0,
    continue: continueItems.length > 0,
    mylist: mylistRailItems.length > 0,
    'added-movies': addedMovies.length > 0,
    'added-series': addedSeries.length > 0,
  }).filter((key) => assembly.isShown(key))
  const lines: LineKey[] = ['hero', ...rowKeys]

  // Um foco antigo numa fileira que não existe mais (Top 10, Dica…) cai no billboard, nunca em nada.
  const restoredRail = initialFocus?.zone === 'rail' ? ALL_LINES.find((key) => key === initialFocus.rail) : undefined
  const initialLine: LineKey = restoredRail ?? 'hero'
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
  const mode: 'billboard' | 'rows' = effectiveLine === 'hero' ? 'billboard' : 'rows'

  const heroInitialId =
    initialFocus?.zone === 'hero'
      ? initialFocus.action
      : initialFocus?.zone === 'shortcuts'
        ? `shortcut-${initialFocus.destination}`
        : null
  const heroActions = heroEntries(heroData, heroIsFavorite, t)
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
  const addedMoviesFocus = useIdFocus(addedMovies, railInitialId('added-movies'))
  const addedSeriesFocus = useIdFocus(addedSeries, railInitialId('added-series'))

  // As fileiras de TÍTULOS (todas menos "Minha Lista" e os canais) se comportam igual: ←/→ andam pelos cards e OK abre o
  // título. Um só mapa evita repetir seleção, direção e fundo por fileira.
  const titleRows: Partial<Record<HomeRowKey, { items: CatalogItemOut[]; focus: { index: number; moveTo: (index: number) => void } }>> = {
    continue: { items: continueItems, focus: continueFocus },
    'added-movies': { items: addedMovies, focus: addedMoviesFocus },
    'added-series': { items: addedSeries, focus: addedSeriesFocus },
  }

  function moveLine(direction: 'up' | 'down') {
    const idx = lines.indexOf(effectiveLine)
    if (direction === 'up') {
      if (idx <= 0) {
        // Voltar da topbar (↓) sempre pousa no billboard.
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
    const from: HomeFocus = { zone: 'hero', action: action.id as 'primary' | 'mylist' }
    if (action.id === 'primary') {
      if (hero.primary.type === 'open-detail') {
        onOpenItem(hero.item, from)
        return
      }
      onPlay({ itemId: hero.primary.itemId, title: hero.primary.title, startAtMs: hero.primary.startAtMs })
      return
    }
    if (action.id !== 'mylist') return
    void favoriteToggle.toggle(hero.item)
    assembly.follow() // "Minha Lista" pode passar a existir: é consequência da ação da pessoa (079, FR-009)
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
  }

  useRemoteNav(
    active
      ? {
          onDirection: (direction) => {
            // Montando (079): só "Voltar" está na tela — ↑ leva à topbar, o resto não mexe em foco que ainda não aparece.
            if (waiting) {
              if (direction === 'up') onExitUp?.()
              return
            }
            if (direction === 'up' || direction === 'down') {
              moveLine(direction)
              return
            }
            const delta = direction === 'left' ? -1 : 1
            if (effectiveLine === 'hero') heroFocus.moveTo(heroFocus.index + delta)
            else if (effectiveLine === 'mylist') myListFocus.moveTo(myListFocus.index + delta)
            else if (effectiveLine === 'channels') channelsFocus.moveTo(channelsFocus.index + delta)
            else titleRows[effectiveLine as HomeRowKey]?.focus.moveTo((titleRows[effectiveLine as HomeRowKey]?.focus.index ?? 0) + delta)
          },
          onSelect: waiting ? () => (assembly.showLoading ? onBack() : undefined) : handleSelect,
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
  }, [mode, effectiveLine, rowsKey, line, waiting])

  // --- Fundo ambiente: o do billboard na hora; o do card focado só depois de parar (seta segurada não faz piscar) ---
  const focusedRowItem: CatalogItemOut | null = (() => {
    if (effectiveLine === 'mylist') {
      const entry = myListRailKeyed[myListFocus.index]?.entry
      return entry?.kind === 'item' ? entry.item : null
    }
    const titleRow = titleRows[effectiveLine as HomeRowKey]
    if (titleRow) return titleRow.items[titleRow.focus.index] ?? null
    return null // canal e "Ver todos" não trocam o fundo
  })()
  const [settledItem, setSettledItem] = useState<CatalogItemOut | null>(null)
  useEffect(() => {
    if (mode !== 'rows' || focusedRowItem === null) return
    const timer = setTimeout(() => setSettledItem(focusedRowItem), HOME_AMBIENT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [mode, focusedRowItem])
  const ambientItem = mode === 'billboard' ? heroItem : (settledItem ?? heroItem)

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

  function titleRail(key: HomeRowKey, items: CatalogItemOut[], index: number, format: Extract<HomeRowFormat, 'poster' | 'continue'>) {
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
              badges={badgesOf(item)}
              image={images.get(item.id)}
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
                  <HomeLiveCard item={entry.item} focused={focused} />
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

  // Montando (079, `logic/montagem-de-tela.md` §6): nada de billboard, boas-vindas ou fileira; o "Carregando" só depois de
  // 300 ms. A raiz `.home-content` existe sempre (os roteiros E2E esperam por ela).
  if (waiting) {
    return (
      <div ref={contentRef} className="home-content home-content--assembling no-scrollbar" aria-busy="true">
        {assembly.showLoading && (
          <div className="home-loading">
            <Spinner size={48} />
            <EmptyState title={t('common.loading')} action={{ label: t('common.back'), onSelect: onBack }} focused={active} />
          </div>
        )}
      </div>
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
          // Modo neutro (079, FR-011): o hero passou do teto — atalhos, sem afirmar que não há favoritos nem histórico.
          ariaLabel={heroItem ? heroItem.name : t(neutralHero ? 'home.hero.neutralTitle' : 'home.welcome.aria')}
          eyebrow={eyebrow}
          title={heroItem ? heroItem.name : t(neutralHero ? 'home.hero.neutralTitle' : 'home.welcome.title')}
          description={heroItem || neutralHero ? undefined : t('home.welcome.description')}
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
        />
        <div className="home-rows">
          <div ref={trackRef} className="home-rows-track">
            {rowKeys.map(renderRow)}
          </div>
        </div>
      </div>

      <Toast message={toastMessage} messageKey={toastKey} />
    </div>
  )
}
