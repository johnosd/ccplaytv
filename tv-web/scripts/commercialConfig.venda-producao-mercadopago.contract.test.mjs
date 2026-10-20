import { generateKeyPairSync } from 'node:crypto'
import { expect, it } from 'vitest'
import { validateCommercialConfig } from './commercialConfig.mjs'
import { revokedLicenseKeys } from './revokedLicenseKeys.mjs'

const origin = 'https://portal.fixture.test'
const fresh = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' })

// FR-007, US1/AC2: a chave da homologação comprometida (073 R-016) nunca entra num pacote comercial, nem com outro kid.
it('build comercial recusa chave pública revogada sob qualquer kid e aceita uma chave nova', () => {
  expect(revokedLicenseKeys.length).toBeGreaterThan(0)
  for (const { kty, crv, x, y } of revokedLicenseKeys) {
    for (const keys of [{ 'prod-renamed': { kty, crv, x, y } }, { prod: fresh, v1: { kty, crv, x, y } }])
      expect(() => validateCommercialConfig({ VITE_PORTAL_ORIGIN: origin, VITE_LICENSE_PUBLIC_KEYS: JSON.stringify(keys) }))
        .toThrow('commercial_configuration_required')
  }
  expect(() => validateCommercialConfig({ VITE_PORTAL_ORIGIN: origin, VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ prod: fresh }) }))
    .not.toThrow()
})
