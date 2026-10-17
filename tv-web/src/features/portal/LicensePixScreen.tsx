import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { FixedQr } from '../../components/FixedQr'
import { Modal } from '../../components/Modal'
import { useT } from '../../lib/i18n/I18nProvider'
import type { PixCharge, PixPurchasePort } from '../../lib/licensing/pixPurchase'
import { PortalRequestError } from '../../lib/portal/portalClient'
import './LicensePixScreen.css'

/** Tempo para a pessoa ler "Licença ativa até …" antes de o chamador seguir (entrar na lista / voltar ao painel). */
const LICENSED_PAUSE_MS = 600

type Note = 'portal.pix.pending' | 'portal.pix.approvedNoLicense' | 'portal.pix.offline' | 'portal.pix.failed'
type View =
  | { kind: 'loading' }
  | { kind: 'charge'; charge: PixCharge; receivedAt: number; note?: Note; code?: string }
  | { kind: 'error'; message: 'portal.pix.offline' | 'portal.pix.failed' | 'portal.pix.unavailable'; code?: string; renew: boolean }
  | { kind: 'licensed' }

const OFFLINE = new Set(['offline', 'network_error'])

function failure(error: unknown) {
  const code = error instanceof PortalRequestError ? error.code : 'unexpected_error'
  if (OFFLINE.has(code)) return { message: 'portal.pix.offline' as const }
  if (code === 'service_unavailable') return { message: 'portal.pix.unavailable' as const }
  return { message: 'portal.pix.failed' as const, code }
}

/**
 * Tela de pagamento Pix (feature 073, US1): QR + copia-e-cola, R$ 35 / 12 meses, ID da TV, prazo do serviço,
 * Atualizar e Voltar; Pix vencido → "Gerar novo Pix"; falha → "Tentar novamente". É um `Modal` próprio: quem a
 * abre (bloqueio ou Portal & licença) desmonta o seu antes (um Modal ativo por vez). Só SELECT fala com o serviço;
 * a contagem do prazo é relógio local de exibição e, ao zerar, vira "venceu" sem requisição (ADR-016).
 */
