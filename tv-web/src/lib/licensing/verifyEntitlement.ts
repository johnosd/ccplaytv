import type { VerifiedEntitlement } from './playbackAccess'
export interface SignedEntitlement extends VerifiedEntitlement { generation: number; serverTime: number; kid: string }
export interface LicenseAuthority { issuer: string; audience: string; deviceId: string; keys: Readonly<Record<string, JsonWebKey>>; minimumGeneration: number }
export class EntitlementError extends Error { constructor() { super('invalid_entitlement') } }
const encoder = new TextEncoder()
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new EntitlementError()
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4))
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== value) throw new EntitlementError()
  return bytes
}
function object(part: string): Record<string, unknown> {
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(decode(part))
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EntitlementError()
  // O emissor usa JSON canônico plano. Comparação também recusa chaves duplicadas.
  const sorted = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  if (JSON.stringify(sorted) !== raw) throw new EntitlementError()
  return sorted
}
export async function verifyEntitlement(jws: string, authority: LicenseAuthority, cryptoApi: Crypto = crypto): Promise<SignedEntitlement> {
  try {
    if (typeof jws !== 'string' || jws.length > 16384 || !Number.isSafeInteger(authority.minimumGeneration) || authority.minimumGeneration < 0) throw new EntitlementError()
    const parts = jws.split('.')
    if (parts.length !== 3) throw new EntitlementError()
    const header = object(parts[0]), claims = object(parts[1])
    if (Object.keys(header).join(',') !== 'alg,kid,typ' || header.alg !== 'ES256' || header.typ !== 'JWT' ||
        typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(header.kid) || !Object.hasOwn(authority.keys, header.kid)) throw new EntitlementError()
    if (Object.keys(claims).join(',') !== 'aud,deviceId,expiresAt,generation,iss,serverTime,startsAt,state' ||
        claims.iss !== authority.issuer || claims.aud !== authority.audience || claims.deviceId !== authority.deviceId ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(authority.deviceId) ||
        !['trial', 'active', 'revoked'].includes(String(claims.state))) throw new EntitlementError()
    for (const key of ['generation', 'startsAt', 'expiresAt', 'serverTime']) {
      if (typeof claims[key] !== 'number' || !Number.isSafeInteger(claims[key]) || claims[key] < 0) throw new EntitlementError()
    }
    if ((claims.generation as number) < authority.minimumGeneration || (claims.expiresAt as number) <= (claims.startsAt as number)) throw new EntitlementError()
    const jwk = authority.keys[header.kid]
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.d !== undefined) throw new EntitlementError()
    const key = await cryptoApi.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const signature = decode(parts[2])
    if (signature.byteLength !== 64 || !await cryptoApi.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
      signature, encoder.encode(parts[0] + '.' + parts[1]))) throw new EntitlementError()
    return { deviceId: authority.deviceId, startsAt: claims.startsAt as number, expiresAt: claims.expiresAt as number,
      state: claims.state as SignedEntitlement['state'], generation: claims.generation as number, serverTime: claims.serverTime as number, kid: header.kid }
  } catch { throw new EntitlementError() }
}
