import { useEffect, useState } from 'react'
import { useT } from '../../lib/i18n'
import { api, PortalApiError, type BackupSummary, type Session } from '../api'
import { DeleteDialog } from '../lists/DeleteDialog'
import { useTvDataContext } from '../shell/TvDataProvider'

/**
 * Backup (feature 072, 077/US5): só data e contagens (constitution 1.12.0 (g)) e **Excluir backup** com confirmação. O
 * conteúdo (títulos, PIN, chave TMDB) nunca chega ao navegador, e excluir aqui não apaga nada na TV. Sem timer próprio:
 * relê junto da leitura compartilhada.
 */
export function BackupPage({ session }: { session: Session }) {
  const t = useT()
  const { device } = useTvDataContext()
  const [summary, setSummary] = useState<BackupSummary>()
  const [error, setError] = useState<PortalApiError>()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    let alive = true
    api.backup().then(value => { if (alive) { setSummary(value); setError(undefined) } })
      .catch(caught => { if (alive) setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) })
    return () => { alive = false }
  }, [device])

  async function remove() {
    if (busy) return
    setBusy(true); setError(undefined)
    try {
      await api.deleteBackup(session)
      setSummary({ exists: false }); setDeleted(true); setConfirming(false)
    } catch (caught) {
      setError(caught instanceof PortalApiError ? caught : new PortalApiError('network'))
    } finally { setBusy(false) }
  }

  const counts = summary?.counts
  const text = summary?.exists && summary.createdAt && counts
    ? t('backupSummary').replace('{date}', new Date(summary.createdAt).toLocaleDateString(t('lang')))
      .replace('{favorites}', String(counts.favorites)).replace('{history}', String(counts.history))
      .replace('{progress}', String(counts.progress))
    : t('backupNone')
  return <section className="panel backup-page" aria-label={t('backupTitle')}>
    {summary ? <p className="backup-summary">{text}</p> : !error && <p role="status">{t('loading')}</p>}
    <p className="library-meta">{t('backupHint')}</p>
    {deleted && <p role="status" className="notice is-success">{t('backupDeleted')}</p>}
    {error && <p role="alert">{t(error.code)}</p>}
    {summary?.exists && <div className="actions">
      <button type="button" className="small ghost danger" disabled={busy} onClick={() => setConfirming(true)}>{t('backupDelete')}</button>
    </div>}
    {confirming && <DeleteDialog name={t('backupTitle')} busy={busy} title="backupDelete" text="backupDeleteConfirm" confirm="listDeleteConfirm"
      onConfirm={() => void remove()} onCancel={() => setConfirming(false)} />}
  </section>
}
