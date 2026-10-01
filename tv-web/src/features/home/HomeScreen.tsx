import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SourceOut } from '../import/importApi'
import { invalidateUserStates, type CatalogItemOut } from '../catalog/catalogApi'
import { usePrefetchProgress } from '../catalog/prefetchApi'
import { homeStatusLine } from './homeStatusLine'
import { HomeContent, type HomeContentFocus } from './HomeContent'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import { ExitModal } from '../shell/ExitModal'
import { PlayerLayer } from '../../components/PlayerLayer'
import type { HintItem } from '../shell/HintBar'
import type { HomeFocus, TopbarItem, TopDestination } from '../../navigation/appNav'

export interface HomeScreenProps {
  /** Fonte ativa da sessão (ADR-011 §3) — o nome vai no indicador da topbar, o resto no conteúdo. */
  source: SourceOut
  /** Onde estava o foco quando a pessoa saiu daqui, restaurado ao voltar (FR-017/FR-029). */
  initialFocus?: HomeFocus
  /**
   * Abrir TV ao vivo, Filmes ou Séries — por ação do hero de boas-vindas ou
   * pela topbar (FR-008/FR-016). `from` é o foco de origem, para o RETURN
   * devolvê-lo ao mesmo lugar.
   */
  onNavigate: (destination: TopDestination, from: HomeFocus) => void
  /** Indicador da lista ativa na topbar (FR-017). */
  onOpenProfiles: (from: HomeFocus) => void
  /** "Mais informações" do hero, ou card de filme/série de uma rail (FR-007/FR-012). */
  onOpenItem: (item: CatalogItemOut, from: HomeFocus) => void
  /** Card de "Canais favoritos" — TV ao vivo em ★ Favoritos com o canal tocando (FR-013). */
  onOpenChannel: (channel: CatalogItemOut, from: HomeFocus) => void
  /** "Ver todos (N)"/"Filmes (N)"/"Séries (N)" — o destino em ★ Favoritos (FR-014). */
  onOpenFavorites: (destination: TopDestination, from: HomeFocus) => void
  /** Ícone TMDB do dock (feature 032, FR-016) — Configurações › Integrações & BYOK. */
  onOpenIntegrations?: (from: HomeFocus) => void
  /** Lupa da topbar (FR-035). */
  onOpenSearch: (from: HomeFocus) => void
  /** Engrenagem da topbar (FR-021). */
  onOpenSettings: (from: HomeFocus) => void
  /** Feature 038 (US6): uma atualização da lista ativa está em andamento. */
  updating?: boolean
}

const HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Selecionar' },
  { keyLabel: 'RETURN', action: 'Sair' },
]

interface PlayingState {
  itemId: string
  title: string
  startAtMs: number | undefined
}

/**
 * Início (feature 026, US1 — substitui o conteúdo provisório de
 * `ListHomeScreen` pela Home definitiva, `logic/foco-home.md`/`logic/
 * hero-home.md`). Raiz `.screen.home-screen`: `AppShell` e `PlayerLayer`
 * como filhos diretos (D-008) — a regra de plano de hardware
 * (`:root.video-plane-visible .screen > *:not(.player-overlay)`) esconde a
 * moldura sem desmontar `HomeContent`, que é o que permite voltar exatamente
 * ao hero (mesmo estado de foco) sem reler as rails.
 *
 * Dois escopos de teclado (feature 023, `logic/foco-shell.md`): `content` e
 * `topbar`, mais o estado `playing` (feature 026, D-004) — os dois primeiros
 * ficam inativos enquanto o player está aberto.
 */
