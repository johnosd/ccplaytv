import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { clamp, useRemoteNav } from '../../lib/useRemoteNav'
import type { TopbarItem, TopDestination } from '../../navigation/appNav'
import { useClock } from './clock'

export interface TopBarProps {
  /** Nome da lista ativa (indicador do perfil). Truncado com reticências por CSS — nunca empurra os outros itens. */
  sourceName: string
  /** Escopo de teclado: os handlers só existem quando `true` (D-004 do plan.md). */
  active: boolean
  /** Item em foco de estado (`.tv-focus`) — só é desenhado quando `active`. */
  focusedItem: TopbarItem
  /**
   * Destino de topo atual (feature 024, D-004 do plan.md da feature 024;
   * estendido pela feature 026, D-005, a `search`/`settings`). Padrão
   * `'home'` — idêntico ao comportamento anterior à feature 024, em que o
   * Início era sempre o atual. Recebe a marcação `topbar-item--current`/
   * `aria-current`; OK nele não faz nada.
   */
  currentItem?: 'home' | TopDestination | 'search' | 'settings'
  /** LEFT/RIGHT (linear, com clamp nas pontas). */
  onFocusItem: (item: TopbarItem) => void
  /** DOWN — devolve o foco ao conteúdo. */
  onExitDown: () => void
  /** OK em TV ao vivo / Filmes / Séries, quando não é o `currentItem`. */
  onNavigate: (destination: TopDestination) => void
  /**
   * OK em "Início" quando `currentItem` não é `'home'` (feature 024) — ex.:
   * a topbar da Live trocando de volta pro Início. Com `currentItem: 'home'`
   * (padrão), OK em "Início" não faz nada e este callback nunca é chamado.
   */
  onGoHome?: () => void
  /** OK no indicador da lista ativa — abre a tela de perfis para trocar de lista. */
  onOpenProfiles: () => void
  /**
   * OK na lupa (feature 026, D-005, FR-035). Ausente = soft disabled e OK
   * sem efeito — só acontece em testes que montam a topbar crua; o `App`
   * sempre passa os dois.
   */
  onOpenSearch?: () => void
  /** OK na engrenagem (feature 026, D-005, FR-021). Mesma regra de `onOpenSearch`. */
  onOpenSettings?: () => void
  /** RETURN. */
  onBack: () => void
}

/** Ordem de foco, igual à ordem visual (logo e relógio não são focáveis). */
const FOCUS_ORDER: TopbarItem[] = ['home', 'live', 'movies', 'series', 'profile', 'search', 'settings']

const NAV_ITEMS: { key: 'home' | TopDestination; label: string }[] = [
  { key: 'home', label: 'Início' },
  { key: 'live', label: 'TV ao vivo' },
  { key: 'movies', label: 'Filmes' },
  { key: 'series', label: 'Séries' },
]

/** Busca e Configurações (feature 026, D-005) — reais quando o callback correspondente existe. */
const ACTION_ITEMS: { key: 'search' | 'settings'; label: string; icon: 'search' | 'settings' }[] = [
  { key: 'search', label: 'Buscar', icon: 'search' },
  { key: 'settings', label: 'Configurações', icon: 'settings' },
]

function initialOf(name: string): string {
  const first = name.trim().charAt(0)
  return first ? first.toUpperCase() : '?'
}

