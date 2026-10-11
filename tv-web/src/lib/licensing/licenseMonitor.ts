/** Observador local compartilhável: verifica cache e prazo, sem nenhuma rede. */
import { liveQuery } from 'dexie'
import type { CatalogDb } from '../catalog/db'
import { portalTables } from '../portal/portalTables'
import { checkpointLicenseClock, loadLicense } from './licenseRepository'
import { evaluatePlaybackAccess, type PlaybackAccessDecision } from './playbackAccess'
import type { LicenseAuthority } from './verifyEntitlement'
export interface LicenseSnapshot { decision: PlaybackAccessDecision; expiresAt?: number; state?: 'trial' | 'active' | 'revoked' }
export function createLicenseMonitor(database: CatalogDb, authority: (deviceId: string) => LicenseAuthority) {
  let snapshot: LicenseSnapshot = { decision: { allowed: false, reason: 'not_activated' } }
  const listeners = new Set<() => void>()
  let consumers = 0, sequence = 0
  let stop: (() => void) | undefined
  let loaded: Awaited<ReturnType<typeof loadLicense>>
  let lastCheckpoint = 0
  function publish(value: LicenseSnapshot) {
    if (value.decision.allowed === snapshot.decision.allowed && value.decision.reason === snapshot.decision.reason && value.expiresAt === snapshot.expiresAt && value.state === snapshot.state) return
    snapshot = value
    for (const listener of listeners) listener()
  }
  function tick() {
    if (!loaded) return
    const trustedNow = loaded.clock.now()
    publish({ decision: evaluatePlaybackAccess({ deviceId: loaded.record.deviceId, entitlement: loaded.entitlement,
      verification: 'valid', trustedNow, serviceOnline: false }), expiresAt: loaded.entitlement.expiresAt, state: loaded.entitlement.state })
    if (trustedNow - lastCheckpoint >= 30000) checkpoint()
  }
  function checkpoint() {
    if (!loaded) return
    const value = loaded.clock.checkpoint()
    lastCheckpoint = value.timeHighWatermark
    void checkpointLicenseClock(database, loaded.record.deviceId, loaded.record.generation, value).catch(() => {
      // A licença assinada não é revogada por falha de persistência; memória mantém floor.
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
      const hide = () => { checkpoint(); if (timer) clearInterval(timer); timer = undefined }
      const visibility = () => { if (document.visibilityState === 'hidden') hide(); else schedule() }
      const subscription = liveQuery(async () => {
        const tables = portalTables(database)
        return { device: await tables.device.get('device'), record: await tables.license.get('entitlement') }
      }).subscribe({ next: value => {
        const next = value.device?.deviceId + ':' + value.record?.jws + ':' + value.record?.generation
        if (next === fingerprint) return
        fingerprint = next
        const request = ++sequence
        if (loaded?.record.deviceId !== value.device?.deviceId) {
          loaded = undefined
          publish({ decision: { allowed: false, reason: 'not_activated' } })
        }
        if (!value.device || !value.record) { loaded = undefined; publish({ decision: { allowed: false, reason: 'not_activated' } }); return }
        void loadLicense(database, authority(value.device.deviceId)).then(result => {
          if (request !== sequence || consumers === 0) return
          loaded = result; lastCheckpoint = 0
          if (!result) publish({ decision: { allowed: false, reason: 'not_activated' } })
          tick()
        }).catch(() => { if (request === sequence && consumers > 0) { loaded = undefined; publish({ decision: { allowed: false, reason: 'invalid' } }) } })
      }, error: () => { sequence++; loaded = undefined; publish({ decision: { allowed: false, reason: 'invalid' } }) } })
      document.addEventListener('visibilitychange', visibility)
      window.addEventListener('pagehide', hide)
      window.addEventListener('pageshow', schedule)
      schedule()
      stop = () => { sequence++; hide(); subscription.unsubscribe(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', schedule); loaded = undefined }
    }
    let released = false
    return () => { if (released) return; released = true; if (--consumers === 0) { stop?.(); stop = undefined } }
  }
  return { start, check: () => consumers === 0 ? { allowed: false as const, reason: 'not_activated' as const } : loaded ? evaluatePlaybackAccess({ deviceId: loaded.record.deviceId,
    entitlement: loaded.entitlement, verification: 'valid', trustedNow: loaded.clock.now(), serviceOnline: false }) : snapshot.decision, getSnapshot: () => snapshot, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } } }
}
