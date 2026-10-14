/** Observador local compartilhável: verifica cache, teste local e prazo, sem nenhuma rede. */
import { liveQuery } from 'dexie'
import type { CatalogDb } from '../catalog/db'
import { portalTables, type LocalTrialRecord } from '../portal/portalTables'
import { decideAccess, evaluateLocalTrial } from './localTrial'
import { checkpointLocalTrial, ensureLocalTrial } from './localTrialRepository'
import { checkpointLicenseClock, loadLicense } from './licenseRepository'
import { evaluatePlaybackAccess, type PlaybackAccessDecision } from './playbackAccess'
import { TrustedClock } from './trustedClock'
import type { LicenseAuthority } from './verifyEntitlement'
export interface LicenseSnapshot { decision: PlaybackAccessDecision; expiresAt?: number; state?: 'trial' | 'active' | 'revoked' }
export function createLicenseMonitor(database: CatalogDb, authority: (deviceId: string) => LicenseAuthority) {
  let snapshot: LicenseSnapshot = { decision: { allowed: false, reason: 'not_activated' } }
  const listeners = new Set<() => void>()
  let consumers = 0, sequence = 0
  let stop: (() => void) | undefined
  let loaded: Awaited<ReturnType<typeof loadLicense>>
  // 071/D-005: teste de 7 dias contado no aparelho; `startedAt` só encurta (âncora do serviço), nunca estende.
  let trial: { startedAt: number; clock: TrustedClock } | undefined
  let lastCheckpoint = 0, lastTrialCheckpoint = 0
  function publish(value: LicenseSnapshot) {
    if (value.decision.allowed === snapshot.decision.allowed && value.decision.reason === snapshot.decision.reason && value.expiresAt === snapshot.expiresAt && value.state === snapshot.state) return
    snapshot = value
    for (const listener of listeners) listener()
  }
  /** Licença assinada válida OU teste local vigente; `revoked` assinado vence (D-005). */
  function evaluate(): LicenseSnapshot & { licenseNow?: number; trialNow?: number } {
    const licenseNow = loaded?.clock.now()
    const license = loaded && licenseNow !== undefined ? evaluatePlaybackAccess({ deviceId: loaded.record.deviceId, entitlement: loaded.entitlement,
      verification: 'valid', trustedNow: licenseNow, serviceOnline: false }) : undefined
    const local = trial ? evaluateLocalTrial({ startedAt: trial.startedAt, highWatermark: trial.clock.now(), now: Date.now() }) : undefined
    const decision = decideAccess(license, local)
    const showLicense = loaded && license && (license.allowed || license.reason === 'revoked' || !local?.allowed)
    const shown = showLicense && loaded ? { expiresAt: loaded.entitlement.expiresAt, state: loaded.entitlement.state }
      : local ? { expiresAt: local.expiresAt, state: 'trial' as const } : {}
    return { decision, ...shown, licenseNow, trialNow: local?.trustedNow }
  }
  function tick() {
    if (!loaded && !trial) return
    const { licenseNow, trialNow, ...value } = evaluate()
    publish(value)
    if (licenseNow !== undefined && licenseNow - lastCheckpoint >= 30000) checkpoint()
    if (trialNow !== undefined && trialNow - lastTrialCheckpoint >= 30000) checkpointTrial()
  }
  function checkpoint() {
    if (!loaded) return
    const value = loaded.clock.checkpoint()
    lastCheckpoint = value.timeHighWatermark
    void checkpointLicenseClock(database, loaded.record.deviceId, loaded.record.generation, value).catch(() => {
      // A licença assinada não é revogada por falha de persistência; memória mantém floor.
    })
  }
  function checkpointTrial() {
    if (!trial) return
    const value = trial.clock.checkpoint()
    lastTrialCheckpoint = value.timeHighWatermark
    void checkpointLocalTrial(database, value.timeHighWatermark).catch(() => {
      // Falha de persistência não bloqueia; a memória mantém a marca d'água desta sessão.
    })
  }
  function adoptTrial(record: LocalTrialRecord) {
    if (!trial) trial = { startedAt: record.startedAt, clock: new TrustedClock({ timeHighWatermark: record.highWatermark, signedServerTime: 0 }) }
    else trial.startedAt = Math.min(trial.startedAt, record.startedAt)
    tick()
  }
  /** Primeira abertura do build comercial: herda o início da licença de teste verificada, nunca `now` (D-005). */
  function createTrial(hintStartedAt?: number) {
    void ensureLocalTrial(database, hintStartedAt).catch(() => {
      // Sem registro o teste local não vale (falha fechado); o JWS assinado continua decidindo.
    })
  }
  function start() {
    consumers++
    if (consumers === 1) {
      publish({ decision: { allowed: false, reason: 'not_activated' } })
      let timer: ReturnType<typeof setInterval> | undefined
      let fingerprint: string | undefined
      const schedule = () => {
        if (timer) clearInterval(timer)
        timer = undefined
        if (document.visibilityState !== 'hidden') { tick(); timer = setInterval(tick, 1000) }
      }
      const hide = () => { checkpoint(); checkpointTrial(); if (timer) clearInterval(timer); timer = undefined }
      const visibility = () => { if (document.visibilityState === 'hidden') hide(); else schedule() }
      const subscription = liveQuery(async () => {
        const tables = portalTables(database)
        return { device: await tables.device.get('device'), record: await tables.license.get('entitlement'), trial: await tables.localTrial.get('trial') }
      }).subscribe({ next: value => {
        if (value.trial) adoptTrial(value.trial)
        const next = value.device?.deviceId + ':' + value.record?.jws + ':' + value.record?.generation
        if (next === fingerprint) return
        fingerprint = next
        const request = ++sequence
        if (loaded?.record.deviceId !== value.device?.deviceId) {
          loaded = undefined
          publish({ decision: { allowed: false, reason: 'not_activated' } })
        }
        if (!value.device || !value.record) {
          loaded = undefined
          if (!value.trial) createTrial()
          if (trial) tick()
          else publish({ decision: { allowed: false, reason: 'not_activated' } })
          return
        }
        void loadLicense(database, authority(value.device.deviceId)).then(result => {
          if (request !== sequence || consumers === 0) return
          loaded = result; lastCheckpoint = 0
          if (!value.trial && !trial) createTrial(result?.entitlement.startsAt)
          if (!result && !trial) publish({ decision: { allowed: false, reason: 'not_activated' } })
          tick()
        }).catch(() => {
          if (request !== sequence || consumers === 0) return
          loaded = undefined
          if (!value.trial && !trial) createTrial()
          publish({ decision: { allowed: false, reason: 'invalid' } })
          tick()
        })
      }, error: () => { sequence++; loaded = undefined; publish({ decision: { allowed: false, reason: 'invalid' } }) } })
      document.addEventListener('visibilitychange', visibility)
      window.addEventListener('pagehide', hide)
      window.addEventListener('pageshow', schedule)
      schedule()
      stop = () => { sequence++; hide(); subscription.unsubscribe(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', schedule); loaded = undefined; trial = undefined }
    }
    let released = false
    return () => { if (released) return; released = true; if (--consumers === 0) { stop?.(); stop = undefined } }
  }
  return { start, check: () => consumers === 0 ? { allowed: false as const, reason: 'not_activated' as const } : loaded || trial ? evaluate().decision : snapshot.decision,
    getSnapshot: () => snapshot, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } } }
}
