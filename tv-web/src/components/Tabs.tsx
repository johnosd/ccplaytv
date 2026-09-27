import type { ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  items: TabItem[]
  activeId: string
  onSelect: (id: string) => void
}

/**
 * Seções irmãs (ex.: Episódios/Detalhes/Elenco) — puramente controlado,
 * sem estado interno (feature 022, D-005 do plan.md). Navegação por seta
 * fica de quem usa; este componente só desenha e reporta ativação —
 * mudar de conteúdo só por SELECT, nunca só por mover o foco (FR-022).
 */
export function Tabs({ items, activeId, onSelect }: TabsProps): ReactNode {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          className={`tabs-item${item.id === activeId ? ' tabs-item-active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
