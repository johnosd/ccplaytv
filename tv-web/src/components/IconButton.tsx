import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export interface IconButtonProps {
  icon: IconName
  /** Obrigatório — um botão só de ícone sempre precisa de nome acessível (D-003). */
  label: string
  onSelect: () => void
  disabled?: boolean
  /** Foco de estado (padrão das telas de catálogo, ADR-009) — aplica `.tv-focus`. */
  focused?: boolean
}

/** Botão só de ícone, área mínima 52×52 (feature 022, D-003 do plan.md). */
export function IconButton({ icon, label, onSelect, disabled, focused }: IconButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={`icon-button${disabled ? ' is-hard-disabled' : ''}${focused ? ' tv-focus' : ''}`}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return
        onSelect()
      }}
    >
      <Icon name={icon} label={label} />
    </button>
  )
}
