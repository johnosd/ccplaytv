import { describe, expect, it } from 'vitest'
import { storageFailureCode } from './storageFailure'

describe('diagnóstico sanitizado do armazenamento do teste', () => {
  it.each([
    ['QuotaExceededError', 'QUOTA'], ['NotFoundError', 'TABLE'], ['SchemaError', 'SCHEMA'],
    ['VersionError', 'VERSION'], ['InvalidStateError', 'STATE'], ['TransactionInactiveError', 'TRANSACTION'],
    ['AbortError', 'ABORT'], ['DatabaseClosedError', 'CLOSED'], ['OpenFailedError', 'OPEN'],
    ['DataCloneError', 'CLONE'], ['SecurityError', 'SECURITY'], ['TypeError', 'TYPE'],
  ])('classifica %s sem copiar detalhes', (name, reason) => {
    expect(storageFailureCode('W', { name, message: 'private details', stack: 'private stack' })).toBe(`NET-W-${reason}`)
  })

  it('identifica operação e causa interna de exceção Dexie', () => {
    expect(storageFailureCode('R', { name: 'OpenFailedError', inner: { name: 'QuotaExceededError' } })).toBe('NET-R-QUOTA')
    expect(storageFailureCode('D', { name: 'AbortError' })).toBe('NET-D-ABORT')
  })

  it('nomes desconhecidos, texto bruto, ciclos e getters não escapam para a UI', () => {
    for (const error of ['private details', null, { name: 'constructor' }, { name: 'private details' }, { get name() { throw new Error('private') } }]) {
      expect(storageFailureCode('W', error)).toBe('NET-W-UNKNOWN')
    }
    const cycle = { name: 'private details', inner: {} }
    cycle.inner = cycle
    expect(storageFailureCode('R', cycle)).toBe('NET-R-UNKNOWN')
  })
})
