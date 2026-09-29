import type { ReactNode } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { getComingSoon } from '../../lib/comingSoon'

const TAB_INFO = {
  player: { label: 'Player & reprodução', id: 'settings-player' },
  parental: { label: 'Perfis & parental', id: 'settings-parental' },
} as const

export interface ComingSoonPanelProps {
  tab: keyof typeof TAB_INFO
  focused: boolean
  /** "Voltar às abas" — devolve o foco à coluna de abas (FR-031). */
  onBack: () => void
}

/**
 * Aba ainda não construída (feature 026, FR-031): cabeçalho real + estado
 * "Em breve" honesto, sempre com um elemento focável — nunca dado fictício
 * (chave mascarada, "CONECTADO", PIN…).
 */
export function ComingSoonPanel({ tab, focused, onBack }: ComingSoonPanelProps): ReactNode {
  const info = TAB_INFO[tab]
  const { message } = getComingSoon(info.id)

  return (
    <EmptyState
      title={info.label}
      description={`Em breve — ${message}`}
      action={{ label: 'Voltar às abas', onSelect: onBack }}
      focused={focused}
    />
  )
}
