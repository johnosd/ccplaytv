import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { useT } from '../lib/i18n'
import { api, newRecoveryId, PortalApiError, type RecoverySession } from './api'
export type StartupRecovery = Promise<{ session: RecoverySession } | { error: PortalApiError }>
export function RecoveryPage({ startup, onBack }: { startup?: StartupRecovery; onBack(): void }) {
  const t = useT()
  const [session, setSession] = useState<RecoverySession>()
  const [error, setError] = useState<PortalApiError>()
  const [busy, setBusy] = useState(!!startup)
  const [result, setResult] = useState<string>()
  const [now, setNow] = useState(Date.now)
  const request = useRef<{ id: string; code: string } | undefined>(undefined)
  const running = useRef(false)
  useEffect(() => {
    let live = true
    startup?.then(value => { if (live) { setBusy(false); if ('session' in value) setSession(value.session); else setError(value.error) } })
    return () => { live = false; request.current = undefined }
  }, [startup])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const expired = session ? now >= Date.parse(session.expiresAt) : false
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || running.current || expired) return
    const form = event.currentTarget
    if (!request.current) request.current = { id: newRecoveryId(), code: String(new FormData(form).get('code') ?? '').trim() }
    form.reset()
    running.current = true; setBusy(true); setError(undefined)
    try {
      const value = await api.recover(session, request.current.code, request.current.id)
      setResult(value.state)
      if (value.state === 'ready') request.current = undefined
    } catch (caught) {
      const failure = caught instanceof PortalApiError ? caught : new PortalApiError('network')
      setError(failure)
      if (failure.code !== 'network') request.current = undefined
    } finally { running.current = false; setBusy(false) }
  }
  return <section className="panel" aria-labelledby="recovery-title">
    <h2 id="recovery-title">{t('recoveryTitle')}</h2><p>{t('recoveryHint')}</p>
    {error && <p role="alert">{t(error.code)}</p>}
    {session && <><p>{t('destination')}: <strong>{session.deviceId}</strong></p>
      <p>{t('recoveryExpiry')}: <time dateTime={session.expiresAt}>{new Date(session.expiresAt).toLocaleString()}</time></p>
      {expired && <p role="alert">{t('recoveryExpired')}</p>}
      {result && <p role="status">{t(result === 'ready' ? 'recoveryReady' : 'recoveryPending')}</p>}
      {result !== 'ready' && !expired && <form onSubmit={submit} aria-busy={busy}>
        <label>{t('recoveryCode')}<input name="code" type="password" required={!request.current} maxLength={64} autoComplete="off" disabled={busy || !!request.current} /></label>
        {!request.current && <label className="checkbox"><input name="destinationConfirmed" type="checkbox" required disabled={busy} />{t('recoveryConfirmDestination')}</label>}
        {request.current && <p role="status">{t('recoveryRetry')}</p>}
        <button type="submit" className="primary" aria-disabled={busy}>{t(busy ? 'sending' : request.current ? 'retry' : 'recoveryConfirm')}</button>
      </form>}
    </>}
    {busy && !session && <p role="status">{t('connecting')}</p>}
    <button onClick={onBack}>{t('back')}</button>
  </section>
}
