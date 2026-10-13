import { commercialBuild, licenseMonitor } from '../../lib/licensing/licenseRuntime'
import { usePortalRecovery } from './usePortalRecovery'
import { liveQuery } from 'dexie'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { Button } from '../../components/Button'
import { useT } from '../../lib/i18n/I18nProvider'
import { PortalRequestError } from '../../lib/portal/portalClient'
import type { PortalConnection, PortalInvite } from '../../lib/portal/portalConnection'
import { acquirePortalQuick, getPortalConnection } from '../../lib/portal/portalRuntime'
import { portalTables, type PortalDeviceRecord } from '../../lib/portal/portalTables'
import { PortalPrivateDialog, type PortalDialogKind } from './PortalPrivateDialog'
import './portalLicense.css'
export const PORTAL_ACTION_COUNT = 6
export interface PortalPanelHandle { activate: (index: number) => void }
export function PortalLicensePanel({ focusedAction, handleRef, connection: provided, onActionFocus }: {
  focusedAction?: number; handleRef: Ref<PortalPanelHandle>; connection?: PortalConnection; onActionFocus?: (index: number) => void
}) {
  const t = useT()
  const license = useSyncExternalStore(licenseMonitor.subscribe, licenseMonitor.getSnapshot)
  let connection: PortalConnection | undefined
  try { connection = provided ?? getPortalConnection() } catch { /* Configuração inválida vira estado acionável. */ }
  const [device, setDevice] = useState<PortalDeviceRecord>()
  const [invite, setInvite] = useState<PortalInvite>()
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<'portal.failure' | 'portal.recoveryNeeded'>()
  // Código não secreto (lista fechada de PortalRequestError ou o nome do erro JS) para diagnosticar na TV, sem console.
  const [failureCode, setFailureCode] = useState<string>()
  const [changed, setChanged] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [recoveryDeviceId, setRecoveryDeviceId] = useState<string>()
  const recoveryReady = useCallback(() => { setRecovering(false); setInvite(undefined); setFailure(undefined); setChanged(true) }, [])
  const recoveryExpired = useCallback(() => { setRecovering(false); setInvite(undefined); setFailure('portal.recoveryNeeded') }, [])
  usePortalRecovery(connection, recovering, recoveryReady, recoveryExpired)
  const [dialog, setDialog] = useState<PortalDialogKind>()
  const working = useRef(false)
  const recoveryObserved = useRef(false)
  const privacyGeneration = useRef(0)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; privacyGeneration.current++ } }, [])
  const expiresAt = invite ? Date.parse(invite.expiresAt) : 0
  const valid = !!invite && now < expiresAt && document.visibilityState !== 'hidden'
  useEffect(acquirePortalQuick, [])
  useEffect(() => {
    if (!connection) return
    const sub = liveQuery(async () => {
      const tables = portalTables(connection.database)
      return { device: await tables.device.get('device'), bootstrap: await tables.bootstrap.get('bootstrap') }
    }).subscribe({
      next: value => {
        setDevice(value.device)
        if (value.bootstrap?.pendingRecovery || value.bootstrap?.pendingAck?.purpose === 'recovery') {
          recoveryObserved.current = true
          setRecovering(true)
          setRecoveryDeviceId(value.bootstrap.pendingRecovery?.deviceId ?? value.device?.deviceId)
        } else if (recoveryObserved.current && !value.bootstrap && value.device) {
          recoveryObserved.current = false
          recoveryReady()
        }
      }, error: () => setFailure('portal.failure'),
    })
    return () => sub.unsubscribe()
  }, [connection, recoveryReady])
  useEffect(() => {
    const update = () => { setNow(Date.now()); if (document.visibilityState === 'hidden') { privacyGeneration.current++; setInvite(undefined) } }
    const timer = setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('pageshow', update)
    const hide = () => { privacyGeneration.current++; setInvite(undefined) }
    window.addEventListener('pagehide', hide)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pageshow', update); window.removeEventListener('pagehide', hide) }
  }, [])
  async function run(action: 'invite' | 'revoke' | 'rotate' | 'recovery') {
    if (!connection || working.current) return
    const generation = privacyGeneration.current
    working.current = true; setBusy(true); setFailure(undefined); setFailureCode(undefined)
    try {
      if (action === 'invite' || action === 'recovery') {
        const result = action === 'recovery' ? await connection.recovery() : await connection.invite()
        if (action === 'recovery') { setRecovering(true); setRecoveryDeviceId(result.deviceId) }
        if (mounted.current && generation === privacyGeneration.current && document.visibilityState !== 'hidden') { setInvite(result.invite); setNow(Date.now()) }
      } else {
        setInvite(undefined)
        await connection.rotate(action)
        setChanged(true)
      }
    } catch (error) {
      setFailure(error instanceof PortalRequestError && error.code === 'conflict' ? 'portal.recoveryNeeded' : 'portal.failure')
      setFailureCode(error instanceof PortalRequestError ? error.code : error instanceof Error ? error.name : 'unexpected_error')
    } finally { working.current = false; setBusy(false) }
  }
  function activate(index: number) {
    if (busy || !connection) return
    if (index === 5) { void run('recovery'); return }
    if (index === 0) { void run('invite'); return }
    if (!device) { setFailure('portal.failure'); return }
    setDialog(index === 1 ? 'key' : index === 2 ? 'revoke' : index === 3 ? 'code' : 'rotate')
  }
  useImperativeHandle(handleRef, () => ({ activate }))
  const labels = ['portal.open', 'portal.showKey', 'portal.revoke', 'portal.showCode', 'portal.rotateCode', 'portal.recover'] as const
  return <section className="portal-license-panel" aria-label={t('portal.title')}>
    <h2>{t('portal.title')}</h2><p>{t('portal.description')}</p>
    {commercialBuild && <><p role="status">{t('portal.licenseStatus', { status: t(license.decision.reason === 'expired' ? 'portal.license_expired' : license.state ? ('portal.license_' + license.state) as 'portal.license_active' : 'portal.license_missing') })}</p>
      {license.expiresAt && <p>{t('portal.licenseExpiry', { date: new Date(license.expiresAt).toLocaleDateString() })}</p>}<p>{t('portal.licenseOffer')}</p></>}
    {!connection && <p role="status">{t('portal.unconfigured')}</p>}
    {!connection && import.meta.env.DEV && <p role="status">{t('portal.devHint')}</p>}
    {(device || recoveryDeviceId) && <p>{t('portal.deviceId', { id: device?.deviceId ?? recoveryDeviceId! })}</p>}
    {recovering && <p role="status">{t('portal.recoveryWaiting')}</p>}
    {connection && <p>{t('portal.site')}: {new URL(connection.origin).origin}</p>}
    {failure && <p role="alert">{t(failure)}</p>}
    {failure && failureCode && <p>{t('portal.failureCode', { code: failureCode })}</p>}
    {changed && <p role="status">{t('portal.changed')}</p>}
    <div className={`portal-content${valid ? ' has-qr' : ''}`}>
    {valid && <div className="portal-qr"><img src={invite.qrDataUrl} alt={t('portal.qrAlt')} />
      <p role="status">{t('portal.expiry', { seconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) })}</p></div>}
    {invite && !valid && <p role="status">{t('portal.expired')}</p>}
    <div className="portal-actions">{labels.map((label, index) => <Button key={label} variant={index === 0 ? 'accent' : 'secondary'}
      focused={focusedAction === index && !dialog} loading={busy} softDisabled={!connection}
      onSelect={() => { onActionFocus?.(index); activate(index) }}>{t(index === 0 && invite ? 'portal.renewQr' : label)}</Button>)}</div>
    </div>
    {dialog && <PortalPrivateDialog kind={dialog} device={device} onCancel={() => setDialog(undefined)}
      onConfirm={() => { const action = dialog; setDialog(undefined); if (action === 'revoke' || action === 'rotate') void run(action) }} />}
  </section>
}
