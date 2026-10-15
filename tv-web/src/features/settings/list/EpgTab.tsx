import { useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../../components/Button'
import { useT } from '../../../lib/i18n/I18nProvider'
import { SourceEpgStatus } from '../SourcesPanel'
import type { ListSettingsTabProps } from '../tabs/settingsTab'

/**
 * EPG da lista (feature 067, FR-005): o estado do EPG desta lista e um botão que abre a tela de EPG que já existe
 * (feature 030). Ao voltar, o foco fica no botão (`{ tab: 'epg', action: 'open-epg' }`, FR-009).
 */
export function EpgTab({ focused, source, navigation, exitToTabs, handleRef }: ListSettingsTabProps): ReactNode {
  const t = useT()

  useImperativeHandle(handleRef, () => ({
    onEnter: () => {},
    onDirection: (direction) => {
      if (direction === 'left') exitToTabs()
    },
    onSelect: () => navigation.onOpenEpg(source, { tab: 'epg', action: 'open-epg' }),
  }))

  return (
    <div className="list-settings-panel">
      <div className="sources-panel-info">
        <SourceEpgStatus source={source} />
        <span className="list-settings-hint">{t('listSettings.epg.hint')}</span>
      </div>
      <div className="sources-panel-actions">
        <Button variant="secondary" focused={focused} onSelect={() => navigation.onOpenEpg(source, { tab: 'epg', action: 'open-epg' })}>
          {t('listSettings.epg.open')}
        </Button>
      </div>
    </div>
  )
}