export function HomeScreen({
  source,
  initialFocus,
  onNavigate,
  onOpenProfiles,
  onOpenItem,
  onOpenChannel,
  onOpenFavorites,
  onOpenIntegrations,
  onOpenSearch,
  onOpenSettings,
  updating = false,
}: HomeScreenProps): ReactNode {
  const queryClient = useQueryClient()

  // Feature 038 (US6): "Preparando catálogo — N de M" / "Atualizando…" /
  // "Catálogo atualizado há …". A idade anda sozinha: relê a cada minuto.
  const prefetchProgress = usePrefetchProgress()
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])
  const statusLine = homeStatusLine({
    sourceId: source.id,
    updating,
    progress: prefetchProgress,
    lastSuccessfulSyncAt: source.last_successful_sync_at ? Date.parse(source.last_successful_sync_at) : null,
    now: clock,
  })
  const [zone, setZone] = useState<'topbar' | 'content'>(initialFocus?.zone === 'topbar' ? 'topbar' : 'content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>(
    initialFocus?.zone === 'topbar' ? initialFocus.item : 'home',
  )
  const [showExit, setShowExit] = useState(false)
  const [playing, setPlaying] = useState<PlayingState | null>(null)

  const contentFocus: HomeContentFocus | undefined =
    initialFocus && initialFocus.zone !== 'topbar' ? initialFocus : undefined

  // Com o player ou o modal de saída abertos, nenhum dos dois escopos reage
  // ao teclado nem desenha foco — mesmo padrão de `logic/foco-shell.md`.
  const topbarActive = zone === 'topbar' && !showExit && !playing
  const contentActive = zone === 'content' && !showExit && !playing

  function startPlaying(params: PlayingState) {
    // Guarda de sessão única (mesmo padrão de `MovieDetailScreen`/
    // `LiveScreen`) — na prática já coberta por `contentActive` desligar o
    // escopo assim que `playing` deixa de ser `null`.
    if (playing) return
    setPlaying(params)
  }

  function closePlayer() {
    setPlaying(null)
    // Sem isto, o hero continuaria com a leitura de quando montou — um
    // filme assistido por alguns minutos voltaria mostrando "Assistir" em
    // vez de "Continuar" (`logic/hero-home.md` §5). `invalidateUserStates`
    // cobre o prefixo `user-states` (plural, usado em lote) e
    // `history-content`; o estado do PRÓPRIO hero (favorito, via
    // `useUserState`) usa a chave singular `user-state`, invalidada à parte.
    void invalidateUserStates(queryClient)
    void queryClient.invalidateQueries({ queryKey: ['user-state'] })
    void queryClient.invalidateQueries({ queryKey: ['home-hero', source.id] })
    void queryClient.invalidateQueries({ queryKey: ['continue-watching', source.id] })
  }

  return (
    <div className="screen home-screen">
      <AppShell
        hints={HINTS}
        topBar={
          <TopBar
            sourceName={source.display_name}
            active={topbarActive}
            focusedItem={topbarItem}
            onFocusItem={setTopbarItem}
            onExitDown={() => setZone('content')}
            onNavigate={(destination) => onNavigate(destination, { zone: 'topbar', item: destination })}
            onOpenProfiles={() => onOpenProfiles({ zone: 'topbar', item: 'profile' })}
            onOpenSearch={() => onOpenSearch({ zone: 'topbar', item: 'search' })}
            onOpenSettings={() => onOpenSettings({ zone: 'topbar', item: 'settings' })}
            onBack={() => setShowExit(true)}
          />
        }
      >
        <HomeContent
          sourceId={source.id}
          active={contentActive}
          initialFocus={contentFocus}
          // Entrar na topbar sempre em "Início" — o destino atual (FR-015).
          onExitUp={() => {
            setTopbarItem('home')
            setZone('topbar')
          }}
          onBack={() => setShowExit(true)}
          onNavigate={onNavigate}
          onOpenItem={onOpenItem}
          onOpenChannel={onOpenChannel}
          onOpenFavorites={onOpenFavorites}
          onOpenIntegrations={onOpenIntegrations}
          onPlay={startPlaying}
          statusLine={statusLine}
        />
      </AppShell>
      {playing && (
        <PlayerLayer
          itemId={playing.itemId}
          title={playing.title}
          startAtMs={playing.startAtMs}
          identity={{ title: playing.title }}
          onClose={closePlayer}
        />
      )}
      {showExit && <ExitModal onCancel={() => setShowExit(false)} />}
    </div>
  )
}
