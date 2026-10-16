import { commercialBuild, licenseMonitor } from '../../lib/licensing/licenseRuntime'
import { openPixPurchase } from '../../lib/licensing/pixPurchaseRuntime'
import { usePortalRecovery } from './usePortalRecovery'
import { liveQuery } from 'dexie'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { Button } from '../../components/Button'
import { useT } from '../../lib/i18n/I18nProvider'
import { PortalRequestError } from '../../lib/portal/portalClient'
import type { PortalConnection, PortalInvite } from '../../lib/portal/portalConnection'
import { buildFixedQrUrl } from '../../lib/portal/fixedQr'
import { getPortalConnection } from '../../lib/portal/portalRuntime'
import { portalTables, type PortalDeviceRecord } from '../../lib/portal/portalTables'
import { portalSite } from '../../lib/portal/usePairingCredentials'
import { useRefreshAction } from '../../lib/portal/useRefreshAction'
import { FixedQr } from '../../components/FixedQr'
import { RefreshStatusLine } from '../../components/RefreshButton'
import { PortalPrivateDialog, type PortalDialogKind } from './PortalPrivateDialog'
import { BACKUP_ACTION_COUNT, PortalBackupActions, type BackupActionsHandle } from './PortalBackupActions'
import './portalLicense.css'
/**
 * 0–5 são as ações de sempre; 6 é o Atualizar da licença (071); 7 é Comprar/Renovar licença por Pix (073);
 * 8–11 são backup e Desvincular (072), por último.
 */
