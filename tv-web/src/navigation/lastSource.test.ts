import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAST_SOURCE_STORAGE_KEY, readLastSourceId, writeLastSourceId } from './lastSource'
import type { PreferenceStorage } from '../lib/motionPreference'

function memoryStorage(): PreferenceStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('lastSource', () => {
  it('nunca gravado → null', () => {
    expect(readLastSourceId(memoryStorage())).toBeNull()
  })

  it('ida e volta grava só o id, na chave esperada', () => {
    const storage = memoryStorage()
    writeLastSourceId('src-1', storage)
    expect(readLastSourceId(storage)).toBe('src-1')
    expect([...storage.data.entries()]).toEqual([[LAST_SOURCE_STORAGE_KEY, 'src-1']])
  })

  it('valor vazio conta como ausente', () => {
    const storage = memoryStorage()
    storage.data.set(LAST_SOURCE_STORAGE_KEY, '')
    expect(readLastSourceId(storage)).toBeNull()
  })

  it('getItem/setItem que lançam nunca escapam', () => {
    const throwing: PreferenceStorage = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('cheio')
      },
    }
    expect(readLastSourceId(throwing)).toBeNull()
    expect(() => writeLastSourceId('src-1', throwing)).not.toThrow()
  })

  it('storage null (indisponível) → leitura null e gravação silenciosa', () => {
    expect(readLastSourceId(null)).toBeNull()
    expect(() => writeLastSourceId('src-1', null)).not.toThrow()
  })

  it('sem argumento usa window.localStorage; se o getter lançar, devolve null sem lançar', () => {
    writeLastSourceId('src-2')
    expect(readLastSourceId()).toBe('src-2')
    expect(window.localStorage.getItem(LAST_SOURCE_STORAGE_KEY)).toBe('src-2')

    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('armazenamento bloqueado')
    })
    expect(readLastSourceId()).toBeNull()
    expect(() => writeLastSourceId('src-3')).not.toThrow()
  })
})
