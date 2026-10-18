import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { useT } from '../../lib/i18n'
import { api, PortalApiError, type Session } from '../api'
import { EyeIcon } from '../EyeIcon'
import { normalizeDeviceKey } from './deviceKey'
import { formatDisplayIdInput, normalizeDisplayId, typedDisplayId } from './displayId'
import { forgetDevice, readRememberedDevice, rememberDevice, type LastDeviceStorage } from './lastDevice'

/** `{}`: a sessão guardada na aba não vale mais — formulário limpo, sem mensagem de erro. */
export type StartupSession = Promise<{ session: Session } | { error: PortalApiError } | Record<never, never>>
// `localStorage` pode lançar só de ser lido (modo privado/bloqueado): sem ele a entrada funciona sem lembrar o ID.
const noStorage: LastDeviceStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
export function deviceStorage(): LastDeviceStorage {
  try { return window.localStorage } catch { return noStorage }
}

/**
 * Entrada manual (features 070/077): o último ID usado com sucesso volta preenchido e o foco vai para a chave; a chave
 * nunca é guardada nem preenchida. "Usar outra TV" esquece o ID. O ID só é gravado depois de a sessão ser obtida.
 */
export function SessionPage({ startup, onSession, ended }: { startup?: StartupSession; onSession: (session: Session) => void; ended?: boolean }) {
  const t = useT()
  const [remembered, setRemembered] = useState(() => readRememberedDevice(deviceStorage()))
  const [busy, setBusy] = useState(!!startup)
  const [error, setError] = useState<PortalApiError>()
  const [displayId, setDisplayId] = useState(() => formatDisplayIdInput(remembered ?? ''))
  const [showDeviceKey, setShowDeviceKey] = useState(false)
  const idInput = useRef<HTMLInputElement>(null)
  const keyInput = useRef<HTMLInputElement>(null)
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
  // Foco útil ao abrir (e depois de uma falha): a chave quando o ID já está preenchido, senão o ID.
  useEffect(() => {
    if (busy) return
    const target = displayId.length === 17 ? keyInput.current : idInput.current
    target?.focus()
  }, [busy, error])
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const values = new FormData(form)
    const id = normalizeDisplayId(String(values.get('displayId') ?? ''))
    const key = normalizeDeviceKey(String(values.get('deviceKey') ?? ''))
    form.reset()
    setDisplayId(formatDisplayIdInput(id))
    setShowDeviceKey(false)
    setBusy(true)
    setError(undefined)
    try {
      const session = await api.manual(id, key)
      rememberDevice(deviceStorage(), id)
      onSession(session)
    } catch (caught) { setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { setBusy(false) }
  }
  function useAnotherTv() {
    forgetDevice(deviceStorage())
    setRemembered(undefined)
    setDisplayId('')
    idInput.current?.focus()
  }
  return <section className="panel session-page" aria-labelledby="access-title">
    <h2 id="access-title">{t('accessTitle')}</h2><p>{t('accessHint')}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <div className="field"><label>{t('deviceId')}<input ref={idInput} name="displayId" value={displayId} onChange={event => setDisplayId(typedDisplayId(event.target.value))} onBlur={event => setDisplayId(formatDisplayIdInput(event.target.value))} required maxLength={17} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} disabled={busy} inputMode="text" placeholder="A0-8C-FD-19-0A-8C" aria-describedby="device-id-hint" /></label>
        <p id="device-id-hint" className="field-hint">{t('deviceIdHint')}</p></div>
      <label htmlFor="device-key">{t('deviceKey')}<span className="secret-field">
        <input ref={keyInput} id="device-key" name="deviceKey" type={showDeviceKey ? 'text' : 'password'} required maxLength={64} autoComplete="off" disabled={busy} inputMode="numeric" />
        <button type="button" className="secret-toggle" aria-label={t(showDeviceKey ? 'hideDeviceKey' : 'showDeviceKey')} aria-pressed={showDeviceKey} onClick={() => setShowDeviceKey(value => !value)} disabled={busy}>
          <EyeIcon open={showDeviceKey} />
        </button>
      </span></label>
      {ended && !error && <p role="status" className="notice is-warning">{t('sessionEnded')}</p>}
      {error && <p role="alert">{t(error.code)}</p>}
      <div className="actions session-actions">
        <button className="primary" type="submit" aria-disabled={busy}>{t(busy ? 'connecting' : 'connect')}</button>
        {remembered && <button className="ghost" type="button" onClick={useAnotherTv} disabled={busy}>{t('useAnotherTv')}</button>}
      </div>
    </form>
  </section>
}
