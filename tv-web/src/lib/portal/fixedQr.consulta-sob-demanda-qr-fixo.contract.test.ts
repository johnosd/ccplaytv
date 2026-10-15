import { expect, it } from 'vitest'
import { buildFixedQrUrl } from './fixedQr'

const site = 'https://portal.exemplo.test'

// US5/AC1-AC3, FR-013, FR-014, FR-016, Constitution: Segredos — chave só no fragmento, igual até a chave mudar
it('QR fixo: endereço + ID + chave só no fragmento, estável, muda só com a chave e recusa dados inválidos', () => {
  const url = buildFixedQrUrl({ site, displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '0123456789' })
  const parsed = new URL(url)
  expect(parsed.origin).toBe(site)
  expect(parsed.pathname).toBe('/')
  expect(parsed.search).toBe('')
  const fragment = new URLSearchParams(parsed.hash.slice(1))
  expect(fragment.get('id')).toBe('A0:8C:FD:19:0A:8C')
  expect(fragment.get('key')).toBe('0123456789')

  expect(buildFixedQrUrl({ site, displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '0123456789' })).toBe(url)
  expect(buildFixedQrUrl({ site, displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '9876543210' })).not.toBe(url)

  expect(() => buildFixedQrUrl({ site, displayId: 'não-é-mac', deviceKey: '0123456789' })).toThrow()
  expect(() => buildFixedQrUrl({ site, displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '123' })).toThrow()
  expect(() => buildFixedQrUrl({ site: 'http://inseguro.test', displayId: 'A0:8C:FD:19:0A:8C', deviceKey: '0123456789' })).toThrow()
})