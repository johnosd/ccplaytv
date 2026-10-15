import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvplayAdapter } from './avplayAdapter'
import type { PlayerAdapterCallbacks } from './PlayerService'

interface FakeOptions {
  /** Largura/altura que o motor informa para o vídeo. Ausente = não informa. */
  video?: { width: number; height: number }
  methodThrows?: boolean
  noDisplayMethod?: boolean
}

function install(options: FakeOptions = {}) {
  const calls: string[] = []
  const fake: Record<string, unknown> = {
    open: () => {},
    close: () => {},
    prepareAsync: () => {},
    play: () => {},
    pause: () => {},
    stop: () => {},
    seekTo: () => {},
    jumpForward: () => {},
    jumpBackward: () => {},
    getCurrentTime: () => 0,
    getDuration: () => 0,
    setListener: () => {},
    setDisplayRect: (x: number, y: number, w: number, h: number) => calls.push(`rect:${x},${y},${w},${h}`),
    getCurrentStreamInfo: () =>
      options.video
        ? [{ index: 0, type: 'VIDEO', extra_info: JSON.stringify({ Width: String(options.video.width), Height: String(options.video.height) }) }]
        : [],
  }
  if (!options.noDisplayMethod) {
    fake.setDisplayMethod = (method: string) => {
      if (options.methodThrows) throw new Error('NotSupportedError: http://usuario:senha@exemplo.invalid/x')
      calls.push(`method:${method}`)
    }
  }
  ;(window as unknown as { webapis?: unknown }).webapis = { avplay: fake }
  return calls
}

function opened(options: FakeOptions = {}, region = { x: 0, y: 0, width: 1920, height: 1080 }) {
  const calls = install(options)
  const adapter = createAvplayAdapter({
    onStateChange: vi.fn(),
    onError: vi.fn(),
  } satisfies PlayerAdapterCallbacks)
  adapter.open('http://exemplo.invalid/x.ts', region)
  calls.length = 0 // só o que o aspecto faz
  return { adapter, calls }
}

afterEach(() => {
  delete (window as unknown as { webapis?: unknown }).webapis
})

describe('avplayAdapter — aspecto (feature 041, provado na TV)', () => {
  it('declara os quatro modos', () => {
    const { adapter } = opened()
    expect(adapter.getAspectModes?.()).toEqual(['fit', 'fill', 'original', 'zoom'])
  })

  it('fit: região inteira + LETTER_BOX', () => {
    const { adapter, calls } = opened()
    expect(adapter.setAspectMode?.('fit')).toBe(true)
    expect(calls).toEqual(['rect:0,0,1920,1080', 'method:PLAYER_DISPLAY_MODE_LETTER_BOX'])
  })

  it('fill: região inteira + FULL_SCREEN', () => {
    const { adapter, calls } = opened()
    expect(adapter.setAspectMode?.('fill')).toBe(true)
    expect(calls).toEqual(['rect:0,0,1920,1080', 'method:PLAYER_DISPLAY_MODE_FULL_SCREEN'])
  })

  it('original: retângulo do tamanho do vídeo, centrado, LETTER_BOX', () => {
    const { adapter, calls } = opened({ video: { width: 1280, height: 720 } })
    expect(adapter.setAspectMode?.('original')).toBe(true)
    expect(calls).toEqual(['rect:320,180,1280,720', 'method:PLAYER_DISPLAY_MODE_LETTER_BOX'])
  })

  it('original: vídeo maior que a região fica limitado a ela', () => {
    const { adapter, calls } = opened({ video: { width: 3840, height: 2160 } })
    expect(adapter.setAspectMode?.('original')).toBe(true)
    expect(calls[0]).toBe('rect:0,0,1920,1080')
  })

  it('original sem o tamanho do vídeo: false, sem chamar o motor', () => {
    const { adapter, calls } = opened()
    expect(adapter.setAspectMode?.('original')).toBe(false)
    expect(calls).toEqual([])
  })

  it('zoom: retângulo 10% maior que a região, centrado (o ROI é recusado pela TV)', () => {
    const { adapter, calls } = opened()
    expect(adapter.setAspectMode?.('zoom')).toBe(true)
    expect(calls).toEqual(['rect:-96,-54,2112,1188', 'method:PLAYER_DISPLAY_MODE_LETTER_BOX'])
  })

  it('respeita uma região que não é a tela inteira', () => {
    const { adapter, calls } = opened({}, { x: 100, y: 50, width: 800, height: 400 })
    adapter.setAspectMode?.('fit')
    expect(calls[0]).toBe('rect:100,50,800,400')
  })

  it('motor que lança: false, e o erro bruto (com URL) não escapa', () => {
    const { adapter } = opened({ methodThrows: true })
    expect(adapter.setAspectMode?.('fill')).toBe(false)
  })

  it('motor sem setDisplayMethod: false', () => {
    const { adapter } = opened({ noDisplayMethod: true })
    expect(adapter.setAspectMode?.('fit')).toBe(false)
  })

  it('sem sessão aberta ou depois de fechar: false', () => {
    const calls = install()
    const adapter = createAvplayAdapter({ onStateChange: vi.fn(), onError: vi.fn() })
    expect(adapter.setAspectMode?.('fit')).toBe(false) // nunca aberto
    adapter.open('http://exemplo.invalid/x.ts', { x: 0, y: 0, width: 1920, height: 1080 })
    adapter.close()
    calls.length = 0
    expect(adapter.setAspectMode?.('fit')).toBe(false)
    expect(calls).toEqual([])
  })
})
