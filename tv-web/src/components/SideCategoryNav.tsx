import type { Ref, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export interface SideCategoryNavEntry {
  id: string
  label: string
  icon?: IconName
  count?: number
  pinned?: boolean
  /** Só relevante com `pinned: true`. Padrão `true` (idêntico ao comportamento anterior à feature 024) — `false` some com o selo ★ desta entrada (ex.: "Todos", que é fixa mas não é uma preferência pessoal). */
  pinnedBadge?: boolean
}

export interface SideCategoryNavProps {
  entries: SideCategoryNavEntry[]
  selectedId: string
  /** Entrada com o foco de estado (ADR-009) — aplica `.tv-focus`; distinta da selecionada. */
  focusedId?: string
  onSelect: (id: string) => void
  /** Ref do botão da entrada focada (feature 024) — para `useScrollFocusedIntoView` trazê-la pra dentro da área visível numa trilha longa. */
  focusedRef?: Ref<HTMLButtonElement>
}

/**
 * Lista lateral de categorias, componente burro (feature 022, D-009 do
 * plan.md) — não conhece o significado de nenhuma entrada específica
 * (favorito/histórico/categoria real). Entradas `pinned` ficam sempre no
 * topo, na ordem em que vierem (FR-021) — partição explícita, nunca
 * `.sort()`, que não garante ordem relativa estável para chaves iguais.
 */
export function SideCategoryNav({ entries, selectedId, focusedId, onSelect, focusedRef }: SideCategoryNavProps): ReactNode {
  const ordered = [...entries.filter((entry) => entry.pinned), ...entries.filter((entry) => !entry.pinned)]

  return (
    <ul className="side-category-nav">
      {ordered.map((entry) => {
        const isFocused = entry.id === focusedId
        return (
          <li key={entry.id}>
            <button
              ref={isFocused ? focusedRef : undefined}
              type="button"
              className={`side-category-nav-item${entry.id === selectedId ? ' is-selected' : ''}${isFocused ? ' tv-focus' : ''}`}
              onClick={() => onSelect(entry.id)}
            >
              {entry.icon && <Icon name={entry.icon} />}
              <span className="side-category-nav-label">{entry.label}</span>
              {entry.pinned && entry.pinnedBadge !== false && (
                <span className="side-category-nav-pinned-badge" aria-hidden="true">
                  ★
                </span>
              )}
              {entry.count !== undefined && <span className="side-category-nav-count">{entry.count}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
