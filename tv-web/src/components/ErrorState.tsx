import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export interface ErrorStateAction {
  label: string
  onSelect: () => void
}

export interface ErrorStateProps {
  icon?: IconName
  title: string
  description?: string
  /** Código curto opcional (padrão Spec V14 §45, ex. `NET-01`), exibido discreto (FR-012). */
  code?: string
  /** 1 ou 2 ações — nunca 0, nunca 3+ (FR-011). */
  actions: [ErrorStateAction] | [ErrorStateAction, ErrorStateAction]
}

/** Estado de erro, sempre com 1-2 ações focáveis e ativáveis (feature 022, D-011). */
export function ErrorState({ icon, title, description, code, actions }: ErrorStateProps): ReactNode {
  return (
    <div className="error-state">
      {icon && <Icon name={icon} className="error-state-icon" />}
      <p className="error-state-title">{title}</p>
      {description && <p className="error-state-description">{description}</p>}
      {code && (
        <span data-testid="error-state-code" className="error-state-code">
          {code}
        </span>
      )}
      <div className="error-state-actions">
        {actions.map((action) => (
          <button key={action.label} type="button" className="button-secondary" onClick={action.onSelect}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
