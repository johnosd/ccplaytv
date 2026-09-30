import { useState, type ReactNode } from 'react'
import {
  useContinueWatchingContent,
  useFavoritesContent,
  useHomeHero,
  useMyListContent,
  useUserState,
  type CatalogItemOut,
} from '../catalog/catalogApi'
import { stableIdOf, useEpgPrograms, useTmdbStatus } from '../catalog/catalogApi'
import { TMDB_DOCK_LABEL } from '../settings/integrationsModel'
import { nowNextForChannel } from '../../lib/epg/nowNext'
import { useNow } from '../../lib/useNow'
import type { HomeFocus, TopDestination } from '../../navigation/appNav'
import { useRemoteNav } from '../../lib/useRemoteNav'
import { useIdFocus } from '../../lib/focus/useIdFocus'
import { useFavoriteToggle } from '../favorites/useFavoriteToggle'
import { useToast } from '../../lib/useToast'
import { Toast } from '../../components/Toast'
import { useAnnounce } from '../../lib/announcer'
import { getComingSoon } from '../../lib/comingSoon'
import { ContentCard } from '../../components/ContentCard'
import { ChannelRow } from '../../components/ChannelRow'
import { ComingSoon } from '../../components/ComingSoon'
import { PosterArt } from '../../components/PosterArt'
import { Rail } from '../../components/Rail'
import { Skeleton } from '../../components/Skeleton'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/iconPaths'

/** Foco de origem que o Início sabe restaurar dentro do conteúdo (a topbar é do `HomeScreen`). */
export type HomeContentFocus = Exclude<HomeFocus, { zone: 'topbar' }>

export interface HomeContentProps {
  sourceId: string
  /** Feature 023 (D-004, `logic/foco-shell.md`): só o escopo ativo reage ao teclado e desenha o foco. */
  active?: boolean
  /** UP na linha mais alta do conteúdo (o hero) — o Início leva o foco à topbar (FR-015). */
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
}

type RowKey = 'hero' | 'continue' | 'mylist' | 'channels' | 'ai' | 'dock'
const ALL_ROWS: RowKey[] = ['hero', 'continue', 'mylist', 'channels', 'ai', 'dock']

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

interface DockIconDef {
  id: string
  icon: IconName
  label: string
}

/** Único ícone do dock que já é real (feature 032); o id não é mais um mock registrado em `comingSoon.ts`. */
const TMDB_DOCK_ID = 'dock-tmdb'

const DOCK_ICONS: DockIconDef[] = [
  { id: TMDB_DOCK_ID, icon: 'info', label: 'TMDB' },
  { id: 'dock-ai', icon: 'device', label: 'Assistente de IA' },
  { id: 'dock-weather', icon: 'live', label: 'Clima' },
  { id: 'dock-speedtest', icon: 'quality', label: 'Teste de velocidade' },
]

const CARD_WIDTH = 205
const CARD_HEIGHT = 370
const CHANNEL_WIDTH = 340
const CHANNEL_HEIGHT = 100

type HeroEntry = { id: string; label: string; softDisabled?: boolean }

function heroEntries(hero: ReturnType<typeof useHomeHero>['data'], isFavorite: boolean): HeroEntry[] {
  if (!hero || hero.kind === 'welcome') {
    return [
      { id: 'shortcut-live', label: 'Abrir TV ao vivo' },
      { id: 'shortcut-movies', label: 'Abrir Filmes' },
    ]
  }
  const primaryLabel = hero.primary.type === 'open-detail' || !hero.primary.resume ? '▶ Assistir' : '▶ Continuar'
  return [
    { id: 'primary', label: primaryLabel },
    { id: 'details', label: 'Mais informações' },
    { id: 'mylist', label: isFavorite ? '✓ Na Minha Lista' : '+ Minha Lista' },
    { id: 'trailer', label: '▶ Trailer', softDisabled: true },
  ]
}

