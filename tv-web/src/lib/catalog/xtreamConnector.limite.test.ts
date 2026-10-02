import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAccountStatus } from './xtreamConnector'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('xtreamConnector — limite do painel (feature 042, FR-017)', () => {
  it('HTTP 429 vira ProviderError rate_limited, não "painel incompatível"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    await expect(resolveAccountStatus('http://exemplo.test', 'u', 'p')).rejects.toMatchObject({
      name: 'ProviderError',
      kind: 'rate_limited',
    })
  })
})
