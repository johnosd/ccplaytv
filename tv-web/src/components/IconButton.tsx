import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export interface IconButtonProps {
  icon: IconName
  /** Obrigatório — um botão só de ícone sempre precisa de nome acessível (D-003). */
  label: string
  onSelect: () => void
  disabled?: boolean
}

/** Botão só de ícone, área mínima 52×52 (feature 022, D-003 do plan.md). */
export function IconButton({ icon, label, onSelect, disabled }: IconButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={`icon-button${disabled ? ' is-hard-disabled' : ''}`}
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
