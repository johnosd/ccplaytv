import { useRef, useState, type SubmitEvent } from 'react'
import { useT } from '../lib/i18n'
import { newOperationId, PortalApiError, type ConfigurationInput, type Source } from './api'

export function SourceForm({ source, saved, onSubmit, onCancel }: {
  source?: Source; saved: boolean; onSubmit: (input: ConfigurationInput, operationId: string) => Promise<void>; onCancel: () => void
}) {
  const t = useT()
  const [kind, setKind] = useState<Source['type']>(source?.type ?? 'provider_credentials')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PortalApiError>()
  const [uncertain, setUncertain] = useState(false)
  const request = useRef<{ operationId: string; input: ConfigurationInput } | null>(null)
  const requireSecrets = !source || !saved
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    if (!request.current) {
      const values = new FormData(form)
      const input: ConfigurationInput = { type: kind, displayName: String(values.get('displayName') ?? '').trim() }
      for (const key of ['providerDns', 'providerUsername', 'providerPassword', 'm3uUrl', 'epgManualUrl'] as const) {
        const value = String(values.get(key) ?? '')
        if (value.trim()) input[key] = value
      }
      const offset = String(values.get('epgOffsetHours') ?? '')
      if (offset.trim()) input.epgOffsetHours = Number(offset)
      if (values.get('epgDisabled')) input.epgDisabled = values.get('epgDisabled') === 'true'
      input.clearFields = ['epgManualUrl', 'epgOffsetHours'].filter(key => values.get('clear-' + key) === 'on')
      request.current = { operationId: newOperationId(), input }
    }
    setBusy(true)
    setError(undefined)
    try {
      await onSubmit(request.current.input, request.current.operationId)
      request.current = null
      form.reset()
    } catch (caught) {
      const failure = caught instanceof PortalApiError ? caught : new PortalApiError('network')
      setError(failure)
      if (failure.code === 'network') setUncertain(true)
      else { request.current = null; setUncertain(false) }
    } finally { setBusy(false) }
  }
  return <section className="panel" aria-labelledby="form-title">
    <h2 id="form-title">{t(source ? 'edit' : 'add')}</h2>
    {source && <p>{t(saved ? 'preserve' : 'localOnly')}</p>}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || uncertain}>
        <label>{t('name')}<input name="displayName" required maxLength={120} defaultValue={source?.displayName ?? ''} autoComplete="off" /></label>
        <label>{t('kind')}<select value={kind} onChange={e => setKind(e.target.value as Source['type'])} disabled={!!source}>
          <option value="provider_credentials">{t('xtream')}</option><option value="m3u_url">{t('m3u')}</option>
        </select></label>
        {kind === 'provider_credentials' ? <>
          <label>{t('dns')}<input name="providerDns" type="password" inputMode="url" required={requireSecrets} maxLength={4096} autoComplete="off" /></label>
          <label>{t('username')}<input name="providerUsername" type="password" required={requireSecrets} maxLength={1024} autoComplete="off" /></label>
          <label>{t('password')}<input name="providerPassword" type="password" required={requireSecrets} maxLength={1024} autoComplete="off" /></label>
        </> : <label>{t('url')}<input name="m3uUrl" type="password" inputMode="url" required={requireSecrets} maxLength={4096} autoComplete="off" /></label>}
        <label>{t('epgUrl')}<input name="epgManualUrl" type="password" inputMode="url" maxLength={4096} autoComplete="off" /></label>
        <label>{t('epgOffset')}<input name="epgOffsetHours" type="number" min={-12} max={12} step={1} /></label>
        <label className="checkbox"><input name="clear-epgManualUrl" type="checkbox" />{t('clearEpg')}</label>
        <label className="checkbox"><input name="clear-epgOffsetHours" type="checkbox" />{t('clearOffset')}</label>
        <label>{t('epgDisabled')}<select name="epgDisabled" defaultValue="">
          <option value="">—</option><option value="true">{t('yes')}</option><option value="false">{t('no')}</option>
        </select></label>
      </fieldset>
      {error && <p role="alert">{t(uncertain ? 'uncertain' : error.code)}</p>}
      <div className="actions">
        <button className="primary" type="submit" aria-disabled={busy}>{t(busy ? 'sending' : uncertain ? 'retry' : 'save')}</button>
        <button type="button" disabled={busy} onClick={() => { request.current = null; formSafeReset(); onCancel() }}>{t('cancel')}</button>
      </div>
    </form>
  </section>
  function formSafeReset() { setError(undefined); setUncertain(false) }
}
