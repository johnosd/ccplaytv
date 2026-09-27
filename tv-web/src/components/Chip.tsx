import type { ReactNode } from 'react'

export interface ChipProps {
  selected: boolean
  children: ReactNode
  onSelect?: () => void
}

/**
 * Seleção curta (feature 022, D-004 do plan.md). `selected` nunca depende
 * só de cor: soma um glifo de confirmação (`✓` — nenhum dos 17 ícones da
 * feature 021 cobre "check", e um ícone novo está fora de escopo desta
 * feature) mais a borda mais grossa como sinais adicionais (FR-026).
 */
export function Chip({ selected, children, onSelect }: ChipProps): ReactNode {
  return (
    <button
      type="button"
      className={`chip${selected ? ' chip-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {selected && (
        <span aria-hidden="true" className="chip-check">
          ✓
        </span>
      )}
      {children}
    </button>
  )
}
