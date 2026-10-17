import { useState } from 'react'
import { useT } from '../../lib/i18n'
import { useTvDataContext } from './TvDataProvider'
import { summaryState } from './summaryState'

/**
 * Resumo fixo da TV (feature 077, FR-002): ID, licença (texto + cor) e último contato, sempre no topo do conteúdo.
 * Estados de atenção (licença vencida, sem contato recente, falha ao ler) dizem o que fazer e levam a Licença.
 */
export function TvSummary({ onRenew }: { onRenew: () => void }) {
  const t = useT()
  const { device, dashboard, deviceError, refresh } = useTvDataContext()
  const state = summaryState(device, dashboard)
  const locale = t('lang')
  const [busy, setBusy] = useState(false)
  async function updateNow() {
    if (busy) return
    setBusy(true)
    try { await refresh() } finally { setBusy(false) }
  }
  return <section className="tv-summary" aria-label={t('summaryTitle')} aria-busy={busy}>
    <div className="tv-summary-head">
      <p className="eyebrow">{t('summaryTitle')}</p>
      {/* Releitura manual: o portal também relê sozinho a cada 10 s (aba visível); a TV só informa algo novo quando a pessoa aperta Atualizar nela. */}
      <button type="button" className="small ghost tv-summary-refresh" aria-disabled={busy || undefined} onClick={() => void updateNow()}>
        <span aria-hidden="true">↻</span>{t(busy ? 'loading' : 'refresh')}
      </button>
    </div>
    <dl className="tv-summary-fields">
      <div><dt>{t('summaryTvId')}</dt><dd className="mono">{device?.displayId ?? '—'}</dd></div>
      <div><dt>{t('licenseStatus')}</dt><dd>
        {device ? <><span className={'status-badge is-' + (state.tone === 'unknown' ? 'warning' : state.tone === 'danger' ? 'danger' : state.tone)}>{t(state.licenseLabel)}</span>
          {state.expiresAt && <span className="tv-summary-expiry">{t('licenseExpiry')}: <time dateTime={new Date(state.expiresAt).toISOString()}>{new Date(state.expiresAt).toLocaleDateString(locale)}</time></span>}</> : '—'}
      </dd></div>
      <div><dt>{t('summaryLastContact')}</dt><dd>
        {state.contact === 'none' ? t('noContactYet') : state.contactAt ? <time dateTime={state.contactAt}>{new Date(state.contactAt).toLocaleString(locale)}</time> : '—'}
      </dd></div>
    </dl>
    {state.needsRenew && <button type="button" className="small primary tv-summary-action" onClick={onRenew}>{t('summaryRenew')}</button>}
    {state.contact !== 'ok' && device && <p className="notice is-warning tv-summary-note" role="status">{t('staleContact')}</p>}
    {deviceError && <div className="tv-summary-note"><p role="alert">{t(deviceError.code)}</p>
      <button type="button" className="small" onClick={() => void refresh()}>{t('summaryRetry')}</button></div>}
  </section>
}
