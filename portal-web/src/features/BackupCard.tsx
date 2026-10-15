import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { api, PortalApiError, type BackupSummary, type Session } from './api'

/**
 * Feature 072: backup dos dados de uso desta TV no painel — só data e contagens (constitution 1.12.0 (g)) e o botão
 * de apagar. O conteúdo (títulos, PIN, chave TMDB) nunca chega ao navegador.
 */
export function BackupCard({ session }: { session: Session }) {
  const t = useT()
  const [summary, setSummary] = useState<BackupSummary>()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let alive = true
    api.backup().then(value => { if (alive) setSummary(value) }).catch(() => { if (alive) setSummary({ exists: false }) })
    return () => { alive = false }
  }, [])
  useEffect(() => { if (confirming) dialog.current?.showModal?.() }, [confirming])

  async function remove() {
    if (busy) return
    setBusy(true)
    try {
      await api.deleteBackup(session)
      setSummary({ exists: false }); setMessage(t('backupDeleted'))
    } catch (error) {
      setMessage(t(error instanceof PortalApiError ? error.code : 'network'))
    } finally { setBusy(false); setConfirming(false) }
  }

  const counts = summary?.counts
  const text = summary?.exists && summary.createdAt && counts
    ? t('backupSummary').replace('{date}', new Date(summary.createdAt).toLocaleDateString(t('lang')))
      .replace('{favorites}', String(counts.favorites)).replace('{history}', String(counts.history))
      .replace('{progress}', String(counts.progress))
    : t('backupNone')
  return <section className="panel management-backup" aria-labelledby="backup-title">
    <h2 id="backup-title">{t('backupTitle')}</h2>
    <p>{text}</p>
    <p className="library-meta">{t('backupHint')}</p>
    {message && <p role="status">{message}</p>}
    {summary?.exists && <div className="actions">
      <button className="small ghost danger" onClick={() => setConfirming(true)}>{t('backupDelete')}</button>
    </div>}
    {confirming && <dialog ref={dialog} className="panel" aria-labelledby="backup-delete-title"
      onCancel={event => { event.preventDefault(); if (!busy) setConfirming(false) }}>
      <h2 id="backup-delete-title">{t('backupDelete')}</h2><p>{t('backupDeleteConfirm')}</p>
      <div className="actions"><button className="primary" onClick={() => void remove()} aria-disabled={busy}>{t(busy ? 'sending' : 'confirm')}</button>
        <button disabled={busy} onClick={() => setConfirming(false)}>{t('cancel')}</button></div>
    </dialog>}
  </section>
}
