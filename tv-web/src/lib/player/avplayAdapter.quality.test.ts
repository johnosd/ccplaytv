import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvplayAdapter } from './avplayAdapter'

interface Video {
  index: number
  width?: number
  height?: number
  bps?: number
  badExtra?: boolean
}

function install(videos: Video[], options: { selectThrows?: boolean; noGetTotal?: boolean } = {}) {
  const calls: string[] = []
  const total = [
    ...videos.map((v) => ({
      index: v.index,
      type: 'VIDEO',
      extra_info: v.badExtra
        ? '{nao e json'
        : JSON.stringify({ Width: v.width === undefined ? undefined : String(v.width), Height: v.height === undefined ? undefined : String(v.height), Bit_rate: v.bps === undefined ? undefined : String(v.bps) }),
    })),
    { index: 0, type: 'AUDIO', extra_info: '{}' },
  ]
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
    setDisplayRect: () => {},
    setSelectTrack: (type: string, index: number) => {
      if (options.selectThrows) throw new Error('NotSupportedError http://usuario:senha@exemplo.invalid')
      calls.push(`select:${type}:${index}`)
    },
  }
  if (!options.noGetTotal) fake.getTotalTrackInfo = () => total
  ;(window as unknown as { webapis?: unknown }).webapis = { avplay: fake }
  return calls
}

function opened() {
  const adapter = createAvplayAdapter({ onStateChange: vi.fn(), onError: vi.fn() })
  adapter.open('http://exemplo.invalid/x.m3u8', { x: 0, y: 0, width: 1920, height: 1080 })
  return adapter
}

afterEach(() => {
  delete (window as unknown as { webapis?: unknown }).webapis
})

describe('avplayAdapter — qualidade (feature 041)', () => {
  it('getQualities: uma opção por entrada VIDEO, só com o que o motor informou', () => {
    install([
      { index: 0, width: 1920, height: 1080, bps: 5_000_000 },
      { index: 1, width: 1280, height: 720, bps: 2_500_000 },
    ])
    expect(opened().getQualities?.()).toEqual([
      { id: '0', height: 1080, width: 1920, bitrateKbps: 5000 },
      { id: '1', height: 720, width: 1280, bitrateKbps: 2500 },
    ])
  })

  it('entrada sem altura válida ou com extra_info ilegível fica de fora (nada inventado)', () => {
    install([{ index: 0, width: 1280 }, { index: 1, badExtra: true }, { index: 2, height: 480 }])
    expect(opened().getQualities?.()).toEqual([{ id: '2', height: 480, width: undefined, bitrateKbps: undefined }])
  })

  it('stream de qualidade única devolve uma opção; sem getTotalTrackInfo, null', () => {
    install([{ index: 0, width: 1280, height: 720 }])
    expect(opened().getQualities?.()).toHaveLength(1)
    install([], { noGetTotal: true })
    expect(opened().getQualities?.()).toBeNull()
  })

  it('selectQuality(id) chama setSelectTrack("VIDEO", índice) e aceita', () => {
    const calls = install([{ index: 0, height: 1080 }, { index: 1, height: 720 }])
    expect(opened().selectQuality?.('1')).toBe(true)
    expect(calls).toEqual(['select:VIDEO:1'])
  })

  it('motor que lança: false, sem repassar o erro (que embute a URL)', () => {
    install([{ index: 0, height: 1080 }, { index: 1, height: 720 }], { selectThrows: true })
    expect(opened().selectQuality?.('1')).toBe(false)
  })

  it('Auto: já adaptativo = true sem chamar o motor; depois de forçar uma variante, recusa honestamente', () => {
    const calls = install([{ index: 0, height: 1080 }, { index: 1, height: 720 }])
    const adapter = opened()
    expect(adapter.selectQuality?.(null)).toBe(true)
    expect(calls).toEqual([])
    adapter.selectQuality?.('0')
    expect(adapter.selectQuality?.(null)).toBe(false)
  })

  it('sem sessão aberta: false', () => {
    install([{ index: 0, height: 1080 }])
    const adapter = createAvplayAdapter({ onStateChange: vi.fn(), onError: vi.fn() })
    expect(adapter.selectQuality?.('0')).toBe(false)
  })
})
