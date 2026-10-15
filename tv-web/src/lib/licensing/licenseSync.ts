/** Exclusivamente chamado pelo agente de sincronização, nunca pelo player. */
import type { CatalogDb } from '../catalog/db'
import type { PortalConnection } from '../portal/portalConnection'
import { PortalRequestError } from '../portal/portalClient'
import { portalTables } from '../portal/portalTables'
import { storeLicense } from './licenseRepository'
import type { LicenseAuthority } from './verifyEntitlement'
export function createLicenseSync(database: CatalogDb, connection: PortalConnection, authority: (id: string) => LicenseAuthority) {
  return async (signal: AbortSignal) => {
    const device = await connection.ready()
    const tables = portalTables(database)
    const previous = await tables.license.get('entitlement')
    const response = await connection.client.request<{ jws: string }>('/portal/v1/device/entitlement/refresh', {
      bearer: device.bearer, body: previous?.deviceId === device.deviceId ? { previousJws: previous.jws } : {}, signal,
    })
    signal.throwIfAborted()
    const current = await tables.device.get('device')
    if (!current || current.deviceId !== device.deviceId || current.authEpoch !== device.authEpoch ||
      current.recoveryEpoch !== device.recoveryEpoch) throw new PortalRequestError('unauthorized')
    await storeLicense(database, response.jws, authority(device.deviceId))
  }
}
