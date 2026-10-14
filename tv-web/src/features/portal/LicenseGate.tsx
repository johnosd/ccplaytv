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
 * Bloqueio de entrada na lista (features 069 e 071, US2): mensagem do fim do teste, orientação de compra, QR fixo,
 * endereço, ID e chave visíveis, **Atualizar** (só a licença) e **Voltar**. Nada consulta sozinho: abrir cadastra o
 * dispositivo uma vez (D-004) e o botão é a única consulta. Liberada pelo botão, retoma a entrada que foi negada.
 */
export function LicenseGate({ onStop, onResume, activeSourceId, connection }: {
  onStop(sourceId?: string): void
  /** Chamado com a lista cuja entrada foi negada quando o Atualizar libera a licença (FR-007). */
  onResume?(sourceId: string): void
  activeSourceId?: string
  connection?: PortalConnection
}) {
  const t = useT()
  const [blocked, setBlocked] = useState(false)
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
      setFocused(0); setNoPurchase(false); setBlocked(true)
    }
    const stop = onListEntryDenied(block)
    const changed = licenseMonitor.subscribe(() => {
      const next = licenseMonitor.check()
      // Revogação confirmada mantém o encerramento; vencimento só barra a próxima entrada.
      if (next.reason === 'revoked' && previous !== 'revoked' && callbacks.current.activeSourceId) block()
      previous = next.reason
      if (next.allowed) setBlocked(false)
    })
    return () => { stop(); changed() }
  }, [])
  if (!blocked) return null
  const back = () => setBlocked(false)
  const update = async () => {
    setNoPurchase(false)
    const result = await refresh.run()
    if (!result.ok) return
    if (await waitUntilAllowed()) {
      const sourceId = denied.current
      denied.current = undefined
      setBlocked(false)
      if (sourceId) callbacks.current.onResume?.(sourceId)
    } else setNoPurchase(true)
  }
  const trial = licenseMonitor.getSnapshot().state === 'trial'
  const { device } = pairing
  return <Modal ariaLabel={t('portal.licenseBlocked')} onBack={back}
    onDirection={direction => { if (direction === 'left' || direction === 'up') setFocused(0); else setFocused(1) }}
    onSelect={() => focused === 0 ? void update() : back()}>
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
      <RefreshButton action={refresh} focused={focused === 0} variant="accent" onRun={() => void update()} />
      <Button focused={focused === 1} variant="secondary" onSelect={back}>{t('portal.licenseBack')}</Button>
    </div>
    </div>
  </Modal>
}
