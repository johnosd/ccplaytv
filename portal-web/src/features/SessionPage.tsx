import { useEffect, useState, type SubmitEvent } from 'react'
import { useT } from '../lib/i18n'
import { api, PortalApiError, type Session } from './api'
import { EyeIcon } from './EyeIcon'

/** `{}`: a sessão guardada na aba não vale mais — formulário limpo, sem mensagem de erro. */
export type StartupSession = Promise<{ session: Session } | { error: PortalApiError } | Record<never, never>>
export function normalizeDisplayId(value: string) {
  const compact = value.trim().replace(/[:.-]/g, '').toUpperCase()
  return /^[0-9A-F]{12}$/.test(compact) ? compact.match(/../g)!.join(':') : value.trim()
}
export function formatDisplayIdInput(value: string) {
  const compact = value.replace(/[^0-9A-F]/gi, '').slice(0, 12).toUpperCase()
  return compact.match(/../g)?.join('-') ?? compact
}
export function SessionPage({ startup, onSession }: { startup?: StartupSession; onSession: (session: Session) => void }) {
  const t = useT()
  const [busy, setBusy] = useState(!!startup)
  const [error, setError] = useState<PortalApiError>()
  const [displayId, setDisplayId] = useState('')
  const [showDeviceKey, setShowDeviceKey] = useState(false)
  useEffect(() => {
    let live = true
    startup?.then(result => {
      if (!live) return
      setBusy(false)
      if ('session' in result) onSession(result.session)
      else if ('error' in result) setError(result.error)
    })
    return () => { live = false }
  }, [startup, onSession])
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const id = normalizeDisplayId(String(values.get('displayId') ?? ''))
    const key = String(values.get('deviceKey') ?? '').trim()
    form.reset()
    setDisplayId('')
    setShowDeviceKey(false)
    setBusy(true)
    setError(undefined)
    try { onSession(await api.manual(id, key)) }
    catch (caught) { setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { setBusy(false) }
  }
  return <section className="panel" aria-labelledby="access-title">
    <h2 id="access-title">{t('accessTitle')}</h2><p>{t('accessHint')}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <div className="field"><label>{t('deviceId')}<input name="displayId" value={displayId} onChange={event => setDisplayId(formatDisplayIdInput(event.target.value))} required maxLength={17} autoComplete="off" disabled={busy} inputMode="text" placeholder="A0-8C-FD-19-0A-8C" aria-describedby="device-id-hint" /></label>
        <p id="device-id-hint" className="field-hint">{t('deviceIdHint')}</p></div>
      <label htmlFor="device-key">{t('deviceKey')}<span className="secret-field">
        <input id="device-key" name="deviceKey" type={showDeviceKey ? 'text' : 'password'} required maxLength={64} autoComplete="off" disabled={busy} inputMode="numeric" />
        <button type="button" className="secret-toggle" aria-label={t(showDeviceKey ? 'hideDeviceKey' : 'showDeviceKey')} aria-pressed={showDeviceKey} onClick={() => setShowDeviceKey(value => !value)} disabled={busy}>
          <EyeIcon open={showDeviceKey} />
        </button>
      </span></label>
      {error && <p role="alert">{t(error.code)}</p>}
      <button className="primary" type="submit" aria-disabled={busy}>{t(busy ? 'connecting' : 'connect')}</button>
    </form>
  </section>
}
