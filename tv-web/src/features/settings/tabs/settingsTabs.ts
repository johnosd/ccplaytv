import { AccessibilityTab } from './AccessibilityTab'
import { IntegrationsTab } from './IntegrationsTab'
import { PrivacyTab } from './PrivacyTab'
import { PlayerTab } from './PlayerTab'
import { AboutTab } from './SimpleTabs'
import { ParentalTab } from './ParentalTab'
import { SourcesTab } from './SourcesTab'
import type { SettingsTabDefinition } from './settingsTab'

/**
 * Registro das abas de Configurações, na ordem do DS (FR-022). Aba nova =
 * um módulo em `tabs/` (componente `SettingsTabProps` que expõe o
 * `SettingsTabHandle`) + uma linha aqui + o id em `SettingsTab` + a chave
 * `settings.tab.<id>` nos três catálogos — a `SettingsScreen` não muda
 * (item 63 do backlog).
 */
export const SETTINGS_TABS: SettingsTabDefinition[] = [
  { id: 'integrations', labelKey: 'settings.tab.integrations', icon: 'device', Panel: IntegrationsTab },
  { id: 'sources', labelKey: 'settings.tab.sources', icon: 'live', Panel: SourcesTab },
  { id: 'player', labelKey: 'settings.tab.player', icon: 'play', Panel: PlayerTab },
  { id: 'accessibility', labelKey: 'settings.tab.accessibility', icon: 'settings', Panel: AccessibilityTab },
  { id: 'parental', labelKey: 'settings.tab.parental', icon: 'lock', Panel: ParentalTab },
  // Feature 036 (D-008): antes de "Sobre & créditos", o rodapé informativo.
  { id: 'privacy', labelKey: 'settings.tab.privacy', icon: 'history', Panel: PrivacyTab },
  { id: 'about', labelKey: 'settings.tab.about', icon: 'info', Panel: AboutTab },
]
