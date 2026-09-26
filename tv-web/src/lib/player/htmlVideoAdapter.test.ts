import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
import type { PlayerAdapterCallbacks } from './PlayerService'
import { FULLSCREEN_REGION } from './PlayerService'

// jsdom não implementa play()/pause() de HTMLMediaElement (lança "not
// implemented"). Mockamos no protótipo pra exercitar o adaptador sem depender
// de um motor de mídia real — a prova de reprodução real é a TV (AVPlay).
beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  HTMLMediaElement.prototype.load = vi.fn()
})

function fakeCallbacks() {
  return {
    onStateChange: vi.fn(),
    onError: vi.fn(),
    onProgress: vi.fn(),
    onCompleted: vi.fn(),
  } satisfies PlayerAdapterCallbacks
}

function currentVideo(): HTMLVideoElement {
  const el = document.querySelector('video.player-video')
  if (!el) throw new Error('elemento <video> não encontrado — open() não montou nada')
  return el as HTMLVideoElement
}

describe('htmlVideoAdapter', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('declara capacidades completas — suporta tudo, ao contrário do motor real (contrato, nota do quickstart)', () => {
    const adapter = createHtmlVideoAdapter(fakeCallbacks())
    expect(adapter.capabilities).toEqual({
      canPause: true,
      canSeek: true,
      reportsPosition: true,
      reportsDuration: true,
    })
  })

  describe('pause/resume', () => {
    it('pause() chama o pause nativo e reporta o estado paused via evento', () => {
      const callbacks = fakeCallbacks()
      const adapter = createHtmlVideoAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
      const video = currentVideo()

      adapter.pause?.()
      video.dispatchEvent(new Event('pause'))

      expect(video.pause).toHaveBeenCalledTimes(1)
      expect(callbacks.onStateChange).toHaveBeenCalledWith('paused')
    })

    it('resume() chama play() nativo e reporta playing via evento', () => {
      const callbacks = fakeCallbacks()
      const adapter = createHtmlVideoAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
      const video = currentVideo()

      adapter.resume?.()
      video.dispatchEvent(new Event('playing'))

      expect(video.play).toHaveBeenCalled()
      expect(callbacks.onStateChange).toHaveBeenCalledWith('playing')
    })
  })

  describe('progresso', () => {
    it('timeupdate vira onProgress com posição e duração em ms', () => {
      const callbacks = fakeCallbacks()
      const adapter = createHtmlVideoAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
      const video = currentVideo()

      Object.defineProperty(video, 'currentTime', { value: 45, configurable: true })
      Object.defineProperty(video, 'duration', { value: 120, configurable: true })
      video.dispatchEvent(new Event('timeupdate'))

      expect(callbacks.onProgress).toHaveBeenCalledWith({ positionMs: 45_000, durationMs: 120_000 })
    })

    it('duração NaN/desconhecida (sem metadados carregados) não é repassada', () => {
      const callbacks = fakeCallbacks()
      const adapter = createHtmlVideoAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
      const video = currentVideo()

      Object.defineProperty(video, 'currentTime', { value: 5, configurable: true })
      Object.defineProperty(video, 'duration', { value: NaN, configurable: true })
      video.dispatchEvent(new Event('timeupdate'))

      expect(callbacks.onProgress).toHaveBeenCalledWith({ positionMs: 5_000, durationMs: undefined })
    })
  })

  it("'ended' vira onCompleted", () => {
    const callbacks = fakeCallbacks()
    const adapter = createHtmlVideoAdapter(callbacks)
    adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
    const video = currentVideo()

    video.dispatchEvent(new Event('ended'))

    expect(callbacks.onCompleted).toHaveBeenCalledTimes(1)
  })

  describe('seekTo / jumpBy', () => {
    it('seekTo ajusta currentTime e chama onSettled', () => {
      const adapter = createHtmlVideoAdapter(fakeCallbacks())
      adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
      const video = currentVideo()
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true })

      const onSettled = vi.fn()
      adapter.seekTo?.(30_000, onSettled)

      expect(video.currentTime).toBe(30)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('jumpBy soma o delta ao currentTime e chama onSettled', () => {
      const adapter = createHtmlVideoAdapter(fakeCallbacks())
      adapter.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
      const video = currentVideo()
      Object.defineProperty(video, 'currentTime', { value: 10, writable: true, configurable: true })

      const onSettled = vi.fn()
      adapter.jumpBy?.(5_000, onSettled)

      expect(video.currentTime).toBe(15)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })
})
