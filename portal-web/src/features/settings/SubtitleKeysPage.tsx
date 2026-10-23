import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react'
import { useT, type MessageKey } from '../../lib/i18n'
import {
  api, newOperationId, PortalApiError,
  type Session, type SubtitleKeyProviderId, type SubtitleKeyServerState, type SubtitleKeysServerState,
} from '../api'
import { EyeIcon } from '../EyeIcon'
import { DeleteDialog } from '../lists/DeleteDialog'
import { useTvDataContext } from '../shell/TvDataProvider'
import { checkSubtitleKey, resolveSubtitleKeyView, SUBTITLE_KEY_PROVIDERS, type SubtitleKeyPresentation } from './subtitleKeyStatus'

const PROVIDER_NAME: Record<SubtitleKeyProviderId, string> = { opensubtitles: 'OpenSubtitles', subdl: 'SubDL' }
const KEY_LABEL: Record<SubtitleKeyProviderId, MessageKey> = { opensubtitles: 'subtitleKeyLabelOpenSubtitles', subdl: 'subtitleKeyLabelSubdl' }
const HOW_TO: Record<SubtitleKeyProviderId, { label: MessageKey; href: string }> = {
  opensubtitles: { label: 'subtitleHowToOpenSubtitles', href: 'https://www.opensubtitles.com/consumers' },
  subdl: { label: 'subtitleHowToSubdl', href: 'https://subdl.com/panel/api' },
}

/** Rótulo do estado (`logic §6.1`); "No limite" e "Estado desconhecido" só existem aqui, vindos do que a TV informou. */
function titleOf(view: SubtitleKeyPresentation, pendingAction?: 'set' | 'remove'): MessageKey {
  if (view.unknown) return 'subtitleUnknown'
  if (view.limited) return 'subtitleLimited'
  switch (view.view) {
    case 'none': return 'tmdbNone'
    case 'configured_on_tv': return 'tmdbConfiguredOnTv'
    case 'pending': return pendingAction === 'remove' ? 'subtitleRemovalPending' : 'tmdbPending'
    case 'applied': return 'tmdbApplied'
    case 'rejected': return view.reason === 'invalid_format' ? 'subtitleRejectedFormat' : 'subtitleRejectedRefused'
  }
}
function hintOf(view: SubtitleKeyPresentation): MessageKey {
  if (view.unknown) return 'subtitleHintUnknown'
  if (view.limited) return 'subtitleHintLimited'
  switch (view.view) {
    case 'none': return 'subtitleHintNone'
    case 'configured_on_tv': return 'tmdbHintConfiguredOnTv'
    case 'pending': return view.needsRetry ? 'subtitleHintPendingRetry' : 'tmdbHintPending'
    case 'applied': return 'subtitleHintApplied'
    case 'rejected': return view.reason === 'invalid_format' ? 'subtitleHintInvalidFormat' : 'subtitleHintRefused'
  }
}
function toneOf(view: SubtitleKeyPresentation): string {
  if (view.unknown || view.view === 'none') return 'neutral'
  if (view.limited || view.view === 'pending') return 'warning'
  return view.view === 'rejected' ? 'danger' : 'success'
}

/** `GET /integrations/subtitles` → entrada de `resolveSubtitleKeyView` (o serviço manda `null` onde a regra espera "ausente"). */
function present(server: SubtitleKeyServerState): SubtitleKeyPresentation {
  return resolveSubtitleKeyView({
    pending: server.pending ? { action: server.pending.action, retryReason: server.pending.retryReason } : undefined,
    last: server.last ? { action: server.last.action, result: server.last.result, reason: server.last.reason } : undefined,
    tvReported: server.tvReported ?? undefined,
  })
}

/**
 * Uma seção por fornecedor: estado, remover e o formulário Adicionar/Substituir. A chave só existe no campo e no corpo
 * do envio — nunca em endereço, armazenamento, console, mensagem ou atributo; o campo é oculto por padrão, limpo após o
 * envio, e nada que o serviço devolve a contém.
 */
