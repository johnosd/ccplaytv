import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SourceOut } from '../import/importApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { ListHomeScreen } from '../list-home/ListHomeScreen'
import { AppShell } from '../shell/AppShell'
import { TopBar } from '../shell/TopBar'
import { ExitModal } from '../shell/ExitModal'
import type { HintItem } from '../shell/HintBar'
import type { HomeFocus, TopbarItem, TopDestination } from '../../navigation/appNav'

export interface HomeScreenProps {
  /** Fonte ativa da sessão (ADR-011 §3) — o nome vai no indicador da topbar, o resto no conteúdo. */
  source: SourceOut
  /** Onde estava o foco quando a pessoa saiu daqui, restaurado ao voltar (FR-029). */
  initialFocus?: HomeFocus
  /**
   * Abrir TV ao vivo, Filmes ou Séries — por atalho do conteúdo ou pela topbar
   * (FR-016). `from` é o foco de origem, para o RETURN devolvê-lo ao mesmo lugar.
   */
  onNavigate: (destination: TopDestination, from: HomeFocus) => void
  /**
   * SELECT num item de "Continuar assistindo" — abre o detalhe do filme ou da série (FR-025 da 023).
   * Feature 026: substituído por `onOpenItem`; opcional só até o `sdd-execute` remover.
   */
  onOpenContinueWatching?: (item: CatalogItemOut, from: HomeFocus) => void
  /** Indicador da lista ativa na topbar (FR-017). */
  onOpenProfiles: (from: HomeFocus) => void
  /** Feature 026 (FR-007, FR-012): "Mais informações" do hero ou card de filme/série — abre o detalhe. */
  onOpenItem?: (item: CatalogItemOut, from: HomeFocus) => void
  /** Feature 026 (FR-013): card de "Canais favoritos" — TV ao vivo em ★ Favoritos com o canal tocando. */
  onOpenChannel?: (channel: CatalogItemOut, from: HomeFocus) => void
  /** Feature 026 (FR-014): "Ver todos (N)"/"Filmes (N)"/"Séries (N)" — o destino em ★ Favoritos. */
  onOpenFavorites?: (destination: TopDestination, from: HomeFocus) => void
  /** Feature 026 (FR-035): lupa da topbar. */
  onOpenSearch?: (from: HomeFocus) => void
  /** Feature 026 (FR-021): engrenagem da topbar. */
  onOpenSettings?: (from: HomeFocus) => void
}

const HINTS: HintItem[] = [
  { keyLabel: 'OK', action: 'Selecionar' },
  { keyLabel: 'RETURN', action: 'Sair' },
]

/**
 * Início (feature 023, D-002/D-004 do plan.md): moldura do app — topbar,
 * banner offline e barra de teclas — em volta do conteúdo provisório do hub
 * da lista (`ListHomeScreen`, que a Onda 5 troca pela Home definitiva).
 *
 * Dois escopos de teclado, um ativo por vez (`logic/foco-shell.md`): `content`
 * e `topbar`. Cada um só reage e só desenha foco quando ativo; o estado do
 * outro fica guardado, e é isso que faz DOWN devolver o foco ao mesmo item de
 * onde ele saiu. RETURN, em qualquer escopo, abre o modal de saída — Início é
 * a base da navegação (ADR-011 §3).
 */
export function HomeScreen({ source, initialFocus, onNavigate, onOpenContinueWatching, onOpenProfiles }: HomeScreenProps): ReactNode {
  const [zone, setZone] = useState<'topbar' | 'content'>(initialFocus?.zone === 'topbar' ? 'topbar' : 'content')
  const [topbarItem, setTopbarItem] = useState<TopbarItem>(initialFocus?.zone === 'topbar' ? initialFocus.item : 'home')
  const [showExit, setShowExit] = useState(false)

  const contentFocus = initialFocus && initialFocus.zone !== 'topbar' ? initialFocus : undefined
  // Com o modal de saída aberto nenhum escopo reage ao teclado: o `Modal`
  // (captura) já vence, e assim a topbar — que, ativa, também registra em
  // captura para ser dona da tecla que trata (`logic/foco-shell.md`) — nunca
  // disputa a mesma tecla com ele.
  const topbarActive = zone === 'topbar' && !showExit
  const contentActive = zone === 'content' && !showExit

  return (
    <>
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
            onBack={() => setShowExit(true)}
          />
        }
      >
        <ListHomeScreen
          source={source}
          active={contentActive}
          initialFocus={contentFocus}
          // Entrar na topbar sempre em "Início" — o destino atual (FR-015).
          onExitUp={() => {
            setTopbarItem('home')
            setZone('topbar')
          }}
          onSelect={(destination) => onNavigate(destination, { zone: 'shortcuts', destination })}
          onOpenContinueWatching={(item) => onOpenContinueWatching?.(item, { zone: 'continue', itemId: item.id })}
          onBack={() => setShowExit(true)}
        />
      </AppShell>
      {showExit && <ExitModal onCancel={() => setShowExit(false)} />}
    </>
  )
}
