import { useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { api, newOperationId, PortalApiError, type Session } from './api'
export function ConfigurationManager({ session, sourceId, revision, fresh, pending, onSent }: {
  session: Session; sourceId: string; revision: number; fresh: boolean; pending: boolean; onSent(): Promise<void>
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PortalApiError>()
  const request = useRef<{ id: string; revision: number } | undefined>(undefined)
  async function resend() {
    if (busy || !fresh || pending) return
    request.current ??= { id: newOperationId(), revision }
    setBusy(true); setError(undefined)
    try { await api.resend(session, sourceId, request.current.revision, request.current.id); request.current = undefined; await onSent() }
    catch (caught) { const failure = caught instanceof PortalApiError ? caught : new PortalApiError('network'); setError(failure); if (failure.code !== 'network') request.current = undefined }
    finally { setBusy(false) }
  }
  const hintId = 'resend-hint-' + sourceId
  return <div className="configuration-resend">
    <p id={hintId} className="visually-hidden">{t('resendHint')}</p>{error && <p role="alert">{t(error.code)}</p>}
    <button onClick={() => void resend()} disabled={!fresh || pending} aria-disabled={busy} aria-describedby={hintId} title={t('resendHint')}>{t(busy ? 'sending' : request.current ? 'retry' : 'resend')}</button>
  </div>
}
