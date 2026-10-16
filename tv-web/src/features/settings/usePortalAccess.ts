import { liveQuery } from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MessageKey } from '../../lib/i18n/messages/pt'
import { PortalRequestError } from '../../lib/portal/portalClient'
import type { PortalConnection, PortalInvite } from '../../lib/portal/portalConnection'
import { refreshPortal, resetPortalAgent } from '../../lib/portal/portalRuntime'
import { portalTables } from '../../lib/portal/portalTables'
import { unlinkPortal } from '../../lib/portal/unlink'
import { usePortalRecovery } from './usePortalRecovery'

type Failure = 'portal.failure' | 'portal.recoveryNeeded'
type Outcome = Extract<MessageKey, 'portal.changed' | 'portal.unlinkDone' | 'portal.unlinkNoBackup'>

/**
 * Ações raras de Portal & licença (features 075/076, subtela "Avançado"): gerar nova chave e código (rotação única
 * `revoke`, D-006), recuperar pelo site (069) e desvincular (072). Cada uma é uma operação por vez; o convite de
 * recuperação nunca sobrevive a segundo plano e a resposta atrasada não o reexibe (privacidade, D-008).
 */
export function usePortalAccess(connection: PortalConnection | undefined) {
  const [invite, setInvite] = useState<PortalInvite>()
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [failure, setFailure] = useState<Failure>()
  // Código não secreto (lista fechada de PortalRequestError ou o nome do erro JS) para diagnosticar na TV, sem console.
  const [failureCode, setFailureCode] = useState<string>()
  const [outcome, setOutcome] = useState<Outcome>()
  const working = useRef(false)
  const recoveryObserved = useRef(false)
  const privacyGeneration = useRef(0)
  const mounted = useRef(false)

  const recoveryReady = useCallback(() => { setRecovering(false); setInvite(undefined); setFailure(undefined); setOutcome('portal.changed') }, [])
  const recoveryExpired = useCallback(() => { setRecovering(false); setInvite(undefined); setFailure('portal.recoveryNeeded') }, [])
  usePortalRecovery(connection, recovering, recoveryReady, recoveryExpired)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; privacyGeneration.current++ } }, [])

  // Recuperação pendente (write-ahead da 069): retoma o estado em vez de oferecer uma operação nova.
  useEffect(() => {
    if (!connection) return
    const subscription = liveQuery(async () => {
      const tables = portalTables(connection.database)
      return { device: await tables.device.get('device'), bootstrap: await tables.bootstrap.get('bootstrap') }
    }).subscribe({
      next: value => {
        if (value.bootstrap?.pendingRecovery || value.bootstrap?.pendingAck?.purpose === 'recovery') {
          recoveryObserved.current = true
          setRecovering(true)
        } else if (recoveryObserved.current && !value.bootstrap && value.device) {
          recoveryObserved.current = false
          recoveryReady()
        }
      },
      error: () => setFailure('portal.failure'),
    })
    return () => subscription.unsubscribe()
  }, [connection, recoveryReady])

  // Segundo plano descarta o convite (QR temporário); o QR fixo não é tratado aqui (ADR-019).
  useEffect(() => {
    const hide = () => { privacyGeneration.current++; setInvite(undefined) }
    const onVisibility = () => { if (document.visibilityState === 'hidden') hide() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', hide)
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', hide) }
  }, [])
  useEffect(() => {
    if (!invite) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [invite])

  async function run(work: (generation: number) => Promise<Outcome | undefined>) {
    if (!connection || working.current) return
    const generation = privacyGeneration.current
    working.current = true; setBusy(true); setFailure(undefined); setFailureCode(undefined); setOutcome(undefined)
    try { setOutcome(await work(generation)) } catch (error) {
      setFailure(error instanceof PortalRequestError && error.code === 'conflict' ? 'portal.recoveryNeeded' : 'portal.failure')
      setFailureCode(error instanceof PortalRequestError ? error.code : error instanceof Error ? error.name : 'unexpected_error')
    } finally { working.current = false; if (mounted.current) setBusy(false) }
  }

  const rotate = () => run(async () => {
    setInvite(undefined)
    await connection!.rotate('revoke')
    return 'portal.changed'
  })
  const startRecovery = () => run(async generation => {
    const result = await connection!.recovery()
    setRecovering(true)
    if (mounted.current && generation === privacyGeneration.current && document.visibilityState !== 'hidden') { setInvite(result.invite); setNow(Date.now()) }
    return undefined
  })
  const unlink = () => run(async () => {
    // Com internet, o backup vai antes de soltar o vínculo; sem internet, desvincula mesmo assim e avisa.
    const backedUp = navigator.onLine ? (await refreshPortal('backup')).ok : false
    resetPortalAgent()
    await unlinkPortal(connection!.database)
    return backedUp ? 'portal.unlinkDone' : 'portal.unlinkNoBackup'
  })

  const expiresAt = invite ? Date.parse(invite.expiresAt) : 0
  const valid = !!invite && now < expiresAt
  return {
    invite: valid ? invite : undefined,
    seconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)),
    expired: !!invite && !valid,
    recovering, busy, failure, failureCode, outcome,
    rotate, startRecovery, unlink,
  }
}
