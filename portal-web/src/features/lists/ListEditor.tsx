import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { useT } from '../../lib/i18n'
import { api, newOperationId, PortalApiError, type ConfigurationInput, type ConfigurationValues, type Source } from '../api'
import { EyeIcon } from '../EyeIcon'

/**
 * Adicionar/editar lista (features 070/077): uma coluna, só os campos do tipo escolhido, ≥ 16 px e a barra de ações
 * fixa no rodapé da tela (no lugar da navegação inferior, para não empilhar com o teclado virtual). Os valores salvos
 * aparecem na edição, só para a sessão da própria TV, como antes. O `operationId` é reaproveitado após falha de rede.
 */
export function ListEditor({ source, saved, onSubmit, onCancel }: {
  source?: Source; saved: boolean; onSubmit: (input: ConfigurationInput, operationId: string) => Promise<void>; onCancel: () => void
}) {
  const t = useT()
  const [kind, setKind] = useState<Source['type']>(source?.type ?? 'provider_credentials')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PortalApiError>()
  const [uncertain, setUncertain] = useState(false)
  const [savedValues, setSavedValues] = useState<ConfigurationValues>()
  const [valuesLoading, setValuesLoading] = useState(Boolean(source && saved))
  const [valuesError, setValuesError] = useState(false)
  const [valuesRetry, setValuesRetry] = useState(0)
  const [revealed, setRevealed] = useState(true)
  const request = useRef<{ operationId: string; input: ConfigurationInput } | null>(null)
  const requireSecrets = !source || !saved
  const editingSaved = Boolean(source && saved)
  useEffect(() => {
    let live = true
    if (!source || !saved) { setValuesLoading(false); setValuesError(false); return }
    setValuesLoading(true); setValuesError(false)
    void api.values(source.id).then(value => {
      if (live) { setSavedValues(value); setValuesLoading(false) }
    }).catch(() => {
      if (live) { setValuesError(true); setValuesLoading(false) }
    })
    return () => { live = false }
  }, [source?.id, saved, valuesRetry])
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
      // Sem caixas "Limpar": esvaziar um campo de EPG que tinha valor salvo é o pedido explícito para apagá-lo.
      input.clearFields = (['epgManualUrl', 'epgOffsetHours'] as const).filter(key =>
        savedValues?.[key] != null && String(savedValues[key]).trim() !== '' && !String(values.get(key) ?? '').trim())
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
  const title = <h1 data-page-title tabIndex={-1}>{t(source ? 'edit' : 'add')}</h1>
  if (editingSaved && valuesLoading) return <section className="list-editor" aria-busy="true">{title}<p role="status">{t('loading')}</p>
    <div className="editor-actions"><button type="button" onClick={onCancel}>{t('cancel')}</button></div></section>
  if (editingSaved && (valuesError || !savedValues)) return <section className="list-editor">{title}<p role="alert">{t('network')}</p>
    <div className="editor-actions"><button type="button" className="primary" onClick={() => setValuesRetry(value => value + 1)}>{t('retry')}</button>
      <button type="button" onClick={onCancel}>{t('cancel')}</button></div></section>
  const fieldType = revealed ? 'text' : 'password'
  // EPG fica recolhido; abre sozinho só quando a lista já tem algum ajuste de EPG salvo.
  const hasEpg = !!savedValues && (!!savedValues.epgManualUrl || savedValues.epgOffsetHours != null || savedValues.epgDisabled != null)
  const secretId = 'source-secret-' + (source?.id ?? 'new')
  const eye = <button type="button" className="secret-toggle" onClick={() => setRevealed(value => !value)} aria-pressed={revealed}
    aria-label={t(revealed ? 'hideValues' : 'showValues')} aria-controls={secretId}><EyeIcon open={revealed} /></button>
  return <section className="list-editor">
    {title}
    {source && <p>{t(saved ? 'savedValuesVisible' : 'localOnly')}</p>}
    <form onSubmit={submit} aria-busy={busy} id="list-editor-form">
      <fieldset disabled={busy || uncertain} className="editor-fields">
        <label>{t('name')}<input name="displayName" required maxLength={120} defaultValue={source?.displayName ?? ''} autoComplete="off" /></label>
        <fieldset className="type-toggle" disabled={!!source}><legend>{t('kind')}</legend>
          <div className="segmented">
            {(['provider_credentials', 'm3u_url'] as const).map(value => <label key={value}>
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
              <span>{t(value === 'provider_credentials' ? 'xtream' : 'm3u')}</span>
            </label>)}
          </div>
        </fieldset>
        {kind === 'provider_credentials' ? <>
          <label>{t('dns')}<input name="providerDns" type={fieldType} inputMode="url" required={requireSecrets} maxLength={4096} autoComplete="off" defaultValue={savedValues?.providerDns ?? ''} /></label>
          <label>{t('username')}<input name="providerUsername" type={fieldType} required={requireSecrets} maxLength={1024} autoComplete="off" defaultValue={savedValues?.providerUsername ?? ''} /></label>
          <div className="field"><label htmlFor={secretId}>{t('password')}</label><span className="secret-field">
            <input id={secretId} name="providerPassword" type={fieldType} required={requireSecrets} maxLength={1024} autoComplete="off" defaultValue={savedValues?.providerPassword ?? ''} />{eye}</span></div>
        </> : <div className="field"><label htmlFor={secretId}>{t('url')}</label><span className="secret-field">
          <input id={secretId} name="m3uUrl" type={fieldType} inputMode="url" required={requireSecrets} maxLength={4096} autoComplete="off" defaultValue={savedValues?.m3uUrl ?? ''} />{eye}</span></div>}
        <details className="form-section" open={hasEpg}><summary>{t('epgSection')}</summary>
          <div className="editor-fields">
            <label>{t('epgUrl')}<input name="epgManualUrl" type={fieldType} inputMode="url" maxLength={4096} autoComplete="off" defaultValue={savedValues?.epgManualUrl ?? ''} /></label>
            <label>{t('epgOffset')}<input name="epgOffsetHours" type="number" min={-12} max={12} step={1} defaultValue={savedValues?.epgOffsetHours ?? ''} /></label>
            <label>{t('epgDisabled')}<select name="epgDisabled" defaultValue={savedValues?.epgDisabled === undefined ? '' : String(savedValues.epgDisabled)}>
              <option value="">—</option><option value="true">{t('yes')}</option><option value="false">{t('no')}</option>
            </select></label>
          </div>
        </details>
      </fieldset>
      {error && <p role="alert">{t(uncertain ? 'uncertain' : error.code)}</p>}
    </form>
    <div className="editor-actions">
      <button type="button" className="ghost" disabled={busy} onClick={() => { request.current = null; setError(undefined); setUncertain(false); onCancel() }}>{t('cancel')}</button>
      <button className="primary" type="submit" form="list-editor-form" aria-disabled={busy}>{t(busy ? 'sending' : uncertain ? 'retry' : 'save')}</button>
    </div>
  </section>
}
