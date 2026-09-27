import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconPaths'

export interface EmptyStateAction {
  label: string
  onSelect: () => void
}

export interface EmptyStateProps {
  icon?: IconName
  title: string
  description?: string
  /** Exatamente uma ação — `EmptyState` sempre tem algo pra fazer (FR-010). */
  action: EmptyStateAction
  /** Foco de estado (ADR-009): a ação está focada — aplica `.tv-focus`. */
  focused?: boolean
}

/** Estado "nada aqui ainda", sempre com uma ação focável e ativável (feature 022, D-011). */
export function EmptyState({ icon, title, description, action, focused }: EmptyStateProps): ReactNode {
  return (
    <div className="empty-state">
      {icon && <Icon name={icon} className="empty-state-icon" />}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      <button type="button" className={`button-secondary${focused ? ' tv-focus' : ''}`} onClick={action.onSelect}>
        {action.label}
      </button>
    </div>
  )
}
