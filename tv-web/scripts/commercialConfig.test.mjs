import { generateKeyPairSync } from 'node:crypto'
import { expect, it } from 'vitest'
import { validateCommercialConfig } from './commercialConfig.mjs'
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const publicKey = pair.publicKey.export({ format: 'jwk' })
const env = { VITE_PORTAL_ORIGIN: 'https://portal.fixture.test', VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ fixture: publicKey }) }
it('build comercial exige HTTPS e chave pública EC válida embutida', () => {
  expect(() => validateCommercialConfig(env)).not.toThrow()
  for (const origin of ['http://portal.fixture.test', 'https://private@portal.fixture.test', 'https://portal.fixture.test/path', 'https://portal.fixture.test/#private'])
    expect(() => validateCommercialConfig({ ...env, VITE_PORTAL_ORIGIN: origin })).toThrow('commercial_configuration_required')
})
it('chave privada nunca é aceita para pacote cliente', () => {
  expect(() => validateCommercialConfig({ ...env, VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ fixture: pair.privateKey.export({ format: 'jwk' }) }) })).toThrow('commercial_configuration_required')
})
it('ausência, kid inválido e coordenadas inválidas recusam build', () => {
  for (const keys of [{}, { 'invalid/kid': publicKey }, { fixture: { ...publicKey, x: 'invalid' } }, []])
    expect(() => validateCommercialConfig({ ...env, VITE_LICENSE_PUBLIC_KEYS: JSON.stringify(keys) })).toThrow('commercial_configuration_required')
})
