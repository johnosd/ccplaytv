import { ParentalTab } from '../tabs/ParentalTab'
import { PrivacyTab } from '../tabs/PrivacyTab'
import type { ListSettingsTabDefinition } from '../tabs/settingsTab'
import { AccountTab } from './AccountTab'
import { EpgTab } from './EpgTab'

/**
 * Abas de Configurações da lista, na ordem da FR-003 da feature 067 (`logic/navegacao-lista.md` §3). As abas de
 * categorias e de histórico são as mesmas que existiam nas Configurações globais, agora aplicadas à lista da tela
 * (reaproveitadas no lugar — D-012).
 */
export const LIST_SETTINGS_TABS: ListSettingsTabDefinition[] = [
  { id: 'account', labelKey: 'listSettings.tab.account', icon: 'live', Panel: AccountTab },
  { id: 'epg', labelKey: 'listSettings.tab.epg', icon: 'guide', Panel: EpgTab },
  { id: 'parental', labelKey: 'listSettings.tab.parental', icon: 'lock', Panel: ParentalTab },
  { id: 'history', labelKey: 'listSettings.tab.history', icon: 'history', Panel: PrivacyTab },
]
