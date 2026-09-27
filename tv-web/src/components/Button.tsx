import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent'

export interface ButtonProps {
  variant: ButtonVariant
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  onSelect: () => void
  children: ReactNode
}

/**
 * Ação curta com 4 variantes visuais (feature 022, D-002 do plan.md).
 * `<button>` real — ativa por Enter/click nativos, convive com o foco de
 * estado (`.tv-focus`) igual a qualquer `<button>` cru já usado nas telas
 * atuais. `loading` nunca usa `disabled` real (manteria a semântica de
 * foco), só ignora o clique e sinaliza `aria-busy` — nunca mostra número.
 */
export function Button({ variant, icon, loading, disabled, onSelect, children }: ButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={`button-${variant}${disabled ? ' is-hard-disabled' : ''}`}
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (loading || disabled) return
        onSelect()
      }}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}
