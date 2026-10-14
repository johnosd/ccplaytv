import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
import { FULLSCREEN_REGION } from './PlayerService'

// Bug url-do-stream-no-src-do-video-de-dev: a URL do stream (com credencial) não fica no DOM.
beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  HTMLMediaElement.prototype.pause = vi.fn()
  HTMLMediaElement.prototype.load = vi.fn()
})

describe('htmlVideoAdapter — URL fora do DOM', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('remove o atributo src no loadstart, quando o carregamento já começou', () => {
    const adapter = createHtmlVideoAdapter(
      { onStateChange: vi.fn(), onError: vi.fn() },
      { startDemux: null },
    )
    adapter.open('http://exemplo.invalid/u/senha-ficticia/1.mp4', FULLSCREEN_REGION)
    const video = document.querySelector('video.player-video') as HTMLVideoElement

    // Antes do loadstart o atributo precisa existir: remover cedo abortaria o carregamento.
    expect(video.hasAttribute('src')).toBe(true)
    video.dispatchEvent(new Event('loadstart'))
    expect(video.hasAttribute('src')).toBe(false)
    expect(document.body.outerHTML).not.toContain('senha-ficticia')
  })
})
