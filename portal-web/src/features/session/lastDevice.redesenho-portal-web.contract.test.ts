// Contrato da feature 077 (ID lembrado na entrada). Travado pelo sdd-plan: o sdd-execute só faz passar.
import { expect, it } from 'vitest'
import { forgetDevice, readRememberedDevice, rememberDevice, type LastDeviceStorage } from './lastDevice'

function fakeStorage(options: { broken?: boolean } = {}) {
  const data = new Map<string, string>()
  const storage: LastDeviceStorage = {
    getItem: key => { if (options.broken) throw new Error('storage_blocked'); return data.get(key) ?? null },
    setItem: (key, value) => { if (options.broken) throw new Error('storage_blocked'); data.set(key, value) },
    removeItem: key => { if (options.broken) throw new Error('storage_blocked'); data.delete(key) },
  }
  return { storage, data }
}

it('US1-AC1/AC2/FR-003: lembra só o último ID válido (normalizado), esquece a pedido, ignora lixo e nunca lança sem storage', () => {
  const { storage, data } = fakeStorage()
  expect(readRememberedDevice(storage)).toBeUndefined()
  rememberDevice(storage, 'a0-8c-fd-19-0a-8c')
  expect(readRememberedDevice(storage)).toBe('A0:8C:FD:19:0A:8C')
  rememberDevice(storage, 'B6:56:12:BF:17:71')
  expect(readRememberedDevice(storage)).toBe('B6:56:12:BF:17:71')
  // ID com erro de digitação nunca substitui o último que funcionou.
  rememberDevice(storage, 'A0-8C-FD')
  rememberDevice(storage, '')
  expect(readRememberedDevice(storage)).toBe('B6:56:12:BF:17:71')
  // Só IDs no formato MAC chegam ao storage: nada que se pareça com a chave de 10 dígitos ou texto livre.
  rememberDevice(storage, '1732049818')
  for (const value of data.values()) expect(value).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/)
  // Valor corrompido guardado por outra versão é ignorado.
  data.set([...data.keys()][0], '<script>')
  expect(readRememberedDevice(storage)).toBeUndefined()
  rememberDevice(storage, 'A0:8C:FD:19:0A:8C')
  forgetDevice(storage)
  expect(readRememberedDevice(storage)).toBeUndefined()
  expect(data.size).toBe(0)
  // Modo privado / storage bloqueado: o portal segue funcionando sem lembrar.
  const blocked = fakeStorage({ broken: true }).storage
  expect(() => rememberDevice(blocked, 'A0:8C:FD:19:0A:8C')).not.toThrow()
  expect(() => forgetDevice(blocked)).not.toThrow()
  expect(readRememberedDevice(blocked)).toBeUndefined()
})
