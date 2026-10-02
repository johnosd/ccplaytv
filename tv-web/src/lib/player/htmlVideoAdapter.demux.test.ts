// @vitest-environment jsdom
// Feature 047 — complementa o contrato travado: o que NÃO muda (FR-009/FR-013).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
import { FULLSCREEN_REGION, type PlayerAdapterCallbacks } from './PlayerService'
import type { DemuxStarter } from './devDemux'

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  HTMLMediaElement.prototype.load = vi.fn()
})

afterEach(() => {
  document.body.innerHTML = ''
})

function fakeCallbacks() {
  return { onStateChange: vi.fn(), onError: vi.fn() } satisfies PlayerAdapterCallbacks
}

function refuse(code: number): HTMLVideoElement {
  const video = document.querySelector('video.player-video') as HTMLVideoElement
  Object.defineProperty(video, 'error', { configurable: true, value: { code } })
  video.dispatchEvent(new Event('error'))
  return video
}

describe('htmlVideoAdapter — o que o fallback de demux não muda (047)', () => {
  it('URL que não é MPEG-TS com erro 4 reporta na hora e nunca chama o demux', () => {
    const start = vi.fn<DemuxStarter>()
    const callbacks = fakeCallbacks()
    const adapter = createHtmlVideoAdapter(callbacks, { startDemux: start })

    adapter.open('http://h.test/movie/u/p/9.mp4', FULLSCREEN_REGION)
    refuse(4)

    expect(start).not.toHaveBeenCalled()
    expect(callbacks.onError).toHaveBeenCalledTimes(1)
    expect(callbacks.onError).toHaveBeenCalledWith({ code: null })
  })

  it('com startDemux: null (fallback desligado), .ts recusado reporta na hora como antes', () => {
    const callbacks = fakeCallbacks()
    const adapter = createHtmlVideoAdapter(callbacks, { startDemux: null })

    adapter.open('http://h.test/live/u/p/1.ts', FULLSCREEN_REGION)
    refuse(4)

    expect(callbacks.onError).toHaveBeenCalledTimes(1)
  })

  it('.ts com erro de rede (2) não é "formato não suportado": reporta na hora, sem demux', () => {
    const start = vi.fn<DemuxStarter>()
    const callbacks = fakeCallbacks()
    const adapter = createHtmlVideoAdapter(callbacks, { startDemux: start })

    adapter.open('http://h.test/live/u/p/1.ts', FULLSCREEN_REGION)
    refuse(2)

    expect(start).not.toHaveBeenCalled()
    expect(callbacks.onError).toHaveBeenCalledTimes(1)
  })

  it('falha ao carregar a biblioteca (promessa rejeitada) vira uma única falha genérica', async () => {
    const start = vi.fn<DemuxStarter>(() => Promise.reject(new Error('http://h.test/live/u/p/1.ts')))
    const callbacks = fakeCallbacks()
    const adapter = createHtmlVideoAdapter(callbacks, { startDemux: start })

    adapter.open('http://h.test/live/u/p/1.ts', FULLSCREEN_REGION)
    refuse(4)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(callbacks.onError).toHaveBeenCalledTimes(1)
    expect(callbacks.onError).toHaveBeenCalledWith({ code: null })
    expect(JSON.stringify(callbacks.onError.mock.calls)).not.toContain('h.test')
  })
})
