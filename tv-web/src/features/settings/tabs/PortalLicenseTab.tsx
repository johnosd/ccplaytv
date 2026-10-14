import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import { PortalLicensePanel, PORTAL_ACTION_COUNT, type PortalPanelHandle } from '../PortalLicensePanel'
import type { SettingsTabProps } from './settingsTab'
export function PortalLicenseTab({ focused, exitToTabs, goToTopbar, handleRef }: SettingsTabProps) {
  const [row, setRow] = useState(0)
  const panel = useRef<PortalPanelHandle>(null)
  useEffect(() => {
    if (focused) document.querySelector('.portal-license-panel .tv-focus')?.scrollIntoView?.({ block: 'nearest' })
  }, [row, focused])
  useImperativeHandle(handleRef, () => ({
    onEnter: () => setRow(0),
    onDirection: direction => {
      if (direction === 'left') exitToTabs()
      if (direction === 'up') { if (row === 0) goToTopbar(); else setRow(row - 1) }
      if (direction === 'down') setRow(clamp(row + 1, 0, PORTAL_ACTION_COUNT - 1))
    },
    onSelect: () => panel.current?.activate(row),
  }))
  return <PortalLicensePanel focusedAction={focused ? row : undefined} handleRef={panel} onActionFocus={setRow} />
}
