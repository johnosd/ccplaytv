import { expect, it } from 'vitest'
import { formatDeviceKey } from './displayId'

it('agrupa a chave de 10 dígitos em 3-3-4 só para exibir', () => {
  expect(formatDeviceKey('1732049818')).toBe('173 204 9818')
  expect(formatDeviceKey('0000000000')).toBe('000 000 0000')
})

it('devolve como está o que não é uma chave de 10 dígitos', () => {
  for (const value of ['', '12345', '173 204 9818', '17320498181', 'abcdefghij']) expect(formatDeviceKey(value)).toBe(value)
})
