import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { useT } from '../../lib/i18n/I18nProvider'
import { commercialBuild, licenseMonitor, onListEntryDenied } from '../../lib/licensing/licenseRuntime'
import type { PortalConnection } from '../../lib/portal/portalConnection'
import { FixedQr } from '../../components/FixedQr'
import { RefreshButton, RefreshStatusLine } from '../../components/RefreshButton'
import { usePairingCredentials } from '../../lib/portal/usePairingCredentials'
import { useRefreshAction } from '../../lib/portal/useRefreshAction'
import type { PixPurchasePort } from '../../lib/licensing/pixPurchase'
import { LicensePixScreen } from './LicensePixScreen'
import './portalPairing.css'

/** Espera a licença recém-guardada chegar ao monitor (o `liveQuery` o avisa); nunca bloqueia além do limite. */
function waitUntilAllowed(limitMs = 2_000): Promise<boolean> {
  if (licenseMonitor.check().allowed) return Promise.resolve(true)
  return new Promise(resolve => {
    const finish = (value: boolean) => { clearTimeout(timer); release(); resolve(value) }
    const release = licenseMonitor.subscribe(() => { if (licenseMonitor.check().allowed) finish(true) })
    const timer = setTimeout(() => finish(licenseMonitor.check().allowed), limitMs)
  })
}

/**
 * Bloqueio de entrada na lista (features 069, 071 e 073): mensagem do fim do teste, **Comprar licença** (Pix na
 * TV, 073), QR fixo do portal (cartão), endereço, ID e chave visíveis, **Atualizar** (só a licença) e **Voltar**.
 * Nada consulta sozinho: abrir cadastra o dispositivo uma vez (D-004) e só SELECT fala com o serviço. Liberada
 * pelo Atualizar ou pela tela de Pix, retoma a entrada que foi negada.
 */