/**
 * Conteúdo do Início definitivo (feature 026, US1): hero + rails reais
 * ("Continuar assistindo", "Minha Lista", "Canais favoritos") + mocks
 * honestos ("Curadoria IA", dock de serviços). Substitui `ListHomeScreen`
 * como escopo `content` do Início (`logic/foco-home.md`).
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
}: HomeContentProps): ReactNode {
  const heroQuery = useHomeHero(sourceId)
  const hero = heroQuery.data ?? { kind: 'welcome' as const }
  const continueQuery = useContinueWatchingContent(sourceId)
  const myListQuery = useMyListContent(sourceId)
  const channelsQuery = useFavoritesContent(sourceId, 'channel', true)
  const { toastMessage, toastKey, showToast } = useToast()
  const favoriteToggle = useFavoriteToggle(showToast)
  const announce = useAnnounce()
  // Estado do TMDB no dock (feature 032): lê só o IndexedDB, nunca a rede — seguro ao focar.
  const tmdbState = useTmdbStatus().data?.state ?? 'not_configured'

  const heroStableId = hero.kind !== 'welcome' ? stableIdOf(hero.item) : null
  const heroUserState = useUserState(heroStableId)
  const heroIsFavorite = heroUserState.data?.isFavorite ?? false

  const continueItems = continueQuery.data ?? []
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

  const rowExists: Record<RowKey, boolean> = {
    hero: true,
    continue: continueItems.length > 0,
    mylist: mylistRailItems.length > 0,
    channels: channelRailItems.length > 0,
    ai: true,
    dock: true,
  }
  const focusableRows = ALL_ROWS.filter((row) => rowExists[row])

  const initialRow: RowKey =
    initialFocus?.zone === 'hero' || initialFocus?.zone === 'shortcuts'
      ? 'hero'
      : initialFocus?.zone === 'rail'
        ? initialFocus.rail
        : initialFocus?.zone === 'dock'
          ? 'dock'
          : 'hero'
  const [row, setRow] = useState<RowKey>(initialRow)
  const effectiveRow: RowKey = focusableRows.includes(row)
    ? row
    : (() => {
        const idx = ALL_ROWS.indexOf(row)
        for (let i = idx - 1; i >= 0; i -= 1) {
          if (focusableRows.includes(ALL_ROWS[i])) return ALL_ROWS[i]
        }
        return 'hero'
      })()

  const heroInitialId =
    initialFocus?.zone === 'hero'
      ? initialFocus.action
      : initialFocus?.zone === 'shortcuts'
        ? `shortcut-${initialFocus.destination}`
        : null
  const heroActions = heroEntries(heroQuery.data, heroIsFavorite)
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

  const dockInitialId = initialFocus?.zone === 'dock' ? initialFocus.service : null
  const dockFocus = useIdFocus(DOCK_ICONS, dockInitialId)

  function moveRow(direction: 'up' | 'down') {
    const idx = focusableRows.indexOf(effectiveRow)
    if (direction === 'up') {
      if (idx <= 0) {
        onExitUp?.()
        return
      }
      setRow(focusableRows[idx - 1])
      return
    }
    if (idx === -1 || idx === focusableRows.length - 1) return
    setRow(focusableRows[idx + 1])
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
      announce(`Em breve — ${getComingSoon('home-trailer').message}`)
    }
  }

  function handleSelect() {
    if (effectiveRow === 'hero') {
      handleHeroSelect()
      return
    }
    if (effectiveRow === 'continue') {
      const item = continueItems[continueFocus.index]
      if (item) onOpenItem(item, { zone: 'rail', rail: 'continue', itemId: item.id })
      return
    }
    if (effectiveRow === 'mylist') {
      const keyed = myListRailKeyed[myListFocus.index]
      if (!keyed) return
      const from: HomeFocus = { zone: 'rail', rail: 'mylist', itemId: keyed.id }
      if (keyed.entry.kind === 'item') onOpenItem(keyed.entry.item, from)
      else if (keyed.entry.kind === 'movies') onOpenFavorites('movies', from)
      else onOpenFavorites('series', from)
      return
    }
    if (effectiveRow === 'channels') {
      const keyed = channelRailKeyed[channelsFocus.index]
      if (!keyed) return
      const from: HomeFocus = { zone: 'rail', rail: 'channels', itemId: keyed.id }
      if (keyed.entry.kind === 'channel') onOpenChannel(keyed.entry.item, from)
      else onOpenFavorites('live', from)
      return
    }
    if (effectiveRow === 'ai') {
      announce(`Em breve — ${getComingSoon('home-ai-curation').message}`)
      return
    }
    if (effectiveRow === 'dock') {
      const icon = DOCK_ICONS[dockFocus.index]
      if (!icon) return
      if (icon.id === TMDB_DOCK_ID) {
        // Real desde a feature 032: leva ao card do TMDB (sem o callback, só diz o estado).
        if (onOpenIntegrations) onOpenIntegrations({ zone: 'dock', service: icon.id })
        else announce(TMDB_DOCK_LABEL[tmdbState])
        return
      }
      announce(`Em breve — ${getComingSoon(icon.id).message}`)
    }
  }

  useRemoteNav(
    active
      ? {
          onDirection: (direction) => {
            if (direction === 'up' || direction === 'down') {
              moveRow(direction)
              return
            }
            const delta = direction === 'left' ? -1 : 1
            if (effectiveRow === 'hero') heroFocus.moveTo(heroFocus.index + delta)
            else if (effectiveRow === 'continue') continueFocus.moveTo(continueFocus.index + delta)
            else if (effectiveRow === 'mylist') myListFocus.moveTo(myListFocus.index + delta)
            else if (effectiveRow === 'channels') channelsFocus.moveTo(channelsFocus.index + delta)
            else if (effectiveRow === 'dock') dockFocus.moveTo(dockFocus.index + delta)
          },
          onSelect: handleSelect,
          onBack,
        }
      : {},
  )

  const metaParts: string[] = []
  if (hero.kind !== 'welcome') {
    if (hero.item.year != null) metaParts.push(String(hero.item.year))
    if (hero.item.original_group) metaParts.push(hero.item.original_group)
  }

  return (
    <div className="home-content no-scrollbar">
      <section className="home-hero" aria-label={hero.kind === 'welcome' ? 'Boas-vindas' : hero.item.name}>
        <div className="home-hero-poster">
          {hero.kind !== 'welcome' && <PosterArt url={hero.item.icon_url ?? undefined} title={hero.item.name} />}
        </div>
        <div className="home-hero-info">
          <div className="home-hero-title">
            {hero.kind === 'welcome' ? 'Bem-vindo(a) ao CCPlayTV' : hero.item.name}
          </div>
          {hero.kind === 'welcome' ? (
            <p className="home-hero-description">
              Favorite canais, filmes e séries para vê-los aqui, ou explore o catálogo pela barra de cima.
            </p>
          ) : (
            metaParts.length > 0 && <div className="home-hero-meta">{metaParts.join(' · ')}</div>
          )}
          <div className="home-hero-actions">
            {heroActions.map((action, index) => (
              <button
                key={action.id}
                type="button"
                className={`home-hero-action${effectiveRow === 'hero' && active && index === heroFocus.index ? ' tv-focus' : ''}${action.softDisabled ? ' is-soft-disabled' : ''}`}
                // Achado real (feature 028, FR-016): nome ("▶ Trailer") não dizia
                // indisponível, e faltava o sinal estático pra tecnologia assistiva.
                aria-disabled={action.softDisabled ? 'true' : undefined}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {continueQuery.isLoading ? (
        <HomeRowSkeleton title="Continuar assistindo" width={CARD_WIDTH} height={CARD_HEIGHT} />
      ) : (
        continueItems.length > 0 && (
          <section className="home-row" aria-label="Continuar assistindo">
            <h2 className="home-row-title">Continuar assistindo</h2>
            <Rail
              items={continueItems}
              itemWidth={CARD_WIDTH}
              itemHeight={CARD_HEIGHT}
              focusedIndex={effectiveRow === 'continue' ? continueFocus.index : -1}
              renderItem={(item, index) => (
                <ContentCard
                  variant="portrait"
                  title={item.name}
                  iconUrl={item.icon_url ?? undefined}
                  focused={active && effectiveRow === 'continue' && index === continueFocus.index}
                />
              )}
            />
          </section>
        )
      )}

      {myListQuery.isLoading ? (
        <HomeRowSkeleton title="Minha Lista" width={CARD_WIDTH} height={CARD_HEIGHT} />
      ) : (
        mylistRailItems.length > 0 && (
          <section className="home-row" aria-label="Minha Lista">
            <h2 className="home-row-title">Minha Lista</h2>
            <Rail
              items={mylistRailItems}
              itemWidth={CARD_WIDTH}
              itemHeight={CARD_HEIGHT}
              focusedIndex={effectiveRow === 'mylist' ? myListFocus.index : -1}
              renderItem={(entry, index) => {
                const focused = active && effectiveRow === 'mylist' && index === myListFocus.index
                if (entry.kind === 'item') {
                  return (
                    <ContentCard
                      variant="portrait"
                      title={entry.item.name}
                      iconUrl={entry.item.icon_url ?? undefined}
                      focused={focused}
                    />
                  )
                }
                const label = entry.kind === 'movies' ? `Filmes (${entry.count})` : `Séries (${entry.count})`
                return <HomeSeeAllCard label={label} focused={focused} />
              }}
            />
          </section>
        )
      )}

      {channelsQuery.isLoading ? (
        <HomeRowSkeleton title="Canais favoritos" width={CHANNEL_WIDTH} height={CHANNEL_HEIGHT} />
      ) : (
        channelRailItems.length > 0 && (
          <section className="home-row" aria-label="Canais favoritos">
            <h2 className="home-row-title">Canais favoritos</h2>
            <Rail
              items={channelRailItems}
              itemWidth={CHANNEL_WIDTH}
              itemHeight={CHANNEL_HEIGHT}
              focusedIndex={effectiveRow === 'channels' ? channelsFocus.index : -1}
              renderItem={(entry, index) => {
                const focused = active && effectiveRow === 'channels' && index === channelsFocus.index
                if (entry.kind === 'channel') {
                  return (
                    <ChannelRow
                      logoUrl={entry.item.icon_url ?? undefined}
                      name={entry.item.name}
                      nowPlaying={nowNextForChannel(epgLookup, entry.item.epg_channel_id, epgNow).now?.title}
                      focused={focused}
                    />
                  )
                }
                return <HomeSeeAllCard label={`Ver todos (${entry.count})`} focused={focused} />
              }}
            />
          </section>
        )
      )}

      <section className="home-row" aria-label="Curadoria IA">
        <h2 className="home-row-title">Curadoria IA</h2>
        <div className="home-row-single">
          <ComingSoon id="home-ai-curation" focused={active && effectiveRow === 'ai'} />
        </div>
      </section>

      <div className="home-dock" role="group" aria-label="Serviços">
        {DOCK_ICONS.map((iconDef, index) => {
          const focused = active && effectiveRow === 'dock' && index === dockFocus.index
          if (iconDef.id === TMDB_DOCK_ID) {
            // Real (feature 032, FR-016): o estado vai no nome acessível e num
            // marcador (`data-state`) — nunca só por cor.
            return (
              <button
                key={iconDef.id}
                type="button"
                className={`home-dock-icon home-dock-icon--service${focused ? ' tv-focus' : ''}`}
                aria-label={TMDB_DOCK_LABEL[tmdbState]}
                title={TMDB_DOCK_LABEL[tmdbState]}
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
              aria-label={iconDef.label}
              // Achado real (feature 028, FR-016): "Em breve" — o nome não
              // dizia indisponível, `aria-disabled` diz.
              aria-disabled="true"
            >
              <Icon name={iconDef.icon} />
            </button>
          )
        })}
      </div>

      <Toast message={toastMessage} messageKey={toastKey} />
    </div>
  )
}

function HomeRowSkeleton({ title, width, height }: { title: string; width: number; height: number }): ReactNode {
  return (
    <section className="home-row" aria-label={title} aria-busy="true">
      <h2 className="home-row-title">{title}</h2>
      <div className="home-row-skeleton">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} width={width} height={height} />
        ))}
      </div>
    </section>
  )
}

function HomeSeeAllCard({ label, focused }: { label: string; focused: boolean }): ReactNode {
  return (
    <div className={`home-see-all${focused ? ' tv-focus' : ''}`}>
      <span>{label}</span>
    </div>
  )
}
