import { describe, expect, it, vi } from 'vitest'
import { createHtmlVideoAdapter } from './htmlVideoAdapter'
import { FULLSCREEN_REGION } from './PlayerService'

function adapter() {
  return createHtmlVideoAdapter({ onStateChange: vi.fn(), onError: vi.fn() })
}

describe('htmlVideoAdapter — aspecto (feature 041, R0-3)', () => {
  it('declara os quatro modos e nenhuma qualidade', () => {
    const a = adapter()
    expect(a.getAspectModes?.()).toEqual(['fit', 'fill', 'original', 'zoom'])
    expect(a.getQualities).toBeUndefined()
    expect(a.selectQuality).toBeUndefined()
  })

  it('aplica object-fit no elemento: contain/fill/none/cover', () => {
    const a = adapter()
    a.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
    const video = document.querySelector('video') as HTMLVideoElement
    for (const [mode, fit] of [
      ['fit', 'contain'],
      ['fill', 'fill'],
      ['original', 'none'],
      ['zoom', 'cover'],
    ] as const) {
      expect(a.setAspectMode?.(mode)).toBe(true)
      expect(video.style.objectFit).toBe(fit)
    }
    a.close()
  })

  it('sem elemento (antes de abrir / depois de fechar): false', () => {
    const a = adapter()
    expect(a.setAspectMode?.('fill')).toBe(false)
    a.open('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION)
    a.close()
    expect(a.setAspectMode?.('fill')).toBe(false)
  })
})