export function LicenseGate({ onStop, onResume, activeSourceId, connection, purchase, readExpiry }: {
  onStop(sourceId?: string): void
  /** Chamado com a lista cuja entrada foi negada quando o Atualizar libera a licença (FR-007). */
  onResume?(sourceId: string): void
  activeSourceId?: string
  connection?: PortalConnection
  /** 073: compra por Pix; ausente (portal não configurado / build não comercial) = botão soft-disabled. */
  purchase?: PixPurchasePort
  readExpiry?: () => number | undefined
}) {
  const t = useT()
  const [blocked, setBlocked] = useState(false)
  const [buying, setBuying] = useState(false)
  const buyingRef = useRef(false)
  useEffect(() => { buyingRef.current = buying }, [buying])
  const [focused, setFocused] = useState(0)
  const [noPurchase, setNoPurchase] = useState(false)
  const callbacks = useRef({ onStop, onResume, activeSourceId })
  const denied = useRef<string | undefined>(undefined)
  useEffect(() => { callbacks.current = { onStop, onResume, activeSourceId } }, [onStop, onResume, activeSourceId])
  const pairing = usePairingCredentials(connection, blocked)
  const refresh = useRefreshAction('license')
  useEffect(() => {
    if (!commercialBuild) return
    let previous = licenseMonitor.check().reason
    const block = (sourceId?: string) => {
      flushSync(() => callbacks.current.onStop(sourceId))
      denied.current = sourceId
      setFocused(0); setNoPurchase(false); setBuying(false); setBlocked(true)
    }
    const stop = onListEntryDenied(block)
    const changed = licenseMonitor.subscribe(() => {
      const next = licenseMonitor.check()
      // Revogação confirmada mantém o encerramento; vencimento só barra a próxima entrada.
      if (next.reason === 'revoked' && previous !== 'revoked' && callbacks.current.activeSourceId) block()
      previous = next.reason
      // 073: com a tela de Pix aberta, quem fecha é ela (onLicensed retoma a lista negada); fechar aqui a desmontaria
      // antes de avisar.
      if (next.allowed && !buyingRef.current) setBlocked(false)
    })
    return () => { stop(); changed() }
  }, [])
  if (!blocked) return null
  const back = () => setBlocked(false)
  const resume = () => {
    const sourceId = denied.current
    denied.current = undefined
    setBuying(false); setBlocked(false)
    if (sourceId) callbacks.current.onResume?.(sourceId)
  }
  const update = async () => {
    setNoPurchase(false)
    const result = await refresh.run()
    if (!result.ok) return
    if (await waitUntilAllowed()) resume()
    else setNoPurchase(true)
  }
  // Um Modal ativo por vez (components/Modal): a tela de Pix substitui o bloqueio inteiro enquanto aberta.
  if (buying && purchase) {
    return <LicensePixScreen purchase={purchase} site={pairing.site} readExpiry={readExpiry}
      onLicensed={() => { void waitUntilAllowed().then(allowed => { if (allowed) resume(); else { setBuying(false); setNoPurchase(true) } }) }}
      onBack={() => { setBuying(false); setFocused(0) }} />
  }
  const buy = () => { if (purchase) setBuying(true) }
  const trial = licenseMonitor.getSnapshot().state === 'trial'
  const { device } = pairing
  const actions = [buy, () => void update(), back]
  return <Modal ariaLabel={t('portal.licenseBlocked')} onBack={back}
    onDirection={direction => setFocused(current => direction === 'left' || direction === 'up'
      ? Math.max(0, current - 1) : Math.min(actions.length - 1, current + 1))}
    onSelect={() => actions[focused]?.()}>
    <div className="portal-pairing">
    <h2>{t('portal.licenseBlocked')}</h2>
    <p className="portal-pairing-text"><b>{t(trial ? 'portal.gate.trialEnded' : 'portal.gate.licenseEnded')}</b></p>
    <p className="portal-pairing-text">{t('portal.gate.steps', { site: pairing.site ?? '' })}</p>
    {connection ? <div className="portal-pairing-hero">
      <div className="portal-pairing-qr">
        <div className="portal-pairing-qr-frame">
          {pairing.qrUrl ? <FixedQr value={pairing.qrUrl} label={t('portal.qrAlt')} />
            : <p className="portal-pairing-text" role={pairing.state === 'loading' ? 'status' : undefined}>
              {pairing.state === 'loading' ? t('portal.pairing.loading') : '—'}</p>}
        </div>
      </div>
      <dl className="portal-pairing-credentials">
        <div><dt>{t('portal.pairing.deviceId')}</dt><dd><span className="portal-pairing-value">{device?.displayId ?? '—'}</span></dd></div>
        <div><dt>{t('portal.pairing.deviceKey')}</dt><dd><span className="portal-pairing-value">{device?.displayId ? device.deviceKey : '—'}</span></dd></div>
      </dl>
    </div> : <p className="portal-pairing-text">{t('portal.unconfigured')}</p>}
    {pairing.state === 'failed' && !pairing.qrUrl && <>
      <p className="portal-pairing-text" role="alert">{t('portal.gate.noConnection')}</p>
      {pairing.code && <p className="portal-pairing-text">{t('portal.failureCode', { code: pairing.code })}</p>}
    </>}
    <RefreshStatusLine action={refresh} scope="license" />
    {noPurchase && refresh.status !== 'loading' && <p className="portal-refresh-status" role="status">{t('portal.gate.noPurchase')}</p>}
    <div className="portal-pairing-actions">
      {/* Sem portal configurado o bloqueio já mostra `portal.unconfigured` acima; o botão fica focável e inerte. */}
      <Button focused={focused === 0} variant="accent" softDisabled={!purchase} onSelect={buy}>{t('portal.buy')}</Button>
      <RefreshButton action={refresh} focused={focused === 1} variant="secondary" onRun={() => void update()} />
      <Button focused={focused === 2} variant="secondary" onSelect={back}>{t('portal.licenseBack')}</Button>
    </div>
    </div>
  </Modal>
}
