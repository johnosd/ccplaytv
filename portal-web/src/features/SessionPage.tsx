import { useEffect, useState, type SubmitEvent } from 'react'
import { useT } from '../lib/i18n'
import { api, PortalApiError, type Session } from './api'

export type StartupSession = Promise<{ session: Session } | { error: PortalApiError }>
export function SessionPage({ startup, onSession, onRecover }: { startup?: StartupSession; onSession: (session: Session) => void; onRecover?: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState(!!startup)
  const [error, setError] = useState<PortalApiError>()
  useEffect(() => {
    let live = true
    startup?.then(result => {
      if (!live) return
      setBusy(false)
      if ('session' in result) onSession(result.session)
      else setError(result.error)
    })
    return () => { live = false }
  }, [startup, onSession])
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const id = String(values.get('deviceId') ?? '').trim()
    const key = String(values.get('deviceKey') ?? '').trim()
    form.reset()
    setBusy(true)
    setError(undefined)
    try { onSession(await api.manual(id, key)) }
    catch (caught) { setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { setBusy(false) }
  }
  return <section className="panel" aria-labelledby="access-title">
    <h2 id="access-title">{t('accessTitle')}</h2><p>{t('accessHint')}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label>{t('deviceId')}<input name="deviceId" required maxLength={128} autoComplete="off" disabled={busy} /></label>
      <label>{t('deviceKey')}<input name="deviceKey" type="password" required maxLength={1024} autoComplete="off" disabled={busy} /></label>
      {error && <p role="alert">{t(error.code)}</p>}
      <button className="primary" type="submit" aria-disabled={busy}>{t(busy ? 'connecting' : 'connect')}</button>
    </form>
    {onRecover && <button onClick={onRecover}>{t('recoveryTitle')}</button>}
  </section>
}
