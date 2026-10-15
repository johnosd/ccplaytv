/** Autoridade embutida no build; nenhuma chave recebida da rede ganha confiança. */
import { db } from '../catalog/db'
import { createLicenseMonitor } from './licenseMonitor'
import type { LicenseAuthority } from './verifyEntitlement'
export const commercialBuild = import.meta.env.MODE === 'commercial'
function publicKeys(): Readonly<Record<string, JsonWebKey>> {
  try {
    const value: unknown = JSON.parse(import.meta.env.VITE_LICENSE_PUBLIC_KEYS ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const keys = value as Record<string, JsonWebKey>
    if (Object.entries(keys).some(([kid, key]) => !/^[A-Za-z0-9_-]{1,80}$/.test(kid) || !key ||
      key.kty !== 'EC' || key.crv !== 'P-256' || key.d !== undefined || !key.x || !key.y)) return {}
    return Object.freeze(keys)
  } catch { return {} }
}
const keys = publicKeys()
export function licenseAuthority(deviceId: string): LicenseAuthority {
  return { deviceId, issuer: 'ccplaytv-portal', audience: 'ccplaytv', keys, minimumGeneration: 0 }
}
export const licenseMonitor = createLicenseMonitor(db, licenseAuthority)
const deniedListeners = new Set<(sourceId?: string) => void>()
export function onListEntryDenied(listener: (sourceId?: string) => void) {
  deniedListeners.add(listener)
  return () => { deniedListeners.delete(listener) }
}
/** Decisão local somente na entrada; expiração não encerra a lista já aberta. */
export function allowListEntry(sourceId?: string) {
  if (!commercialBuild || licenseMonitor.check().allowed) return true
  for (const listener of deniedListeners) listener(sourceId)
  return false
}
