import { createPublicKey } from 'node:crypto'
import { revokedLicenseKeys } from './revokedLicenseKeys.mjs'
const revoked = new Set(revokedLicenseKeys.map(key => key.x + '.' + key.y))
export function validateCommercialConfig(env) {
  try {
    const origin = new URL(env.VITE_PORTAL_ORIGIN)
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error()
    const keys = JSON.parse(env.VITE_LICENSE_PUBLIC_KEYS)
    if (!keys || typeof keys !== 'object' || Array.isArray(keys) || !Object.keys(keys).length) throw new Error()
    for (const [kid, key] of Object.entries(keys)) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(kid) || !key || key.kty !== 'EC' || key.crv !== 'P-256' || key.d !== undefined || !/^[A-Za-z0-9_-]{43}$/.test(key.x) || !/^[A-Za-z0-9_-]{43}$/.test(key.y)) throw new Error()
      // 081/D-007: chave revogada nunca entra no pacote, sob qualquer kid.
      if (revoked.has(key.x + '.' + key.y)) throw new Error()
      createPublicKey({ key, format: 'jwk' })
    }
  } catch { throw new Error('commercial_configuration_required') }
}
