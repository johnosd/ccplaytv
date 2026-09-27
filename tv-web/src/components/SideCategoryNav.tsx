import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export interface SideCategoryNavEntry {
  id: string
  label: string
  icon?: IconName
  count?: number
  pinned?: boolean
}

export interface SideCategoryNavProps {
  entries: SideCategoryNavEntry[]
  selectedId: string
  onSelect: (id: string) => void
}

/**
 * Lista lateral de categorias, componente burro (feature 022, D-009 do
 * plan.md) — não conhece o significado de nenhuma entrada específica
 * (favorito/histórico/categoria real). Entradas `pinned` ficam sempre no
 * topo, na ordem em que vierem (FR-021) — partição explícita, nunca
 * `.sort()`, que não garante ordem relativa estável para chaves iguais.
 */
export function SideCategoryNav({ entries, selectedId, onSelect }: SideCategoryNavProps): ReactNode {
  const ordered = [...entries.filter((entry) => entry.pinned), ...entries.filter((entry) => !entry.pinned)]

  return (
    <ul className="side-category-nav">
      {ordered.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            className={`side-category-nav-item${entry.id === selectedId ? ' is-selected' : ''}`}
            onClick={() => onSelect(entry.id)}
          >
            {entry.icon && <Icon name={entry.icon} />}
            <span className="side-category-nav-label">{entry.label}</span>
            {entry.pinned && (
              <span className="side-category-nav-pinned-badge" aria-hidden="true">
                ★
              </span>
            )}
            {entry.count !== undefined && <span className="side-category-nav-count">{entry.count}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
