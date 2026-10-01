import { AccessibilityTab } from './AccessibilityTab'
import { IntegrationsTab } from './IntegrationsTab'
import { PrivacyTab } from './PrivacyTab'
import { AboutTab, ParentalSoonTab, PlayerSoonTab } from './SimpleTabs'
import { SourcesTab } from './SourcesTab'
import type { SettingsTabDefinition } from './settingsTab'

/**
 * Registro das abas de Configurações, na ordem do DS (FR-022). Aba nova =
 * um módulo em `tabs/` (componente `SettingsTabProps` que expõe o
 * `SettingsTabHandle`) + uma linha aqui + o id em `SettingsTab` — a
 * `SettingsScreen` não muda (item 63 do backlog).
 */
export const SETTINGS_TABS: SettingsTabDefinition[] = [
  { id: 'integrations', label: 'Integrações & BYOK', icon: 'device', Panel: IntegrationsTab },
  { id: 'sources', label: 'Fontes IPTV', icon: 'live', Panel: SourcesTab },
  { id: 'player', label: 'Player & reprodução', icon: 'play', Panel: PlayerSoonTab },
  { id: 'accessibility', label: 'Acessibilidade & sistema', icon: 'settings', Panel: AccessibilityTab },
  { id: 'parental', label: 'Perfis & parental', icon: 'favorite', Panel: ParentalSoonTab },
  // Feature 036 (D-008): antes de "Sobre & créditos", o rodapé informativo.
  { id: 'privacy', label: 'Privacidade', icon: 'history', Panel: PrivacyTab },
  { id: 'about', label: 'Sobre & créditos', icon: 'info', Panel: AboutTab },
]
