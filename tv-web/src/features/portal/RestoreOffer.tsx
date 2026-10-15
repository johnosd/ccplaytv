import { liveQuery } from 'dexie'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { readBackupState, type BackupStateRecord } from '../../lib/backup/backupState'
import { dismissRestoreOffer, restoreFromService } from '../../lib/backup/usageRestore'
import { useT } from '../../lib/i18n/I18nProvider'
import { PortalRequestError } from '../../lib/portal/portalClient'
import type { PortalConnection } from '../../lib/portal/portalConnection'

/**
 * Feature 072 (US3): depois de re-parear, o Atualizar descobriu um backup desta TV. Pergunta uma vez
 * "Restaurar backup de <data>?" — foco inicial em "Agora não"; RETURN = Agora não. Recusar não reabre sozinho;
 * Restaurar continua em Portal & licença.
 */
export function RestoreOffer({ connection }: { connection: PortalConnection }): ReactNode {
  const t = useT()
  const [backup, setBackup] = useState<BackupStateRecord>()
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const database = connection.database

  useEffect(() => {
    const subscription = liveQuery(() => readBackupState(database)).subscribe({ next: setBackup, error: () => setBackup(undefined) })
    return () => subscription.unsubscribe()
  }, [database])

  const offer = backup?.state === 'offered' ? backup.offer : undefined
  if (!offer || offer.dismissed) return null

  const later = () => { if (!busy) void dismissRestoreOffer(database) }
  const restore = () => {
    if (busy) return
    setBusy(true); setFailure(undefined)
    restoreFromService(database, connection).catch(error => {
      setFailure(error instanceof PortalRequestError ? error.code : 'unexpected_error')
    }).finally(() => setBusy(false))
  }
  const title = t('portal.restoreTitle', { date: new Date(offer.createdAt).toLocaleDateString() })
  return <Modal ariaLabel={title} onBack={later} onDirection={direction => {
    if (direction === 'left') setIndex(0)
    if (direction === 'right') setIndex(1)
  }} onSelect={() => (index === 0 ? later() : restore())}>
    <p className="modal-title">{title}</p>
    <p className="modal-description">{t('portal.restoreText', { favorites: offer.counts.favorites,
      history: offer.counts.history, progress: offer.counts.progress })}</p>
    {failure && <p className="modal-description" role="alert">{t('portal.backup.failed', { code: failure })}</p>}
    <div className="modal-actions">
      <Button variant="secondary" focused={index === 0} onSelect={later}>{t('portal.restoreLater')}</Button>
      <Button variant="accent" focused={index === 1} loading={busy} onSelect={restore}>{t('portal.restoreNow')}</Button>
    </div>
  </Modal>
}
