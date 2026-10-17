import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react'
import { useT, type MessageKey } from '../../lib/i18n'
import { api, newOperationId, PortalApiError, type Session, type TmdbServerState } from '../api'
import { EyeIcon } from '../EyeIcon'
import { DeleteDialog } from '../lists/DeleteDialog'
import { useTvDataContext } from '../shell/TvDataProvider'
import { checkTmdbKey } from './tmdbKeyFormat'
import { resolveTmdbView, type TmdbServiceState, type TmdbView } from './tmdbStatus'

const TITLE: Record<TmdbView, MessageKey> = {
  none: 'tmdbNone', configured_on_tv: 'tmdbConfiguredOnTv', pending: 'tmdbPending', applied: 'tmdbApplied', rejected: 'tmdbRejected',
}
const TONE: Record<TmdbView, string> = {
  none: 'neutral', configured_on_tv: 'success', pending: 'warning', applied: 'success', rejected: 'danger',
}

/** `GET /integrations/tmdb` → entrada de `resolveTmdbView` (o serviço manda `null` onde a regra espera "ausente"). */
function toServiceState(server: TmdbServerState): TmdbServiceState {
  return {
    pending: server.pending ? { action: server.pending.action, retryReason: server.pending.retryReason } : undefined,
    last: server.last ? { action: server.last.action, result: server.last.result, reason: server.last.reason } : undefined,
    tvReported: server.tvReported ?? undefined,
  }
}

/**
 * Chave TMDB (feature 077, US4, ADR-020): a pessoa cola a chave dela aqui, o serviço a guarda cifrada até a TV aplicá-la
 * no Atualizar e o estado volta como "Aplicada na TV" ou "Recusada pelo TMDB". A chave só existe no campo e no corpo do
 * envio: nunca em endereço, armazenamento, console, mensagem ou atributo; o campo é oculto por padrão e limpo após o envio,
 * e nada que o serviço devolve a contém (Substituir sempre envia outra).
 */
