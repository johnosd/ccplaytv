import { expect, it } from 'vitest'
import { verifyEntitlement, type LicenseAuthority } from './verifyEntitlement'
const encode = (value: string | Uint8Array) => btoa(typeof value === 'string' ? value : String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
async function fixture() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const authority: LicenseAuthority = { deviceId: 'fixture', issuer: 'ccplaytv-portal', audience: 'ccplaytv', minimumGeneration: 2, keys: { current: publicKey } }
  const claims = { iss: authority.issuer, aud: authority.audience, deviceId: authority.deviceId, state: 'active', generation: 2, startsAt: 1000, expiresAt: 5000, serverTime: 2000 }
  async function sign(value: Record<string, unknown> = claims, header = { alg: 'ES256', kid: 'current', typ: 'JWT' }, raw?: string) {
    const input = encode(canonical(header)) + '.' + encode(raw ?? canonical(value))
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(input))
    return input + '.' + encode(new Uint8Array(signature))
  }
  return { authority, claims, sign }
}
it('ES256 real verifica destino/issuer/audience/kid/geração e detecta adulteração', async () => {
  const { authority, claims, sign } = await fixture()
  const token = await sign()
  expect(await verifyEntitlement(token, authority)).toMatchObject({ deviceId: 'fixture', generation: 2, expiresAt: 5000, kid: 'current' })
  for (const change of [{ deviceId: 'other' }, { issuer: 'other' }, { audience: 'other' }, { minimumGeneration: 3 }, { keys: {} }]) {
    await expect(verifyEntitlement(token, { ...authority, ...change })).rejects.toThrow('invalid_entitlement')
  }
  const parts = token.split('.')
  parts[1] = encode(canonical({ ...claims, expiresAt: 9000 }))
  await expect(verifyEntitlement(parts.join('.'), authority)).rejects.toThrow('invalid_entitlement')
})
it('schema, JSON duplicado, algoritmo e números inválidos são recusados mesmo assinados', async () => {
  const { authority, claims, sign } = await fixture()
  for (const change of [{ generation: 1 }, { generation: 2.5 }, { serverTime: -1 }, { startsAt: 6000 }, { extra: 'future-secret' }, { state: 'other' }]) {
    await expect(verifyEntitlement(await sign({ ...claims, ...change }), authority)).rejects.toThrow('invalid_entitlement')
  }
  await expect(verifyEntitlement(await sign(claims, { alg: 'HS256', kid: 'current', typ: 'JWT' }), authority)).rejects.toThrow('invalid_entitlement')
  await expect(verifyEntitlement(await sign(claims, undefined, canonical(claims).replace('"generation":2', '"generation":1,"generation":2')), authority)).rejects.toThrow('invalid_entitlement')
})