const BACKUP_FIRST = 8
export const PORTAL_ACTION_COUNT = BACKUP_FIRST + BACKUP_ACTION_COUNT
const REFRESH_ACTION = 6
const PURCHASE_ACTION = 7
export interface PortalPanelHandle { activate: (index: number) => void }
export function PortalLicensePanel({ focusedAction, handleRef, connection: provided, onActionFocus }: {
  focusedAction?: number; handleRef: Ref<PortalPanelHandle>; connection?: PortalConnection; onActionFocus?: (index: number) => void
}) {
  const t = useT()
  const license = useSyncExternalStore(licenseMonitor.subscribe, licenseMonitor.getSnapshot)
  let connection: PortalConnection | undefined
  try { connection = provided ?? getPortalConnection() } catch { /* Configuração inválida vira estado acionável. */ }
  const [device, setDevice] = useState<PortalDeviceRecord>()
  // Convite da recuperação pelo site (069): PNG do serviço com validade curta. O acesso ao painel usa o QR fixo.
  const [invite, setInvite] = useState<PortalInvite>()
  // QR fixo (071): montado na TV com ID e chave no fragmento; aparece só por ação explícita aqui (constitution 1.11.0).
  const [qrUrl, setQrUrl] = useState<string>()
  const refresh = useRefreshAction('license')
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<'portal.failure' | 'portal.recoveryNeeded' | 'portal.pix.unavailable'>()
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
  const backupActions = useRef<BackupActionsHandle>(null)
  const privacyGeneration = useRef(0)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; privacyGeneration.current++ } }, [])
  const expiresAt = invite ? Date.parse(invite.expiresAt) : 0
  const valid = !!invite && now < expiresAt && document.visibilityState !== 'hidden'
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
    const update = () => { setNow(Date.now()); if (document.visibilityState === 'hidden') { privacyGeneration.current++; setInvite(undefined); setQrUrl(undefined) } }
    const timer = setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('pageshow', update)
    const hide = () => { privacyGeneration.current++; setInvite(undefined); setQrUrl(undefined) }
    window.addEventListener('pagehide', hide)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update);
      window.removeEventListener('pageshow', update); window.removeEventListener('pagehide', hide) }
  }, [])
  async function run(action: 'invite' | 'revoke' | 'rotate' | 'recovery') {
    if (!connection || working.current) return
    const generation = privacyGeneration.current
    working.current = true; setBusy(true); setFailure(undefined); setFailureCode(undefined)
    try {
      if (action === 'invite') {
        // 071/D-007: QR local (sem convite, sem requisição além do cadastro único); a pessoa pediu para ver.
        const paired = await connection.ensurePairing()
        const url = buildFixedQrUrl({ site: portalSite(connection), displayId: paired.displayId ?? '', deviceKey: paired.deviceKey })
        if (mounted.current && generation === privacyGeneration.current && document.visibilityState !== 'hidden') { setInvite(undefined); setQrUrl(url) }
      } else if (action === 'recovery') {
        const result = await connection.recovery()
        setRecovering(true); setRecoveryDeviceId(result.deviceId)
        if (mounted.current && generation === privacyGeneration.current && document.visibilityState !== 'hidden') { setQrUrl(undefined); setInvite(result.invite); setNow(Date.now()) }
      } else {
        setInvite(undefined); setQrUrl(undefined)
        await connection.rotate(action)
        setChanged(true)
      }
    } catch (error) {
      setFailure(error instanceof PortalRequestError && error.code === 'conflict' ? 'portal.recoveryNeeded' : 'portal.failure')
      setFailureCode(error instanceof PortalRequestError ? error.code : error instanceof Error ? error.name : 'unexpected_error')
    } finally { working.current = false; setBusy(false) }
  }
  function activate(index: number) {
    if (index >= BACKUP_FIRST) { backupActions.current?.activate(index - BACKUP_FIRST); return }
    if (index === REFRESH_ACTION) { void refresh.run(); return }
    if (index === PURCHASE_ACTION) {
      // 073/D-010: a tela de Pix é aberta por quem a registrou (usePortalIntegration); a volta devolve o foco aqui.
      const back = () => onActionFocus?.(PURCHASE_ACTION)
      if (!openPixPurchase({ onLicensed: back, onBack: back })) setFailure('portal.pix.unavailable')
      return
    }
    if (busy || !connection) return
    if (index === 5) { void run('recovery'); return }
    if (index === 0) { void run('invite'); return }
    if (!device) { setFailure('portal.failure'); return }
    setDialog(index === 1 ? 'key' : index === 2 ? 'revoke' : index === 3 ? 'code' : 'rotate')
  }
  useImperativeHandle(handleRef, () => ({ activate }))
  const labels = ['portal.open', 'portal.showKey', 'portal.revoke', 'portal.showCode', 'portal.rotateCode', 'portal.recover', 'portal.refresh.label'] as const
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
    <RefreshStatusLine action={refresh} scope="license" />
    <div className={`portal-content${valid || qrUrl ? ' has-qr' : ''}`}>
    {valid && <div className="portal-qr"><img src={invite.qrDataUrl} alt={t('portal.qrAlt')} />
      <p role="status">{t('portal.expiry', { seconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)) })}</p></div>}
    {qrUrl && <div className="portal-qr"><FixedQr value={qrUrl} label={t('portal.qrAlt')} /></div>}
    {invite && !valid && <p role="status">{t('portal.expired')}</p>}
    <div className="portal-actions">{labels.map((label, index) => <Button key={label} variant={index === 0 ? 'accent' : 'secondary'}
      focused={focusedAction === index && !dialog}
      loading={index === REFRESH_ACTION ? refresh.status === 'loading' : busy}
      softDisabled={index === REFRESH_ACTION ? refresh.paused : !connection}
      onSelect={() => { onActionFocus?.(index); activate(index) }}>{t(label)}</Button>)}
      <Button variant="accent" focused={focusedAction === PURCHASE_ACTION && !dialog} softDisabled={!connection || !commercialBuild}
        onSelect={() => { onActionFocus?.(PURCHASE_ACTION); activate(PURCHASE_ACTION) }}>
        {t(license.state === 'active' ? 'portal.renew' : 'portal.buy')}</Button></div>
    </div>
    <PortalBackupActions connection={connection} handleRef={backupActions}
      focusedIndex={focusedAction !== undefined && focusedAction >= BACKUP_FIRST && !dialog ? focusedAction - BACKUP_FIRST : undefined}
      onActionFocus={index => onActionFocus?.(BACKUP_FIRST + index)} />
    {dialog && <PortalPrivateDialog kind={dialog} device={device} onCancel={() => setDialog(undefined)}
      onConfirm={() => { const action = dialog; setDialog(undefined); if (action === 'revoke' || action === 'rotate') void run(action) }} />}
  </section>
}
