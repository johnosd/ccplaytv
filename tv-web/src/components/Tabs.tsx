import type { ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
  /** Aba que ainda não faz nada além de anunciar "Em breve" (feature 025, D-011) — continua focável e clicável. */
  softDisabled?: boolean
}

export interface TabsProps {
  items: TabItem[]
  activeId: string
  /** Aba com o foco de estado (ADR-009) — aplica `.tv-focus`; distinta da ativa. */
  focusedId?: string
  onSelect: (id: string) => void
}

/**
 * Seções irmãs (ex.: Episódios/Detalhes/Elenco) — puramente controlado,
 * sem estado interno (feature 022, D-005 do plan.md). Navegação por seta
 * fica de quem usa; este componente só desenha e reporta ativação —
 * mudar de conteúdo só por SELECT, nunca só por mover o foco (FR-022).
 */
export function Tabs({ items, activeId, focusedId, onSelect }: TabsProps): ReactNode {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          className={`tabs-item${item.id === activeId ? ' tabs-item-active' : ''}${item.id === focusedId ? ' tv-focus' : ''}${item.softDisabled ? ' is-soft-disabled' : ''}`}
          // Achado real (feature 028, FR-016): aba soft disabled sem sinal estático pra tecnologia assistiva.
          aria-disabled={item.softDisabled ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
