import { liveQuery } from 'dexie'
import { useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from 'react'
import { Button } from '../../components/Button'
import { RefreshStatusLine } from '../../components/RefreshButton'
import { backupTables, readBackupState, writeBackupState, type BackupStateRecord } from '../../lib/backup/backupState'
import { applyPendingRestores, deleteUsageBackup, restoreFromService } from '../../lib/backup/usageRestore'
import { useT } from '../../lib/i18n/I18nProvider'
import { PortalRequestError } from '../../lib/portal/portalClient'
import type { PortalConnection } from '../../lib/portal/portalConnection'
import { refreshPortal, resetPortalAgent } from '../../lib/portal/portalRuntime'
import { portalTables } from '../../lib/portal/portalTables'
import { unlinkPortal } from '../../lib/portal/unlink'
import { useRefreshAction } from '../../lib/portal/useRefreshAction'
import { PortalConfirmDialog } from './PortalConfirmDialog'

/** Fazer backup agora, Restaurar, Apagar e Desvincular (feature 072); índices 0–3 depois das ações da 069/071. */
export const BACKUP_ACTION_COUNT = 4
const LABELS = ['portal.backup.now', 'portal.backup.restore', 'portal.backup.delete', 'portal.unlink'] as const
type Dialog = 'replace' | 'restore' | 'delete' | 'unlink'
type Message = { key: Parameters<ReturnType<typeof useT>>[0]; params?: Record<string, string | number> }
export interface BackupActionsHandle { activate: (index: number) => void }

interface View { backup: BackupStateRecord; paired: boolean; pending: number }

export function PortalBackupActions({ connection, focusedIndex, handleRef, onActionFocus }: {
  connection?: PortalConnection; focusedIndex?: number; handleRef: Ref<BackupActionsHandle>; onActionFocus?: (index: number) => void
}): ReactNode {
  const t = useT()
  const refresh = useRefreshAction('backup')
  const [view, setView] = useState<View>()
  const [dialog, setDialog] = useState<Dialog>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>()
  const database = connection?.database

  useEffect(() => {
    if (!database) return
    // Abrir Portal & licença aplica pendências cuja lista já voltou (local, sem rede).
    void applyPendingRestores(database).catch(() => {})
    const subscription = liveQuery(async () => ({ backup: await readBackupState(database),
      paired: !!(await portalTables(database).device.get('device')), pending: await backupTables(database).pending.count() }))
      .subscribe({ next: setView, error: () => setView(undefined) })
    return () => subscription.unsubscribe()
  }, [database])

  const date = (value?: number) => (value ? new Date(value).toLocaleDateString() : '')
  const offer = view?.backup.offer
  const hasBackup = view?.backup.state === 'offered' || view?.backup.lastBackupAt !== undefined
  const unavailable = [!connection, !connection || !hasBackup, !connection || !hasBackup, !connection || !view?.paired]

  async function guarded(work: () => Promise<Message>) {
    setBusy(true); setMessage(undefined)
    try { setMessage(await work()) } catch (error) {
      setMessage({ key: 'portal.backup.failed', params: { code: error instanceof PortalRequestError ? error.code : 'unexpected_error' } })
    } finally { setBusy(false); setDialog(undefined) }
  }

  function activate(index: number) {
    onActionFocus?.(index)
    if (!connection || !database || busy || unavailable[index]) return
    if (index === 0) {
      if (view?.backup.state === 'offered') { setDialog('replace'); return }
      // Backup desligado (foi apagado): a pessoa pediu de novo, então volta a guardar.
      void (view?.backup.state === 'disabled' ? writeBackupState(database, { state: 'settled' }) : Promise.resolve()).then(() => refresh.run())
      return
    }
    setDialog(index === 1 ? 'restore' : index === 2 ? 'delete' : 'unlink')
  }
  useImperativeHandle(handleRef, () => ({ activate }))

  function confirm() {
    if (!connection || !database || !dialog) return
    if (dialog === 'replace') {
      setDialog(undefined)
      void writeBackupState(database, { state: 'settled', lastBackupAt: offer?.createdAt }).then(() => refresh.run())
      return
    }
    if (dialog === 'restore') {
      void guarded(async () => {
        const result = await restoreFromService(database, connection)
        return result.pending ? { key: 'portal.restoreDonePending', params: { count: result.pending } } : { key: 'portal.restoreDone' }
      })
      return
    }
    if (dialog === 'delete') { void guarded(async () => { await deleteUsageBackup(database, connection); return { key: 'portal.backup.deleted' } }); return }
    void guarded(async () => {
      // Com internet, o backup vai antes de soltar o vínculo; sem internet, desvincula mesmo assim e avisa.
      const backedUp = navigator.onLine ? (await refreshPortal('backup')).ok : false
      resetPortalAgent()
      await unlinkPortal(database)
      return { key: backedUp ? 'portal.unlinkDone' : 'portal.unlinkNoBackup' }
    })
  }

  const counts = offer?.counts
  const dialogs: Record<Dialog, [string, string, string]> = {
    replace: [t('portal.backup.replaceTitle'), t('portal.backup.replaceText', { date: date(offer?.createdAt) }), t('portal.backup.now')],
    restore: [t('portal.restoreTitle', { date: date(offer?.createdAt ?? view?.backup.lastBackupAt) }),
      t('portal.restoreText', { favorites: counts?.favorites ?? 0, history: counts?.history ?? 0, progress: counts?.progress ?? 0 }),
      t('portal.restoreNow')],
    delete: [t('portal.backup.deleteTitle'), t('portal.backup.deleteText'), t('portal.backup.delete')],
    unlink: [t('portal.unlinkTitle'), t('portal.unlinkText'), t('portal.unlink')],
  }

  return <section className="portal-backup" aria-label={t('portal.backup.title')}>
    <h3>{t('portal.backup.title')}</h3>
    {view?.backup.state === 'disabled' ? <p role="status">{t('portal.backup.disabled')}</p>
      : view?.backup.state === 'offered' && offer
        ? <p role="status">{t('portal.backup.offer', { date: date(offer.createdAt), favorites: offer.counts.favorites, history: offer.counts.history })}</p>
        : view?.backup.lastBackupAt ? <p>{t('portal.backup.last', { date: date(view.backup.lastBackupAt) })}</p>
          : <p>{t('portal.backup.none')}</p>}
    {!!view?.pending && <p>{t('portal.backup.pending', { count: view.pending })}</p>}
    <RefreshStatusLine action={refresh} scope="backup" />
    {message && <p role="status">{t(message.key, message.params)}</p>}
    <div className="portal-actions">{LABELS.map((label, index) => <Button key={label} variant="secondary"
      focused={focusedIndex === index && !dialog} softDisabled={unavailable[index]}
      loading={index === 0 ? refresh.status === 'loading' : busy && index !== 0}
      onSelect={() => activate(index)}>{t(label)}</Button>)}</div>
    {dialog && <PortalConfirmDialog title={dialogs[dialog][0]} text={dialogs[dialog][1]} confirmLabel={dialogs[dialog][2]}
      busy={busy} onCancel={() => setDialog(undefined)} onConfirm={confirm} />}
  </section>
}
