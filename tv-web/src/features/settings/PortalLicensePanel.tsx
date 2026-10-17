import { useImperativeHandle, useState, useSyncExternalStore, type Ref } from 'react'
import { Button } from '../../components/Button'
import { useT } from '../../lib/i18n/I18nProvider'
import { commercialBuild, licenseMonitor } from '../../lib/licensing/licenseRuntime'
import { openPixPurchase } from '../../lib/licensing/pixPurchaseRuntime'
import type { PortalConnection } from '../../lib/portal/portalConnection'
import { getPortalConnection } from '../../lib/portal/portalRuntime'
import { usePairingCredentials } from '../../lib/portal/usePairingCredentials'
import { useRefreshAction } from '../../lib/portal/useRefreshAction'
import { PortalAccessCard } from './PortalAccessCard'
import { PortalAdvanced } from './PortalAdvanced'
import { PortalConfirmDialog } from './PortalConfirmDialog'
import { PortalLicenseCard } from './PortalLicenseCard'
import { ADVANCED_ACTIONS, initialMain, mainActions, pairingNeedsAction, resolveAction, type AdvancedActionId, type PortalActionId, type PortalView } from './portalActions'
import { useCodeReveal } from './useCodeReveal'
import { usePortalAccess } from './usePortalAccess'
import './portalLicense.css'

/**
 * `actions`/`initial` são as ações e o foco de entrada **da visão atual**; `mainInitial` é o foco ao (re)entrar na aba.
 * A aba os lê ao tratar uma tecla (por id, nunca por índice — D-001; o handle é recriado a cada render).
 */
export interface PortalPanelHandle {
  activate: (id: PortalActionId) => void
  actions: PortalActionId[]
  initial: PortalActionId
  mainInitial: PortalActionId
}

/**
 * Portal & licença (feature 076): a tela principal tem os cartões Acessar o portal e Licença (só no build comercial),
 * o lembrete do código de recuperação e o botão Avançado. Só compõe; o vínculo vem de `usePairingCredentials` e as
 * ações raras de `usePortalAccess`. A visão (`view`) e o foco são da aba.
 */
export function PortalLicensePanel({ view, focused, focusedId, handleRef, connection: provided, onActionFocus, onView }: {
  view: PortalView; focused: boolean; focusedId: PortalActionId | undefined; handleRef: Ref<PortalPanelHandle>
  connection?: PortalConnection; onActionFocus?: (id: PortalActionId) => void; onView?: (view: PortalView, focus: PortalActionId) => void
}) {
  const t = useT()
  // Lidos na renderização (R-004 da 075): o teste do build comercial troca o valor por getter.
  const commercial = commercialBuild
  const license = useSyncExternalStore(licenseMonitor.subscribe, licenseMonitor.getSnapshot)
  let connection: PortalConnection | undefined
  try { connection = provided ?? getPortalConnection() } catch { /* Configuração inválida vira estado acionável. */ }
  const pairing = usePairingCredentials(connection)
  const access = usePortalAccess(connection)
  const refresh = useRefreshAction('license')
  const [purchaseUnavailable, setPurchaseUnavailable] = useState(false)
  /** Confirmação aberta por cima do Avançado (rotação ou Desvincular); um diálogo por vez. */
  const [step, setStep] = useState<'rotate' | 'unlink'>()
  // O código só existe na subtela: sair do Avançado o oculta (D-005).
  const reveal = useCodeReveal(pairing.device, view === 'advanced')

  const main = mainActions({ pairingFailed: pairingNeedsAction(!!connection, pairing).needed, commercial })
  const mainInitial = initialMain(main, { commercial, licenseState: license.state })
  const actions: PortalActionId[] = view === 'main' ? main : ADVANCED_ACTIONS
  const initial: PortalActionId = view === 'main' ? mainInitial : 'eye'
  const current = focused && !step ? resolveAction(actions, initial, focusedId) : undefined
  const paired = !!connection && !!pairing.device

  function activate(id: PortalActionId) {
    if (id === 'retry') { void pairing.retry(); return }
    if (id === 'refresh') { void refresh.run(); return }
    if (id === 'advanced') { onView?.('advanced', 'eye'); return }
    if (id === 'eye') { reveal.toggle(); return }
    // Indisponível (sem vínculo/conexão): soft-disabled, o motivo já está na tela; nada abre.
    if ((id === 'rotate' || id === 'unlink') && paired) { setStep(id); return }
    if (id === 'recover' && connection) {
      // O QR temporário substitui o fixo na principal (D-007): volta para lá e começa a recuperação.
      onView?.('main', 'advanced'); void access.startRecovery(); return
    }
    if (id === 'purchase') {
      // 073/D-010: a tela de Pix é aberta por quem a registrou (usePortalIntegration); a volta devolve o foco aqui.
      const back = () => onActionFocus?.('purchase')
      setPurchaseUnavailable(!openPixPurchase({ onLicensed: back, onBack: back }))
    }
  }
  useImperativeHandle(handleRef, () => ({ activate, actions, initial, mainInitial }))
  /** Confirmou: volta à principal, onde o resultado (nova chave, TV desvinculada) aparece (FR-010/FR-012). */
  function confirm() {
    const action = step
    setStep(undefined); onView?.('main', 'advanced')
    void (action === 'rotate' ? access.rotate() : access.unlink())
  }
  const select = (id: PortalActionId) => { onActionFocus?.(id); activate(id) }

  if (view === 'advanced') {
    return <>
      <PortalAdvanced device={pairing.device} reveal={reveal} available={{ rotate: paired, recover: !!connection, unlink: paired }}
        focusedId={current as AdvancedActionId | undefined} onSelect={select} />
      {step && <PortalConfirmDialog busy={access.busy} onCancel={() => setStep(undefined)} onConfirm={confirm}
        title={t(step === 'rotate' ? 'portal.rotateAllTitle' : 'portal.unlinkTitle')} text={t(step === 'rotate' ? 'portal.rotateAllHint' : 'portal.unlinkText')}
        confirmLabel={t(step === 'rotate' ? 'portal.rotateAll' : 'portal.unlink')} />}
    </>
  }

  return <section className="portal-license-panel" aria-label={t('portal.title')}>
    <h2>{t('portal.title')}</h2><p>{t('portal.description')}</p>
    <div className={`portal-cards${commercial ? '' : ' is-single'}`}>
      <PortalAccessCard connected={!!connection} pairing={pairing} retryFocused={current === 'retry'} onRetry={() => select('retry')}
        recovery={access.invite && { qrDataUrl: access.invite.qrDataUrl, seconds: access.seconds }} />
      {commercial && <PortalLicenseCard license={license} refresh={refresh} connected={!!connection} focusedId={current} onSelect={select} />}
    </div>
    {connection && <p className="portal-code-reminder">{t('portal.codeReminder')}</p>}
    {access.recovering && !access.invite && <p role="status">{t('portal.recoveryWaiting')}</p>}
    {access.expired && <p role="status">{t('portal.expired')}</p>}
    {access.outcome && <p role="status">{t(access.outcome)}</p>}
    {access.failure && <p role="alert">{t(access.failure)}</p>}
    {access.failure && access.failureCode && <p>{t('portal.failureCode', { code: access.failureCode })}</p>}
    {purchaseUnavailable && <p role="alert">{t('portal.pix.unavailable')}</p>}
    <div className="portal-card-actions">
      <Button variant="secondary" focused={current === 'advanced'} loading={access.busy} onSelect={() => select('advanced')}>{t('portal.advanced')}</Button>
    </div>
  </section>
}
