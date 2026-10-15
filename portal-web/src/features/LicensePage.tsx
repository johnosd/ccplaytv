import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { api, newRecoveryId, PortalApiError, type LicenseDevice, type LicenseOrder, type Session } from './api'
export function safeCheckoutUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && ['www.mercadopago.com.br', 'sandbox.mercadopago.com.br'].includes(url.hostname) &&
      !url.username && !url.password && !url.hash && !url.port ? url.href : undefined
  } catch { return undefined }
}
export function LicensePage({ session }: { session: Session }) {
  const t = useT()
  const [device, setDevice] = useState<LicenseDevice>()
  const [enabled, setEnabled] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [order, setOrder] = useState<LicenseOrder>()
  const [error, setError] = useState<PortalApiError>()
  const [busy, setBusy] = useState(false)
  const alive = useRef(false), running = useRef(false)
  const attempt = useRef<string | undefined>(undefined)
  const knownOrder = useRef<string | undefined>(undefined)
  const storageKey = 'ccplay-license-order-' + session.deviceId
  async function refresh() {
    if (running.current) return
    running.current = true
    try {
      const [info, offer] = await Promise.all([api.licenseDevice(), api.offer()])
      if (info.deviceId !== session.deviceId || offer.priceMinor !== 3500 || offer.currency !== 'BRL' ||
        offer.termMonths !== 12 || offer.deviceCount !== 1 || offer.renewal !== 'manual') throw new PortalApiError('invalid')
      const status = knownOrder.current ? await api.order(knownOrder.current) : undefined
      if (status && status.deviceId !== session.deviceId) throw new PortalApiError('invalid')
      if (!alive.current) return
      setDevice(info); setEnabled(offer.checkoutEnabled); setError(undefined)
      if (status) setOrder(status)
    } catch (caught) { if (alive.current) setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { running.current = false }
  }
  useEffect(() => {
    alive.current = true
    try { knownOrder.current = sessionStorage.getItem(storageKey) ?? undefined; attempt.current = sessionStorage.getItem(storageKey + '-attempt') ?? undefined } catch { /* Storage indisponível não altera o pedido do servidor. */ }
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden' && navigator.onLine) void refresh() }, 10000)
    const resume = () => { if (document.visibilityState !== 'hidden' && navigator.onLine) void refresh() }
    window.addEventListener('pageshow', resume); window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume)
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener('pageshow', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume) }
  }, [session.deviceId])
  async function buy() {
    if (!enabled || !confirmed || busy || running.current) return
    setBusy(true); setError(undefined); running.current = true
    attempt.current ??= newRecoveryId()
    try {
      try { sessionStorage.setItem(storageKey + '-attempt', attempt.current) } catch { /* Reutilização em memória. */ }
      const value = await api.checkout(session, attempt.current)
      if (value.deviceId !== session.deviceId) throw new PortalApiError('invalid')
      knownOrder.current = value.orderId
      try { sessionStorage.setItem(storageKey, value.orderId) } catch { /* Servidor reutiliza compra pendente. */ }
      if (alive.current) { setOrder(value); setConfirmed(false) }
    } catch (caught) { if (alive.current) setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { running.current = false; if (alive.current) setBusy(false) }
  }
  const terminal = order && !['created', 'pending'].includes(order.status)
  const checkout = !terminal && safeCheckoutUrl(order?.checkoutUrl)
  const expired = device && device.license.expiresAt <= Math.max(Date.now(), device.license.serverTime)
  const tone = !device ? '' : expired || device.license.state === 'revoked' ? 'is-danger' : device.license.state === 'active' ? 'is-success' : 'is-warning'
  // refresh() só aceita a oferta de R$ 35,00 (3500 centavos, BRL); o valor exibido é o mesmo.
  const price = new Intl.NumberFormat(t('lang'), { style: 'currency', currency: 'BRL' }).format(3500 / 100)
  return <section className="license-page" aria-labelledby="license-title">
    <header className="license-hero">
      <p className="eyebrow">{t('title')} / {t('activate')}</p>
      <h2 id="license-title">{t('activateTitle')}</h2>
      <p>{t('licenseOffer')}</p>
    </header>
    <div className="license-layout">
      <div className="panel license-details">
        <h3>{t('yourDetails')}</h3>
        <div className="field"><span className="field-label">{t('deviceIdOnTv')}</span>
          <output className="readonly-value mono">{device?.displayId ?? session.deviceId}</output></div>
        <div className="field"><span className="field-label">{t('currentLicense')}</span>
          {device ? <p role="status" className="license-current"><span className={'status-badge ' + tone}>{t(expired ? 'licenseExpired' : ('license_' + device.license.state) as 'license_active')}</span>
            <span>{t('licenseExpiry')}: <time dateTime={new Date(device.license.expiresAt).toISOString()}>{new Date(device.license.expiresAt).toLocaleDateString(t('lang'))}</time></span></p>
            : <p className="readonly-value">—</p>}</div>
        {!enabled && <p className="notice is-warning">{t('licenseDisabled')}</p>}
        {error && <p role="alert">{t(error.code)}</p>}
        {order && <p role="status" className={'notice' + (order.status === 'approved' ? ' is-success' : '')}>{t(('order_' + order.status) as 'order_pending')}</p>}
        {(!order || terminal) && <label className="checkbox license-confirm"><input type="checkbox" checked={confirmed} onChange={event => {
          setConfirmed(event.target.checked)
          if (terminal && event.target.checked) { attempt.current = undefined; try { sessionStorage.removeItem(storageKey + '-attempt') } catch { /* Sem storage. */ } }
        }} />{t('licenseConfirm')}</label>}
        <div className="license-cta">
          {checkout && <a className="button primary large" href={checkout} rel="noreferrer">{t('licenseCheckout')}</a>}
          {(!order || terminal) && <button className="primary large" disabled={!enabled || !confirmed || busy} onClick={() => void buy()}>{t('licenseBuy')} · {price}</button>}
          <button className="ghost small" disabled={busy} onClick={() => void refresh()}>{t('refresh')}</button>
        </div>
      </div>
      <aside className="panel license-summary" aria-labelledby="summary-title">
        <p className="eyebrow" id="summary-title">{t('summary')}</p>
        <div className="summary-row"><span>{t('licenseProduct')}<small>{t('licenseTerm')}</small></span><strong className="summary-price">{price}</strong></div>
        <p className="eyebrow">{t('beforePay')}</p>
        <ul className="info-list">
          <li>{t('licenseTiedToTv')}</li>
          <li>{t('licenseOneTime')}</li>
          <li>{t('licenseMercadoPago')}</li>
          <li>{t('licenseActivation')}</li>
        </ul>
      </aside>
    </div>
  </section>
}
