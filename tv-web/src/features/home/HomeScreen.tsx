import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SourceOut } from '../import/importApi'
import { invalidateUserStates, type CatalogItemOut } from '../catalog/catalogApi'
import { usePrefetchProgress } from '../catalog/prefetchApi'
import { useT } from '../../lib/i18n/I18nProvider'
import { homeStatusLine } from './homeStatusLine'
import { HomeContent, type HomeContentFocus } from './HomeContent'
import { AppShell } from '../../components/AppShell'
import { TopBar } from '../shell/TopBar'
import { PlayerLayer } from '../../components/PlayerLayer'
import type { HintItem } from '../../components/HintBar'
import type { HomeFocus, TopbarDestination, TopbarItem, TopDestination } from '../../navigation/appNav'

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
  onNavigate: (destination: TopbarDestination, from: HomeFocus) => void
  /** Indicador da lista ativa na topbar (FR-017). */
  onOpenProfiles: (from: HomeFocus) => void
  /** "Mais informações" do hero, ou card de filme/série de uma rail (FR-007/FR-012). */
  onOpenItem: (item: CatalogItemOut, from: HomeFocus) => void
  /** Card de "Canais favoritos" — TV ao vivo em ★ Favoritos com o canal tocando (FR-013). */
  onOpenChannel: (channel: CatalogItemOut, from: HomeFocus) => void
  /** "Ver todos (N)"/"Filmes (N)"/"Séries (N)" — o destino em ★ Favoritos (FR-014). */
  onOpenFavorites: (destination: TopDestination, from: HomeFocus) => void
  /** Feature 042: "Editar lista" do erro de fonte no player (credencial recusada/conta expirada). */
  onEditSource?: (sourceId: string) => void
  /** RETURN sai da lista e volta aos perfis, onde a confirmação de saída existe. */
  onLeaveList: () => void
  /** Lupa da topbar (FR-035). */
  onOpenSearch: (from: HomeFocus) => void
  /** Engrenagem da topbar (FR-021). */
  onOpenSettings: (from: HomeFocus) => void
  /** Feature 038 (US6): uma atualização da lista ativa está em andamento. */
  updating?: boolean
}

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
  onEditSource,
  onOpenSearch,
  onOpenSettings,
  onLeaveList,
  updating = false,
}: HomeScreenProps): ReactNode {
  const t = useT()
  const hints: HintItem[] = [
    { keyLabel: 'OK', action: t('common.select') },
    { keyLabel: 'RETURN', action: t('common.back') },
  ]
  const queryClient = useQueryClient()

  // Feature 038 (US6): "Preparando catálogo — N de M" / "Atualizando…" /
  // "Catálogo atualizado há …". A idade anda sozinha: relê a cada minuto.
  const prefetchProgress = usePrefetchProgress()
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])
  const statusLine = homeStatusLine(
    {
      sourceId: source.id,
      updating,
      progress: prefetchProgress,
      lastSuccessfulSyncAt: source.last_successful_sync_at ? Date.parse(source.last_successful_sync_at) : null,
      now: clock,
    },
    t,
  )
  const [zone, setZone] = useState<'topbar' | 'content'>(initialFocus?.zone === 'topbar' ? 'topbar' : 'content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>(
    initialFocus?.zone === 'topbar' ? initialFocus.item : 'home',
  )
  const [playing, setPlaying] = useState<PlayingState | null>(null)
  // Feature 060 (D-004): o fundo ambiente vive na camada de fundo do shell, atrás da topbar; o conteúdo o desenha por portal.
  const [ambientHost, setAmbientHost] = useState<HTMLElement | null>(null)

  const contentFocus: HomeContentFocus | undefined =
    initialFocus && initialFocus.zone !== 'topbar' ? initialFocus : undefined

  // Com o player aberto, nenhum dos dois escopos reage
  // ao teclado nem desenha foco — mesmo padrão de `logic/foco-shell.md`.
  const topbarActive = zone === 'topbar' && !playing
  const contentActive = zone === 'content' && !playing

  function startPlaying(params: PlayingState) {
    // Guarda de sessão única (mesmo padrão de `MovieDetailScreen`/
    // `LiveScreen`) — na prática já coberta por `contentActive` desligar o
    // escopo assim que `playing` deixa de ser `null`.
    if (playing) return
    setPlaying(params)
  }

  // Feature 079 (FR-009): fechar o player é ação da pessoa — o que a releitura trouxer (ex.: o 1º "Continuar") entra na hora.
  const [userActionKey, setUserActionKey] = useState(0)

  function closePlayer() {
    setPlaying(null)
    setUserActionKey((key) => key + 1)
    // Sem isto, o hero continuaria com a leitura de quando montou — um
    // filme assistido por alguns minutos voltaria mostrando "Assistir" em
    // vez de "Continuar" (`logic/hero-home.md` §5). `invalidateUserStates`
    // cobre o prefixo `user-states` (plural, usado em lote) e
    // `history-content`; o estado do PRÓPRIO hero (favorito, via
    // `useUserState`) usa a chave singular `user-state`, invalidada à parte.
    void invalidateUserStates(queryClient)
    void queryClient.invalidateQueries({ queryKey: ['user-state'] })
    void queryClient.invalidateQueries({ queryKey: ['home-hero', source.id] })
    // Prefixo: cobre a lista e os cards com progresso do "Continuar assistindo" (feature 060, `useContinueCards`).
    void queryClient.invalidateQueries({ queryKey: ['continue-watching', source.id] })
  }

  return (
    <div className="screen home-screen">
      <AppShell
        hints={hints}
        backdrop={<div ref={setAmbientHost} className="home-ambient-host" />}
        topBar={
          <TopBar
            sourceName={source.display_name}
            active={topbarActive}
            focusedItem={topbarItem}
            onFocusItem={setTopbarItem}
            onExitDown={() => setZone('content')}
            onNavigate={(destination) => onNavigate(destination, { zone: 'topbar', item: destination })}
            onOpenRadio={() => onNavigate('radio', { zone: 'topbar', item: 'radio' })}
            onOpenProfiles={() => onOpenProfiles({ zone: 'topbar', item: 'profile' })}
            onOpenSearch={() => onOpenSearch({ zone: 'topbar', item: 'search' })}
            onOpenSettings={() => onOpenSettings({ zone: 'topbar', item: 'settings' })}
            onBack={onLeaveList}
          />
        }
      >
        <HomeContent
          sourceId={source.id}
          active={contentActive}
          initialFocus={contentFocus}
          ambientHost={ambientHost}
          // Entrar na topbar sempre em "Início" — o destino atual (FR-015).
          onExitUp={() => {
            setTopbarItem('home')
            setZone('topbar')
          }}
          onBack={onLeaveList}
          onNavigate={onNavigate}
          onOpenItem={onOpenItem}
          onOpenChannel={onOpenChannel}
          onOpenFavorites={onOpenFavorites}
          onPlay={startPlaying}
          statusLine={statusLine}
          userActionKey={userActionKey}
        />
      </AppShell>
      {playing && (
        <PlayerLayer
          itemId={playing.itemId}
          title={playing.title}
          startAtMs={playing.startAtMs}
          identity={{ title: playing.title }}
          onEditSource={onEditSource}
          onClose={closePlayer}
        />
      )}
    </div>
  )
}