export function TmdbPage({ session }: { session: Session }) {
  const t = useT()
  const { device } = useTvDataContext()
  const [server, setServer] = useState<TmdbServerState>()
  const [loadError, setLoadError] = useState<PortalApiError>()
  const [key, setKey] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [formatError, setFormatError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<'sent' | 'removed'>()
  const [error, setError] = useState<PortalApiError>()
  const [removing, setRemoving] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  // O pedido reaproveita o mesmo Idempotency-Key depois de uma falha de rede, enquanto a chave digitada não mudar.
  const sending = useRef<{ operationId: string; key: string } | null>(null)
  const removal = useRef<string | null>(null)

  const load = useCallback(async () => {
    try { setServer(await api.tmdb.status()); setLoadError(undefined) }
    catch (caught) { setLoadError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
  }, [])
  // Relê junto da leitura compartilhada da TV (10 s, só com a aba visível): sem timer próprio.
  useEffect(() => { void load() }, [load, device])

  const fail = (caught: unknown) => setError(caught instanceof PortalApiError ? caught : new PortalApiError('network'))
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const checked = checkTmdbKey(key)
    if (!checked.ok) { setFormatError(true); input.current?.focus(); return }
    if (sending.current?.key !== checked.key) sending.current = { operationId: newOperationId(), key: checked.key }
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      await api.tmdb.set(session, checked.key, sending.current.operationId)
      // Enviada: a chave sai do campo e da memória do formulário; o que o portal mostra a partir daqui é só o estado.
      sending.current = null; setKey(''); setRevealed(false); setNotice('sent')
      await load()
    } catch (caught) {
      fail(caught)
      if (!(caught instanceof PortalApiError) || caught.code !== 'network') sending.current = null
    } finally { setBusy(false) }
  }
  async function remove() {
    if (busy) return
    removal.current ??= newOperationId()
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      await api.tmdb.remove(session, removal.current)
      removal.current = null; setRemoving(false); setNotice('removed')
      await load()
    } catch (caught) {
      fail(caught)
      if (!(caught instanceof PortalApiError) || caught.code !== 'network') removal.current = null
    } finally { setBusy(false) }
  }
  async function cancelPending() {
    if (busy) return
    setBusy(true); setError(undefined); setNotice(undefined)
    try { await api.tmdb.cancel(session); await load() } catch (caught) { fail(caught) } finally { setBusy(false) }
  }

  if (!server) {
    return <div className="tmdb-page">
      {loadError
        ? <><p role="alert">{t(loadError.code)}</p><button type="button" className="primary" onClick={() => void load()}>{t('tmdbRetryStatus')}</button></>
        : <p role="status">{t('loading')}</p>}
    </div>
  }
  const presentation = resolveTmdbView(toServiceState(server))
  const hint: MessageKey = presentation.view === 'none' ? 'tmdbHintNone'
    : presentation.view === 'configured_on_tv' ? 'tmdbHintConfiguredOnTv'
    : presentation.view === 'pending' ? (presentation.needsRetry ? 'tmdbHintPendingRetry' : 'tmdbHintPending')
    : presentation.view === 'applied' ? 'tmdbHintApplied'
    : presentation.reason === 'invalid_format' ? 'tmdbHintInvalidFormat' : 'tmdbHintRefused'
  const hasKey = presentation.canRemove
  return <div className="tmdb-page">
    <section className="panel tmdb-status" aria-labelledby="tmdb-state">
      <p><span id="tmdb-state" className={'status-badge is-' + TONE[presentation.view]}>{t(TITLE[presentation.view])}</span></p>
      <p>{t(hint)}</p>
      {(presentation.view === 'pending' || hasKey) && <div className="actions">
        {presentation.view === 'pending' && <button type="button" className="small" disabled={busy} onClick={() => void cancelPending()}>{t('cancelSend')}</button>}
        {hasKey && <button type="button" className="small ghost danger" disabled={busy} onClick={() => { removal.current = null; setRemoving(true) }}>{t('tmdbRemove')}</button>}
      </div>}
    </section>
    {notice && <p role="status" className="notice is-success">{t(notice === 'sent' ? 'tmdbSentNextStep' : 'tmdbRemoveSent')}</p>}
    <form className="panel tmdb-form" onSubmit={event => void submit(event)} aria-busy={busy} noValidate>
      <h2>{t(hasKey ? 'tmdbReplace' : 'tmdbAdd')}</h2>
      <div className="field">
        <label htmlFor="tmdb-key">{t('tmdbKeyLabel')}</label>
        <span className="secret-field">
          <input ref={input} id="tmdb-key" name="tmdb-token" type={revealed ? 'text' : 'password'} value={key} disabled={busy}
            onChange={event => { setKey(event.target.value); setFormatError(false) }} maxLength={700}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            aria-invalid={formatError || undefined} aria-describedby={'tmdb-key-hint' + (formatError ? ' tmdb-key-error' : '')} />
          <button type="button" className="secret-toggle" onClick={() => setRevealed(value => !value)} aria-pressed={revealed}
            aria-label={t(revealed ? 'hideValues' : 'showValues')} aria-controls="tmdb-key"><EyeIcon open={revealed} /></button>
        </span>
        <p id="tmdb-key-hint" className="field-hint">{t('tmdbKeyHint')}</p>
        {formatError && <p id="tmdb-key-error" role="alert">{t('tmdbFormatError')}</p>}
      </div>
      {error && <p role="alert">{t(error.code)}</p>}
      <div className="actions">
        <button type="submit" className="primary" aria-disabled={busy || undefined}>{t(busy ? 'sending' : 'tmdbSend')}</button>
        <a className="button ghost small" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer noopener">{t('tmdbHowTo')}</a>
      </div>
    </form>
    {removing && <DeleteDialog name={t('settingsTmdbTitle')} busy={busy} title="tmdbRemoveTitle" text="tmdbRemoveText" confirm="tmdbRemoveConfirm"
      onConfirm={() => void remove()} onCancel={() => { setRemoving(false); removal.current = null }} />}
  </div>
}
