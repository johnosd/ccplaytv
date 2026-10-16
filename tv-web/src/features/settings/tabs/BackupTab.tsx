import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { clamp } from '../../../lib/useRemoteNav'
import type { PortalConnection } from '../../../lib/portal/portalConnection'
import { getPortalConnection } from '../../../lib/portal/portalRuntime'
import { BACKUP_ACTION_COUNT, PortalBackupActions, type BackupActionsHandle } from '../PortalBackupActions'
import type { SettingsTabProps } from './settingsTab'

/** Aba Backup (feature 075, US4): estado do backup e as três ações da 072, logo após Portal & licença. */
export function BackupTab({ focused, exitToTabs, goToTopbar, handleRef }: SettingsTabProps) {
  const [row, setRow] = useState(0)
  const actions = useRef<BackupActionsHandle>(null)
  let connection: PortalConnection | undefined
  try { connection = getPortalConnection() } catch { /* Configuração inválida vira estado acionável. */ }
  useEffect(() => {
    if (focused) document.querySelector('.portal-backup .tv-focus')?.scrollIntoView?.({ block: 'nearest' })
  }, [row, focused])
  useImperativeHandle(handleRef, () => ({
    onEnter: () => setRow(0),
    onDirection: direction => {
      if (direction === 'left') exitToTabs()
      if (direction === 'up') { if (row === 0) goToTopbar(); else setRow(row - 1) }
      if (direction === 'down') setRow(clamp(row + 1, 0, BACKUP_ACTION_COUNT - 1))
    },
    onSelect: () => actions.current?.activate(row),
  }))
  return <PortalBackupActions connection={connection} handleRef={actions} focusedIndex={focused ? row : undefined} onActionFocus={setRow} />
}
