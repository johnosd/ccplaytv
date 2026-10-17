import { expect, it } from 'vitest'
import { normalizeDeviceKey } from './deviceKey'

it('aceita a chave colada como a TV a mostra, com espaços, separadores e quebras', () => {
  expect(normalizeDeviceKey('370 362 8660')).toBe('3703628660')
  expect(normalizeDeviceKey(' 370-362-8660\n')).toBe('3703628660')
  expect(normalizeDeviceKey('370 362​8660')).toBe('3703628660')
  expect(normalizeDeviceKey('370.362.8660')).toBe('3703628660')
  expect(normalizeDeviceKey('3703628660')).toBe('3703628660')
})

it('não inventa nada: letras e dígitos a mais continuam como foram digitados', () => {
  expect(normalizeDeviceKey('37O 362 8660')).toBe('37O3628660')
  expect(normalizeDeviceKey('370 362 8660 1')).toBe('37036286601')
})
