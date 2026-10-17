import { PortalLicenseTab } from './PortalLicenseTab'
import { AccessibilityTab } from './AccessibilityTab'
import { BackupTab } from './BackupTab'
import { IntegrationsTab } from './IntegrationsTab'
import { PlayerTab } from './PlayerTab'
import { AboutTab } from './SimpleTabs'
import { SourcesTab } from './SourcesTab'
import type { SettingsTabDefinition } from './settingsTab'
import { portalSurfacesVisible } from '../../../lib/portal/portalRuntime'

/**
 * Registro das abas de Configurações, na ordem do DS (FR-022). Só o que vale para o app todo desde a feature 067
 * (FR-015): Categorias & parental e Privacidade viraram abas de Configurações da lista (`list/listSettingsTabs.ts`). Aba nova =
 * um módulo em `tabs/` (componente `SettingsTabProps` que expõe o
 * `SettingsTabHandle`) + uma linha aqui + o id em `SettingsTab` + a chave
 * `settings.tab.<id>` nos três catálogos — a `SettingsScreen` não muda
 * (item 63 do backlog).
 */
export const SETTINGS_TABS: SettingsTabDefinition[] = settingsTabsFor(portalSurfacesVisible())

/** As abas do portal (Portal & licença, Backup) só existem quando o build tem portal (078, `portalSurfacesVisible`). */
export function settingsTabsFor(withPortal: boolean): SettingsTabDefinition[] {
  const tabs: SettingsTabDefinition[] = [
    { id: 'integrations', labelKey: 'settings.tab.integrations', icon: 'device', Panel: IntegrationsTab },
    { id: 'sources', labelKey: 'settings.tab.sources', icon: 'live', Panel: SourcesTab },
    { id: 'player', labelKey: 'settings.tab.player', icon: 'play', Panel: PlayerTab },
    { id: 'accessibility', labelKey: 'settings.tab.accessibility', icon: 'settings', Panel: AccessibilityTab },
    { id: 'about', labelKey: 'settings.tab.about', icon: 'info', Panel: AboutTab },
    { id: 'portal', labelKey: 'portal.title', icon: 'device', Panel: PortalLicenseTab },
    { id: 'backup', labelKey: 'settings.tab.backup', icon: 'history', Panel: BackupTab },
  ]
  return withPortal ? tabs : tabs.filter((tab) => tab.id !== 'portal' && tab.id !== 'backup')
}
