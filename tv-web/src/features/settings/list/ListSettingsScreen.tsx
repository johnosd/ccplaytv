import type { ReactNode } from 'react'
import type { ListSettingsFocus, ListSettingsNavigation } from '../tabs/settingsTab'

export type { ListSettingsFocus, ListSettingsTab } from '../tabs/settingsTab'

/**
 * Configurações da lista (feature 067, US1 — FR-001..FR-011): abas laterais para UMA lista cadastrada, ativa ou não,
 * sem topbar. Abrir esta tela não troca a lista ativa. Regras em
 * `sdd/specs/067-configuracoes-lista-global/logic/navegacao-lista.md`.
 *
 * STUB do sdd-plan: tipos e props são o contrato público (os testes travados os usam); o corpo é do sdd-execute.
 */
export interface ListSettingsScreenProps extends ListSettingsNavigation {
  /** A lista que esta tela configura (pode não ser a ativa). */
  sourceId: string
  /** Lista ativa da sessão — só para marcar "Lista ativa"; nada aqui a usa como alvo. */
  activeSourceId: string | null
  initialFocus?: ListSettingsFocus
  /** RETURN na base (FR-008). */
  onBack: () => void
}

export function ListSettingsScreen(props: ListSettingsScreenProps): ReactNode {
  void props
  throw new Error('not implemented')
}
