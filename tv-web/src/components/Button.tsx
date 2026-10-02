import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent'

export interface ButtonProps {
  variant: ButtonVariant
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  /**
   * Soft disabled (DS §11): continua focável e ativável — quem recebe o
   * `onSelect` é que explica o motivo (feature 042, FR-004: ação que depende de
   * internet, offline). O motivo também vai no nome acessível, por `children`.
   */
  softDisabled?: boolean
  /** Foco de estado (padrão das telas de catálogo, ADR-009) — aplica `.tv-focus`. */
  focused?: boolean
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
export function Button({ variant, icon, loading, disabled, softDisabled, focused, onSelect, children }: ButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={`button-${variant}${disabled ? ' is-hard-disabled' : ''}${softDisabled ? ' is-soft-disabled' : ''}${focused ? ' tv-focus' : ''}`}
      aria-busy={loading || undefined}
      aria-disabled={disabled || softDisabled || undefined}
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
