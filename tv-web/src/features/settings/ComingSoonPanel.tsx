import type { ReactNode } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { comingSoonToast } from '../../lib/comingSoon'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages/pt'

const TAB_INFO = {
  parental: { labelKey: 'settings.tab.parental', id: 'settings-parental' },
} as const satisfies Record<string, { labelKey: MessageKey; id: string }>

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
  const t = useT()
  const info = TAB_INFO[tab]

  return (
    <EmptyState
      title={t(info.labelKey)}
      description={comingSoonToast(info.id, t)}
      action={{ label: t('common.backToTabs'), onSelect: onBack }}
      focused={focused}
    />
  )
}