function ProviderSection({ session, provider, server, reload }: {
  session: Session; provider: SubtitleKeyProviderId; server: SubtitleKeyServerState; reload: () => Promise<void>
}) {
  const t = useT()
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
  const id = 'subtitle-key-' + provider
  const view = present(server)

  const fail = (caught: unknown) => setError(caught instanceof PortalApiError ? caught : new PortalApiError('network'))
  const keepOperation = (caught: unknown) => caught instanceof PortalApiError && caught.code === 'network'
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const checked = checkSubtitleKey(key)
    if (!checked.ok) { setFormatError(true); input.current?.focus(); return }
    if (sending.current?.key !== checked.key) sending.current = { operationId: newOperationId(), key: checked.key }
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      await api.subtitleKeys.set(session, provider, checked.key, sending.current.operationId)
      // Enviada: a chave sai do campo e da memória do formulário; o que o portal mostra a partir daqui é só o estado.
      sending.current = null; setKey(''); setRevealed(false); setNotice('sent')
      await reload()
    } catch (caught) {
      fail(caught)
      if (!keepOperation(caught)) sending.current = null
    } finally { setBusy(false) }
  }
  async function remove() {
    if (busy) return
    removal.current ??= newOperationId()
    setBusy(true); setError(undefined); setNotice(undefined)
    try {
      await api.subtitleKeys.remove(session, provider, removal.current)
      removal.current = null; setRemoving(false); setNotice('removed')
      await reload()
    } catch (caught) {
      fail(caught)
      if (!keepOperation(caught)) removal.current = null
    } finally { setBusy(false) }
  }

  return <section className="panel tmdb-form subtitle-key" aria-labelledby={id + '-title'} data-provider={provider}>
    <h2 id={id + '-title'}>{PROVIDER_NAME[provider]}</h2>
    <p><span className={'status-badge is-' + toneOf(view)}>{t(titleOf(view, server.pending?.action))}</span></p>
    <p>{t(hintOf(view))}</p>
    {view.canRemove && <div className="actions">
      <button type="button" className="small ghost danger" disabled={busy} onClick={() => { removal.current = null; setRemoving(true) }}>{t('tmdbRemove')}</button>
    </div>}
    {notice && <p role="status" className="notice is-success">{t(notice === 'sent' ? 'tmdbSentNextStep' : 'tmdbRemoveSent')}</p>}
    <form className="tmdb-form" onSubmit={event => void submit(event)} aria-busy={busy} noValidate>
      <h3>{t(view.canRemove ? 'tmdbReplace' : 'tmdbAdd')}</h3>
      <div className="field">
        <label htmlFor={id}>{t(KEY_LABEL[provider])}</label>
        <span className="secret-field">
          <input ref={input} id={id} name={provider + '-token'} type={revealed ? 'text' : 'password'} value={key} disabled={busy}
            onChange={event => { setKey(event.target.value); setFormatError(false) }} maxLength={300}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            aria-invalid={formatError || undefined} aria-describedby={id + '-hint' + (formatError ? ' ' + id + '-error' : '')} />
          <button type="button" className="secret-toggle" onClick={() => setRevealed(value => !value)} aria-pressed={revealed}
            aria-label={t(revealed ? 'hideValues' : 'showValues')} aria-controls={id}><EyeIcon open={revealed} /></button>
        </span>
        <p id={id + '-hint'} className="field-hint">{t('subtitleKeyHint')}</p>
        {formatError && <p id={id + '-error'} role="alert">{t('subtitleFormatError')}</p>}
      </div>
      {error && <p role="alert">{t(error.code)}</p>}
      <div className="actions">
        <button type="submit" className="primary" aria-disabled={busy || undefined}>{t(busy ? 'sending' : 'tmdbSend')}</button>
        <a className="button ghost small" href={HOW_TO[provider].href} target="_blank" rel="noreferrer noopener">{t(HOW_TO[provider].label)}</a>
      </div>
    </form>
    {removing && <DeleteDialog name={PROVIDER_NAME[provider]} busy={busy} title="subtitleRemoveTitle" text="subtitleRemoveText" confirm="tmdbRemoveConfirm"
      onConfirm={() => void remove()} onCancel={() => { setRemoving(false); removal.current = null }} />}
  </section>
}

/**
 * Chaves de legenda (feature 091, US1, ADR-022): as mesmas regras da chave TMDB (`TmdbPage`) para OpenSubtitles e SubDL.
 * Um envio por fornecedor; sem "cancelar envio" e sem "Usar o padrão" — o portal só adiciona, substitui e remove.
 */
export function SubtitleKeysPage({ session }: { session: Session }) {
  const t = useT()
  const { device } = useTvDataContext()
  const [server, setServer] = useState<SubtitleKeysServerState>()
  const [loadError, setLoadError] = useState<PortalApiError>()
  const load = useCallback(async () => {
    try { setServer(await api.subtitleKeys.status()); setLoadError(undefined) }
    catch (caught) { setLoadError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
  }, [])
  // Relê junto da leitura compartilhada da TV (10 s, só com a aba visível): sem timer próprio.
  useEffect(() => { void load() }, [load, device])

  if (!server) {
    return <div className="tmdb-page">
      {loadError
        ? <><p role="alert">{t(loadError.code)}</p><button type="button" className="primary" onClick={() => void load()}>{t('tmdbRetryStatus')}</button></>
        : <p role="status">{t('loading')}</p>}
    </div>
  }
  return <div className="tmdb-page">
    <p>{t('subtitleIntro')}</p>
    {SUBTITLE_KEY_PROVIDERS.map(provider => <ProviderSection key={provider} session={session} provider={provider} server={server[provider]} reload={load} />)}
  </div>
}
