// @vitest-environment jsdom
/**
 * Feature 058 (T010, `logic/headers.md` §1): casos de borda do repasse de
 * headers ao AVPlay que o contrato não cobre.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvplayAdapter } from './avplayAdapter'
import { FULLSCREEN_REGION, type PlayerAdapterCallbacks } from './PlayerService'

const SECRET = 'AgenteSecreto/1.0'

function installFakeAvplay(setStreamingProperty?: (name: string, value: string) => void) {
  const fake: Record<string, unknown> = {
    open: () => {},
    close: () => {},
    stop: () => {},
    prepareAsync: (onSuccess: () => void) => onSuccess(),
    play: () => {},
    pause: () => {},
    seekTo: () => {},
    jumpForward: () => {},
    jumpBackward: () => {},
    getCurrentTime: () => 0,
    getDuration: () => 0,
    setListener: () => {},
    setDisplayRect: () => {},
  }
  if (setStreamingProperty) fake.setStreamingProperty = setStreamingProperty
  ;(window as unknown as { webapis?: unknown }).webapis = { avplay: fake }
}

function callbacks(): PlayerAdapterCallbacks {
  return { onStateChange: vi.fn(), onError: vi.fn(), onProgress: vi.fn(), onCompleted: vi.fn() }
}

describe('avplayAdapter — headers (feature 058)', () => {
  afterEach(() => {
    delete (window as unknown as { webapis?: unknown }).webapis
  })

  it('motor sem setStreamingProperty: todo header declarado conta como recusado', () => {
    installFakeAvplay()
    const adapter = createAvplayAdapter(callbacks())
    adapter.open('http://x.invalid/1.ts', FULLSCREEN_REGION, undefined, { userAgent: SECRET, referer: 'http://r.invalid/' })
    expect(adapter.requestHeadersReport?.()).toEqual({ applied: [], refused: ['User-Agent', 'Referer'] })
  })

  it('propriedade que lança: recusado, a abertura continua e o erro do motor nunca chega a onError', () => {
    installFakeAvplay(() => {
      throw new Error(`recusado: ${SECRET}`)
    })
    const cb = callbacks()
    const adapter = createAvplayAdapter(cb)
    adapter.open('http://x.invalid/1.ts', FULLSCREEN_REGION, undefined, { userAgent: SECRET })
    expect(adapter.requestHeadersReport?.()).toEqual({ applied: [], refused: ['User-Agent'] })
    expect(cb.onError).not.toHaveBeenCalled()
    expect(cb.onStateChange).toHaveBeenCalledWith('buffering')
  })

  it('o relatório só carrega nomes, nunca o valor', () => {
    installFakeAvplay(() => {})
    const adapter = createAvplayAdapter(callbacks())
    adapter.open('http://x.invalid/1.ts', FULLSCREEN_REGION, undefined, { userAgent: SECRET })
    expect(JSON.stringify(adapter.requestHeadersReport?.())).not.toContain(SECRET)
  })
})
