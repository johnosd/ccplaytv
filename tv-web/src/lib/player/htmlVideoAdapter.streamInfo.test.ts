import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
import { FULLSCREEN_REGION, type PlayerAdapterCallbacks } from './PlayerService'

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  HTMLMediaElement.prototype.load = vi.fn()
})

function callbacks() {
  return { onStateChange: vi.fn(), onError: vi.fn() } satisfies PlayerAdapterCallbacks
}

describe('htmlVideoAdapter — info do stream (feature 029, logic §1.3)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('não expõe métodos de faixa (o Chromium não informa faixas de áudio) — só a info', () => {
    const adapter = createHtmlVideoAdapter(callbacks())
    expect(adapter.getTracks).toBeUndefined()
    expect(adapter.selectAudioTrack).toBeUndefined()
    expect(adapter.selectTextTrack).toBeUndefined()
    expect(typeof adapter.getStreamInfo).toBe('function')
  })

  it('null antes de open(); {} enquanto o elemento não conhece as dimensões', () => {
    const adapter = createHtmlVideoAdapter(callbacks())
    expect(adapter.getStreamInfo?.()).toBeNull()
    adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
    expect(adapter.getStreamInfo?.()).toEqual({})
  })

  it('largura e altura só entram quando as duas são > 0', () => {
    const adapter = createHtmlVideoAdapter(callbacks())
    adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
    const video = document.querySelector('video.player-video') as HTMLVideoElement

    Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true })
    expect(adapter.getStreamInfo?.()).toEqual({})

    Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true })
    expect(adapter.getStreamInfo?.()).toEqual({ width: 1280, height: 720 })
  })

  it('null depois de close()', () => {
    const adapter = createHtmlVideoAdapter(callbacks())
    adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
    adapter.close()
    expect(adapter.getStreamInfo?.()).toBeNull()
  })
})