export function LicensePixScreen({ purchase, onLicensed, onBack, site, readExpiry }: {
  purchase: PixPurchasePort
  /** Pagamento aprovado e licença recebida: o chamador mostra a validade e segue (entra na lista / volta). */
  onLicensed(): void
  /** RETURN ou Voltar: o chamador devolve o foco a "Comprar licença". */
  onBack(): void
  /** Endereço do portal para a linha "pagar com cartão" (sem ele, a linha some). */
  site?: string
  /** Vencimento da licença local (ms) para "Licença ativa até …". */
  readExpiry?: () => number | undefined
}): ReactNode {
  const t = useT()
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [focused, setFocused] = useState(0)
  const [now, setNow] = useState(Date.now)
  const alive = useRef(true)
  // Chamada em andamento: uma por vez; abortada (desmontagem/StrictMode) libera a próxima na hora.
  const controller = useRef<AbortController | undefined>(undefined)
  const running = () => !!controller.current && !controller.current.signal.aborted
  const licensed = useRef(false)
  const handlers = useRef({ onLicensed, onBack })
  useEffect(() => { handlers.current = { onLicensed, onBack } }, [onLicensed, onBack])

  const open = useCallback(async (renew: boolean) => {
    if (controller.current && !controller.current.signal.aborted) return
    const abort = new AbortController()
    controller.current = abort
    setView({ kind: 'loading' }); setFocused(0)
    try {
      const charge = await purchase.open({ renew }, abort.signal)
      if (alive.current && !abort.signal.aborted) { setView({ kind: 'charge', charge, receivedAt: Date.now() }); setNow(Date.now()) }
    } catch (error) {
      if (alive.current && !abort.signal.aborted) setView({ kind: 'error', renew, ...failure(error) })
    } finally { if (controller.current === abort) controller.current = undefined }
  }, [purchase])

  useEffect(() => {
    alive.current = true
    void open(false)
    return () => { alive.current = false; controller.current?.abort() }
  }, [open])

  const charge = view.kind === 'charge' ? view.charge : undefined
  const remainingMs = charge?.expiresAt !== undefined && view.kind === 'charge'
    ? charge.expiresAt - charge.serverTime - (now - view.receivedAt) : undefined
  const locallyExpired = charge?.state === 'pending' && remainingMs !== undefined && remainingMs <= 0
  const payable = charge?.state === 'pending' && !locallyExpired
  const awaitingLicense = charge?.state === 'approved'
  // Contagem só para exibição; nunca dispara requisição.
  useEffect(() => {
    if (!payable) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [payable])

  const refresh = async () => {
    if (running() || view.kind !== 'charge') return
    const abort = new AbortController()
    controller.current = abort
    try {
      const result = await purchase.refresh(view.charge.orderId, abort.signal)
      if (!alive.current || abort.signal.aborted) return
      if (result.licensed) {
        setView({ kind: 'licensed' }); setFocused(0)
        if (!licensed.current) {
          licensed.current = true
          setTimeout(() => handlers.current.onLicensed(), LICENSED_PAUSE_MS)
        }
        return
      }
      const note: Note = result.charge.state === 'approved' ? 'portal.pix.approvedNoLicense' : 'portal.pix.pending'
      setView({ kind: 'charge', charge: result.charge, receivedAt: Date.now(), note }); setNow(Date.now()); setFocused(0)
    } catch (error) {
      if (!alive.current || abort.signal.aborted) return
      const { message, code } = failure(error)
      setView(current => current.kind === 'charge'
        ? { ...current, note: message === 'portal.pix.offline' ? 'portal.pix.offline' : 'portal.pix.failed', code } : current)
    } finally { if (controller.current === abort) controller.current = undefined }
  }

  const back = () => { controller.current?.abort(); handlers.current.onBack() }
  const actions: { label: string; variant: 'accent' | 'secondary'; run: () => void }[] = []
  if (view.kind === 'error') actions.push({ label: t('portal.pix.retry'), variant: 'accent', run: () => void open(view.renew) })
  else if (view.kind === 'charge' && (payable || awaitingLicense)) actions.push({ label: t('portal.refresh.label'), variant: 'accent', run: () => void refresh() })
  else if (view.kind === 'charge') actions.push({ label: t('portal.pix.renewAction'), variant: 'accent', run: () => void open(true) })
  actions.push({ label: t('portal.licenseBack'), variant: 'secondary', run: back })
  const index = Math.min(focused, actions.length - 1)

  const expiry = view.kind === 'licensed' ? readExpiry?.() : undefined
  return <Modal ariaLabel={t('portal.pix.title')} onBack={back}
    onDirection={direction => setFocused(current => direction === 'left' || direction === 'up'
      ? Math.max(0, current - 1) : Math.min(actions.length - 1, current + 1))}
    onSelect={() => actions[index]?.run()}>
    <div className="license-pix">
      <h2>{t('portal.pix.title')}</h2>
      {view.kind === 'loading' && <p className="license-pix-text" role="status">{t('portal.pix.loading')}</p>}
      {view.kind === 'error' && <>
        <p className="license-pix-text" role="alert">{t(view.message)}</p>
        {view.code && <p className="license-pix-text">{t('portal.failureCode', { code: view.code })}</p>}
      </>}
      {view.kind === 'licensed' && <p className="license-pix-text license-pix-success" role="status">
        {expiry ? t('portal.pix.licensed', { date: new Date(expiry).toLocaleDateString() }) : t('portal.license_active')}</p>}
      {view.kind === 'charge' && <>
        {payable && charge?.qrCode ? <div className="license-pix-hero">
          <div className="license-pix-qr"><FixedQr value={charge.qrCode} label={t('portal.qrAlt')} /></div>
          <div className="license-pix-info">
            <p className="license-pix-offer">{t('portal.pix.offer')}</p>
            <p className="license-pix-text">{t('portal.pix.scan')}</p>
            {charge.displayId && <p className="license-pix-text">{t('portal.pix.tv', { id: charge.displayId })}</p>}
            {remainingMs !== undefined && <p className="license-pix-text">{t('portal.pix.expiresIn', { minutes: Math.max(1, Math.ceil(remainingMs / 60_000)) })}</p>}
            <p className="license-pix-label">{t('portal.pix.copyPaste')}</p>
            <p className="license-pix-code">{charge.qrCode}</p>
            {site && <p className="license-pix-text">{t('portal.pix.card', { site })}</p>}
          </div>
        </div> : <p className="license-pix-text" role="status">{t(awaitingLicense ? 'portal.pix.approvedNoLicense'
          : charge?.state === 'pending' || charge?.state === 'expired' ? 'portal.pix.expired' : 'portal.pix.notCompleted')}</p>}
        {view.note && !(awaitingLicense && view.note === 'portal.pix.approvedNoLicense') &&
          <p className="license-pix-text" role="status">{t(view.note)}</p>}
        {view.code && <p className="license-pix-text">{t('portal.failureCode', { code: view.code })}</p>}
      </>}
      <div className="license-pix-actions">
        {actions.map((action, position) => <Button key={action.label} variant={action.variant} focused={position === index}
          onSelect={() => { setFocused(position); action.run() }}>{action.label}</Button>)}
      </div>
    </div>
  </Modal>
}
