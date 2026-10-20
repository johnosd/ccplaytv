import type { CatalogDb } from '../catalog/db'
import { portalTables, type LicenseCacheRecord } from '../portal/portalTables'
import { TrustedClock, type ClockCheckpoint } from './trustedClock'
import { EntitlementError, verifyEntitlement, type LicenseAuthority, type SignedEntitlement } from './verifyEntitlement'
import { withStorageRelief } from '../catalog/storageRelief'
function floor(record: LicenseCacheRecord | undefined) {
  if (!record) return 0
  if (!Number.isSafeInteger(record.generation) || record.generation < 0 || !Number.isFinite(record.timeHighWatermark) || record.timeHighWatermark < 0) throw new EntitlementError()
  return record.generation
}
export async function storeLicense(database: CatalogDb, jws: string, authority: LicenseAuthority, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0) throw new EntitlementError()
  const tables = portalTables(database)
  for (let attempt = 0; attempt < 5; attempt++) {
    const previous = await tables.license.get('entitlement')
    if (previous && previous.deviceId !== authority.deviceId) throw new EntitlementError()
    let observed = Math.max(authority.minimumGeneration, floor(previous))
    let priorVerified: SignedEntitlement | undefined
    if (previous) {
      try { priorVerified = await verifyEntitlement(previous.jws, { ...authority, minimumGeneration: 0 }); observed = Math.max(observed, priorVerified.generation) }
      catch { /* Cache inválido não autoriza; só uma nova assinatura aceita pode repará-lo. */ }
    }
    const verified = await verifyEntitlement(jws, { ...authority, minimumGeneration: observed })
    if (priorVerified && priorVerified.generation === verified.generation &&
        (priorVerified.state !== verified.state || priorVerified.startsAt !== verified.startsAt || priorVerified.expiresAt !== verified.expiresAt)) throw new EntitlementError()
    // Licença paga não pode deixar de ser gravada por catálogo cheio: libera cache refazível e repete (bug
    // armazenamento-app-cheio-na-tv-impede). Sem espaço mesmo assim, sobe StorageFullError (o Atualizar avisa).
    const saved = await withStorageRelief(() => database.transaction('rw', tables.device, tables.license, async () => {
      const device = await tables.device.get('device')
      const current = await tables.license.get('entitlement')
      if (!device || device.deviceId !== authority.deviceId) throw new EntitlementError()
      if (current?.jws !== previous?.jws || current?.generation !== previous?.generation) return undefined
      if (floor(current) > verified.generation) throw new EntitlementError()
      const record: LicenseCacheRecord = { id: 'entitlement', deviceId: authority.deviceId, jws,
        generation: verified.generation, signedServerTime: verified.serverTime,
        timeHighWatermark: Math.max(current?.timeHighWatermark ?? 0, verified.serverTime, now),
        lastSuccessfulSync: now, nextDueAt: now + 86400000 }
      await tables.license.put(record)
      return record
    }), database)
    if (saved) return { record: saved, entitlement: verified }
  }
  throw new EntitlementError()
}
export async function loadLicense(database: CatalogDb, authority: LicenseAuthority) {
  const tables = portalTables(database)
  const [device, record] = await Promise.all([tables.device.get('device'), tables.license.get('entitlement')])
  if (!record) return undefined
  if (!device || device.deviceId !== authority.deviceId || record.deviceId !== authority.deviceId) throw new EntitlementError()
  const entitlement = await verifyEntitlement(record.jws, { ...authority, minimumGeneration: Math.max(authority.minimumGeneration, floor(record)) })
  if (entitlement.generation !== record.generation || entitlement.serverTime !== record.signedServerTime) throw new EntitlementError()
  return { record, entitlement, clock: new TrustedClock(record) }
}
export async function checkpointLicenseClock(database: CatalogDb, deviceId: string, generation: number, checkpoint: ClockCheckpoint) {
  if (!Number.isFinite(checkpoint.timeHighWatermark) || checkpoint.timeHighWatermark < 0) throw new EntitlementError()
  const table = portalTables(database).license
  return withStorageRelief(() => database.transaction('rw', table, async () => {
    const saved = await table.get('entitlement')
    if (!saved || saved.deviceId !== deviceId || saved.generation !== generation) return false
    await table.put({ ...saved, timeHighWatermark: Math.max(saved.timeHighWatermark, checkpoint.timeHighWatermark) })
    return true
  }), database)
}