/**
 * Topbar do Início (feature 023, FR-013..FR-019). Logo, destinos, indicador
 * da lista ativa, Busca e Configurações (reais desde a feature 026, D-005 —
 * soft disabled só quando o callback correspondente não é passado) e relógio.
 *
 * Foco é estado (ADR-009): `focusedItem` é decidido por quem monta a topbar,
 * e aqui só vira `.tv-focus`. `useRemoteNav` é chamado SEMPRE (regra dos
 * hooks) e recebe `{}` quando inativo. O clique de mouse chama o mesmo
 * handler do OK.
 *
 * Evento único por escopo (`logic/foco-shell.md`): quem está ativo é dono do
 * teclado até devolvê-lo. Enquanto ativa, a topbar registra em fase de
 * captura e para a propagação da tecla que trata (`modal: active`) — assim o
 * conteúdo do Início nunca vê o DOWN que lhe devolveu o foco. Só a ordem dos
 * `setState` não basta: no Chromium, o `setState` feito dentro de um listener
 * nativo de `keydown` é descarregado (render + efeitos) ENTRE dois listeners
 * do MESMO evento, e o escopo que acabou de ficar ativo processaria o mesmo
 * DOWN (o jsdom não reproduz — o `act` só descarrega depois de todos os
 * listeners). Inativa, nada é interceptado. Quem monta a topbar passa
 * `active={false}` com um modal aberto (saída), então o modal, registrado em
 * captura depois, é quem responde.
 */
export function TopBar({
  sourceName,
  active,
  focusedItem,
  currentItem = 'home',
  onFocusItem,
  onExitDown,
  onNavigate,
  onGoHome,
  onOpenProfiles,
  onOpenSearch,
  onOpenSettings,
  onBack,
}: TopBarProps): ReactNode {
  const clock = useClock()

  function activate(item: TopbarItem) {
    // Já está neste destino — inclui "Início" quando `currentItem` é o
    // padrão, mesmo comportamento de antes da feature 024.
    if (item === currentItem) return
    switch (item) {
      case 'home':
        onGoHome?.()
        return
      case 'live':
      case 'movies':
      case 'series':
        onNavigate(item)
        return
      case 'profile':
        onOpenProfiles()
        return
      case 'search':
        onOpenSearch?.()
        return
      case 'settings':
        onOpenSettings?.()
        return
    }
  }

  useRemoteNav(
    active
      ? {
          onDirection: (direction) => {
            if (direction === 'down') {
              onExitDown()
              return
            }
            if (direction === 'up') return
            const index = FOCUS_ORDER.indexOf(focusedItem)
            const next = FOCUS_ORDER[clamp(index + (direction === 'right' ? 1 : -1), 0, FOCUS_ORDER.length - 1)]
            if (next !== focusedItem) onFocusItem(next)
          },
          onSelect: () => activate(focusedItem),
          onBack,
        }
      : {},
    { modal: active },
  )

  function focusClass(item: TopbarItem): string {
    return active && focusedItem === item ? ' tv-focus' : ''
  }

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <span className="topbar-logo-mark" aria-hidden="true" />
        <span className="topbar-logo-word">CCPlayTV</span>
      </div>

      <nav className="topbar-nav" aria-label="Navegação principal">
        {NAV_ITEMS.map((item) => {
          const current = item.key === currentItem
          return (
            <button
              key={item.key}
              type="button"
              className={`topbar-item${current ? ' topbar-item--current' : ''}${focusClass(item.key)}`}
              aria-current={current ? 'page' : undefined}
              onClick={() => activate(item.key)}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="topbar-actions">
        <button
          type="button"
          className={`topbar-profile${focusClass('profile')}`}
          aria-label={`Lista ativa: ${sourceName}. Trocar de lista`}
          onClick={() => activate('profile')}
        >
          <span className="topbar-profile-avatar" aria-hidden="true">
            {initialOf(sourceName)}
          </span>
          <span className="topbar-profile-name" aria-hidden="true">
            {sourceName}
          </span>
        </button>

        {ACTION_ITEMS.map((item) => {
          const hasCallback = Boolean(item.key === 'search' ? onOpenSearch : onOpenSettings)
          const current = item.key === currentItem
          return (
            <button
              key={item.key}
              type="button"
              className={`icon-button${hasCallback ? '' : ' is-soft-disabled'}${current ? ' topbar-item--current' : ''}${focusClass(item.key)}`}
              aria-current={current ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => activate(item.key)}
            >
              <Icon name={item.icon} />
            </button>
          )
        })}

        <span className="topbar-clock">{clock}</span>
      </div>
    </header>
  )
}
