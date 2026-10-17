import type { MessageKey } from '../../lib/i18n'

/**
 * Itens de Ajustes na ordem fixa do FR-014 (feature 077, D-011). Cada item abre uma sub-tela (`view`), exceto Sair, que é
 * ação direta. A chave TMDB (US4) vem primeiro: é a operação de Ajustes que a pessoa mais usa.
 */
export interface SettingsItem { id: string; view: string; title: MessageKey; description: MessageKey }

export const SETTINGS_ITEMS: SettingsItem[] = [
  { id: 'tmdb', view: 'tmdb', title: 'settingsTmdbTitle', description: 'settingsTmdbDesc' },
  { id: 'backup', view: 'backup', title: 'settingsBackupTitle', description: 'settingsBackupDesc' },
  { id: 'code', view: 'code', title: 'settingsCodeTitle', description: 'settingsCodeDesc' },
  { id: 'recover', view: 'recover', title: 'settingsRecoverTitle', description: 'settingsRecoverDesc' },
  { id: 'help', view: 'help', title: 'settingsHelpTitle', description: 'settingsHelpDesc' },
]

/** Sair: ação direta, depois dos itens que abrem sub-telas. Mantém o ID lembrado (feature 077, D-010). */
export const LOGOUT_ITEM = { id: 'logout', title: 'settingsLogoutTitle', description: 'settingsLogoutDesc' } as const satisfies { id: string; title: MessageKey; description: MessageKey }
