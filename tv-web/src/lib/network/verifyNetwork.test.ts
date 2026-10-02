import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERIFY_NETWORK_TIMEOUT_MS, verifyNetwork } from './verifyNetwork'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('verifyNetwork (feature 042, D-005)', () => {
  it('offline curto-circuita sem requisição', async () => {
    const fetchImpl = vi.fn()
    await expect(verifyNetwork('http://exemplo.test', { fetchImpl, isOnline: () => false })).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sem origem vale só o sinal inicial', async () => {
    const fetchImpl = vi.fn()
    await expect(verifyNetwork(undefined, { fetchImpl, isOnline: () => true })).resolves.toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('com origem: uma resposta (mesmo opaca) é alcance, pedida em no-cors e só na origem', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ type: 'opaque' })
    await expect(verifyNetwork('http://exemplo.test:8080', { fetchImpl, isOnline: () => true })).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://exemplo.test:8080',
      expect.objectContaining({ mode: 'no-cors', cache: 'no-store' }),
    )
  })

  it('rejeição do fetch é falso e nunca lança', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(verifyNetwork('http://exemplo.test', { fetchImpl, isOnline: () => true })).resolves.toBe(false)
  })

  it('um fetch que ignora o AbortSignal estoura em 5 s por Promise.race', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}))
    const pending = verifyNetwork('http://exemplo.test', { fetchImpl, isOnline: () => true })
    await vi.advanceTimersByTimeAsync(VERIFY_NETWORK_TIMEOUT_MS + 1)
    await expect(pending).resolves.toBe(false)
  })
})
