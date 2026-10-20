import { useEffect, useRef, useState } from 'react'
import { useT } from '../../lib/i18n'
import { api, newRecoveryId, PortalApiError, purchaseLabel, type LicenseOrder, type Session } from '../api'
import { useTvDataContext } from '../shell/TvDataProvider'

// 081/T047: a volta do Mercado Pago pode abrir numa aba nova (celular) — o pedido conhecido fica no navegador, não na aba.
function orderStore(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try { return window.localStorage } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} } }
}

export function safeCheckoutUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && ['www.mercadopago.com.br', 'sandbox.mercadopago.com.br'].includes(url.hostname) &&
      !url.username && !url.password && !url.hash && !url.port ? url.href : undefined
  } catch { return undefined }
}

/**
 * Licença (feature 077, US3): um cartão com estado, validade, oferta e um botão — **Comprar licença** (teste/vencida) ou
 * **Renovar licença** (ativa). O aceite é a frase com o ID da TV junto do botão, sem caixa de seleção. A leitura do
 * dispositivo vem do contexto compartilhado (sem timer próprio); a oferta e o pedido conhecido são relidos a cada leitura
 * dele. Um pedido pendente (da TV ou do portal) é reaproveitado, nunca cobrado de novo; a tentativa tem id idempotente.
 */
export function LicenseCard({ session }: { session: Session }) {
  const t = useT()
  const { device } = useTvDataContext()
  const [enabled, setEnabled] = useState<boolean>()
  const [order, setOrder] = useState<LicenseOrder>()
  const [error, setError] = useState<PortalApiError>()
  const [busy, setBusy] = useState(false)
  const alive = useRef(false), running = useRef(false)
  const attempt = useRef<string | undefined>(undefined)
  const knownOrder = useRef<string | undefined>(undefined)
  const storageKey = 'ccplay-license-order-' + session.deviceId
  const fail = (caught: unknown) => { if (alive.current) setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
  async function load() {
    if (running.current) return
    running.current = true
    try {
      const offer = await api.offer()
      // A oferta só é aceita como a conhecida (R$ 35,00, BRL, 12 meses, 1 TV, sem renovação automática).
      if (offer.priceMinor !== 3500 || offer.currency !== 'BRL' || offer.termMonths !== 12 || offer.deviceCount !== 1 || offer.renewal !== 'manual') throw new PortalApiError('invalid')
      const status = knownOrder.current ? await api.order(knownOrder.current) : undefined
      if (status && status.deviceId !== session.deviceId) throw new PortalApiError('invalid')
      if (!alive.current) return
      setEnabled(offer.checkoutEnabled); setError(undefined)
      if (status) setOrder(status)
    } catch (caught) { fail(caught) }
    finally { running.current = false }
  }
  useEffect(() => {
    alive.current = true
    try { knownOrder.current = orderStore().getItem(storageKey) ?? undefined; attempt.current = orderStore().getItem(storageKey + '-attempt') ?? undefined } catch { /* Storage indisponível não altera o pedido do servidor. */ }
    return () => { alive.current = false }
  }, [storageKey])
  // Cada leitura do dispositivo (a cada 10 s, só com a aba visível) relê a oferta e o estado do pedido conhecido.
  useEffect(() => { void load() }, [device, storageKey])
  const terminal = !!order && !['created', 'pending'].includes(order.status)
  async function buy() {
    if (!enabled || busy || running.current) return
    setBusy(true); setError(undefined); running.current = true
    if (terminal) { attempt.current = undefined; try { orderStore().removeItem(storageKey + '-attempt') } catch { /* Sem storage. */ } }
    attempt.current ??= newRecoveryId()
    try {
      try { orderStore().setItem(storageKey + '-attempt', attempt.current) } catch { /* Reutilização em memória. */ }
      const value = await api.checkout(session, attempt.current)
      if (value.deviceId !== session.deviceId) throw new PortalApiError('invalid')
      knownOrder.current = value.orderId
      try { orderStore().setItem(storageKey, value.orderId) } catch { /* Servidor reutiliza compra pendente. */ }
      if (alive.current) setOrder(value)
    } catch (caught) { fail(caught) }
    finally { running.current = false; if (alive.current) setBusy(false) }
  }
  const pending = device?.pendingOrder
  const checkout = !terminal && safeCheckoutUrl(order?.checkoutUrl)
  const expired = device && device.license.expiresAt <= Math.max(Date.now(), device.license.serverTime)
  const tone = !device ? '' : expired || device.license.state === 'revoked' ? 'is-danger' : device.license.state === 'active' ? 'is-success' : 'is-warning'
  // load() só aceita a oferta de R$ 35,00 (3500 centavos, BRL); o valor exibido é o mesmo.
  const price = new Intl.NumberFormat(t('lang'), { style: 'currency', currency: 'BRL' }).format(3500 / 100)
  const canBuy = enabled === true && !busy && !!device
  return <section className="license-card" aria-labelledby="license-title">
    <h1 id="license-title" data-page-title tabIndex={-1}>{t('navLicense')}</h1>
    <div className="panel license-body">
      {device && <p className="license-current"><span className={'status-badge ' + tone}>{t(expired ? 'licenseExpired' : ('license_' + device.license.state) as 'license_active')}</span>
        <span>{t('licenseExpiry')}: <time dateTime={new Date(device.license.expiresAt).toISOString()}>{new Date(device.license.expiresAt).toLocaleDateString(t('lang'))}</time></span></p>}
      <div className="license-offer">
        <strong className="license-price">{price}</strong>
        <span className="license-term">{t('licenseProduct')} · {t('licenseTerm')}</span>
      </div>
      <p>{t('licenseOneTime')}</p>
      {/* 081/FR-009: quem vende, contato e reembolso, antes do botão de compra. */}
      <p className="field-hint">{t('licenseSeller')}</p>
      {enabled === false && <p className="notice is-warning">{t('licenseDisabled')}</p>}
      {/* 073/FR-010: pedido em aberto da TV — avisa e NÃO cria cobrança nova (o botão reaproveita o mesmo pedido). */}
      {pending && !terminal && <p role="status" className="notice">{pending.method === 'pix' && pending.expiresAt
        ? t('pendingPix').replace('{time}', new Date(pending.expiresAt).toLocaleTimeString(t('lang'), { hour: '2-digit', minute: '2-digit' }))
        : t('pendingCheckout')}</p>}
      {error && <p role="alert">{t(error.code)}</p>}
      {order && <p role="status" className={'notice' + (order.status === 'approved' ? ' is-success' : '')}>{t(('order_' + order.status) as 'order_pending')}</p>}
      <p className="license-accepts">{t('licenseAcceptsTv').replace('{id}', device?.displayId ?? '—')}</p>
      <div className="license-cta">
        {checkout
          ? <a className="button primary large" href={checkout} rel="noreferrer">{t('licenseCheckout')}</a>
          : <button type="button" className="primary large" aria-disabled={!canBuy || undefined} onClick={() => { if (canBuy) void buy() }}>{t(purchaseLabel(device?.license.state))}</button>}
      </div>
      <p className="field-hint">{t('licenseActivation')}</p>
    </div>
  </section>
}
