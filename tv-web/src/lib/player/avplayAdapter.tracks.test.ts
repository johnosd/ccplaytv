import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvplayAdapter } from './avplayAdapter'
import type { PlayerAdapterCallbacks } from './PlayerService'

interface TrackInfo {
  index: number
  type: string
  extra_info: string
}

interface FakeOptions {
  total?: TrackInfo[] | (() => TrackInfo[])
  current?: TrackInfo[] | (() => TrackInfo[])
  bandwidth?: string | (() => string)
  /** Remove os métodos de faixa (motor sem a API). */
  bare?: boolean
}

function install(options: FakeOptions = {}) {
  const calls: string[] = []
  const listeners: Record<string, unknown> = {}
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
    setListener: (l: Record<string, unknown>) => Object.assign(listeners, l),
    setDisplayRect: () => {},
  }
  if (!options.bare) {
    fake.getTotalTrackInfo = () => (typeof options.total === 'function' ? options.total() : (options.total ?? []))
    fake.getCurrentStreamInfo = () => (typeof options.current === 'function' ? options.current() : (options.current ?? []))
    fake.getStreamingProperty = (name: string) => {
      if (name !== 'CURRENT_BANDWIDTH') return ''
      const value = typeof options.bandwidth === 'function' ? options.bandwidth() : (options.bandwidth ?? '')
      return value
    }
    fake.setSelectTrack = (type: string, index: number) => calls.push(`select:${type}:${index}`)
    fake.setSilentSubtitle = (silent: boolean) => calls.push(`silent:${silent}`)
  }
  ;(window as unknown as { webapis?: unknown }).webapis = { avplay: fake }
  return { calls, listeners, fake }
}

function callbacks() {
  return {
    onStateChange: vi.fn(),
    onError: vi.fn(),
    onProgress: vi.fn(),
    onCompleted: vi.fn(),
    onSubtitle: vi.fn(),
  } satisfies PlayerAdapterCallbacks
}

const REGION = { x: 0, y: 0, width: 1920, height: 1080 }

const AUDIO_PT: TrackInfo = {
  index: 1,
  type: 'AUDIO',
  extra_info: '{"language":"por","channels":"6","sample_rate":"48000","bit_rate":"384000","fourCC":"AC3"}',
}
const AUDIO_EN: TrackInfo = {
  index: 2,
  type: 'AUDIO',
  extra_info: '{"language":"eng","channels":"2","sample_rate":"48000","bit_rate":"128000","fourCC":"AAC"}',
}
const TEXT_PT: TrackInfo = {
  index: 5,
  type: 'TEXT',
  extra_info: '{"track_num":"0","track_lang":"por","subtitle_type":"0","fourCC":"SRT"}',
}
const VIDEO: TrackInfo = {
  index: 0,
  type: 'VIDEO',
  extra_info: '{"fourCC":"H264","Width":"1920","Height":"1080","Bit_rate":"4000000"}',
}

describe('avplayAdapter — faixas, legenda e info (feature 029)', () => {
  afterEach(() => {
    delete (window as unknown as { webapis?: unknown }).webapis
  })

  it('open() silencia a legenda (D-005) e onsubtitlechange vira onSubtitle só com texto e duração', () => {
    const { calls, listeners } = install()
    const cbs = callbacks()
    createAvplayAdapter(cbs).open('http://exemplo.invalid/x.mp4', REGION)

    expect(calls).toContain('silent:true')
    const onsubtitlechange = listeners.onsubtitlechange as (d: string, t: string, type?: string, attrs?: unknown) => void
    onsubtitlechange('3000', 'Olá, mundo', '0', [{ attr_type: 1 }])
    expect(cbs.onSubtitle).toHaveBeenLastCalledWith({ text: 'Olá, mundo', durationMs: 3000 })
    onsubtitlechange('não-numérico', '')
    expect(cbs.onSubtitle).toHaveBeenLastCalledWith({ text: '', durationMs: 0 })
  })

  it('getTracks: mapeia áudio e legenda, ignora vídeo, marca o áudio ativo pelo stream atual', () => {
    install({ total: [VIDEO, AUDIO_PT, AUDIO_EN, TEXT_PT], current: [VIDEO, AUDIO_EN] })
    const tracks = createAvplayAdapter(callbacks()).getTracks?.()
    expect(tracks).toEqual([
      { id: '1', kind: 'audio', language: 'por', codec: 'AC3', channels: 6, active: false },
      { id: '2', kind: 'audio', language: 'eng', codec: 'AAC', channels: 2, active: true },
      { id: '5', kind: 'text', language: 'por', active: false },
    ])
  })

  it('getTracks: extra_info malformado ou vazio mantém a faixa listada, sem os campos', () => {
    install({
      total: [
        { index: 1, type: 'AUDIO', extra_info: 'isto não é JSON' },
        { index: 2, type: 'AUDIO', extra_info: '{"language":"","channels":"0","fourCC":""}' },
        { index: 3, type: 'TEXT', extra_info: '' },
      ],
    })
    const tracks = createAvplayAdapter(callbacks()).getTracks?.() ?? []
    expect(tracks.map((t) => [t.id, t.kind, t.language, t.codec, t.channels])).toEqual([
      ['1', 'audio', undefined, undefined, undefined],
      ['2', 'audio', undefined, undefined, undefined],
      ['3', 'text', undefined, undefined, undefined],
    ])
  })

  it('getTracks é null quando a API falha ou não existe — nunca lança', () => {
    install({
      total: () => {
        throw new Error('boom')
      },
    })
    expect(createAvplayAdapter(callbacks()).getTracks?.()).toBeNull()

    install({ bare: true })
    expect(createAvplayAdapter(callbacks()).getTracks?.()).toBeNull()
  })

  it('selectAudioTrack usa o índice do motor; false quando falta a API ou ela lança', () => {
    const { calls, fake } = install()
    const adapter = createAvplayAdapter(callbacks())
    expect(adapter.selectAudioTrack?.('2')).toBe(true)
    expect(calls).toEqual(['select:AUDIO:2'])

    fake.setSelectTrack = () => {
      throw new Error('boom')
    }
    expect(adapter.selectAudioTrack?.('1')).toBe(false)

    install({ bare: true })
    expect(createAvplayAdapter(callbacks()).selectAudioTrack?.('1')).toBe(false)
  })

  it('selectTextTrack: escolhe a faixa e só depois acende a legenda; null silencia', () => {
    const { calls } = install()
    const adapter = createAvplayAdapter(callbacks())
    expect(adapter.selectTextTrack?.('5')).toBe(true)
    expect(calls).toEqual(['select:TEXT:5', 'silent:false'])
    calls.length = 0
    expect(adapter.selectTextTrack?.(null)).toBe(true)
    expect(calls).toEqual(['silent:true'])
  })

  it('selectTextTrack devolve false quando o motor lança, sem propagar', () => {
    const { fake } = install()
    fake.setSelectTrack = () => {
      throw new Error('boom')
    }
    expect(createAvplayAdapter(callbacks()).selectTextTrack?.('5')).toBe(false)
  })

  it('getStreamInfo: dimensões, codec e taxa em kbps (bits/s do motor ÷ 1000)', () => {
    install({ current: [VIDEO, AUDIO_PT] })
    expect(createAvplayAdapter(callbacks()).getStreamInfo?.()).toEqual({
      width: 1920,
      height: 1080,
      videoCodec: 'H264',
      bitrateKbps: 4000,
    })
  })

  it('getStreamInfo: a banda atual do streaming adaptativo vence o Bit_rate; se lançar, cai no Bit_rate', () => {
    install({ current: [VIDEO], bandwidth: '2500000' })
    expect(createAvplayAdapter(callbacks()).getStreamInfo?.()?.bitrateKbps).toBe(2500)

    install({
      current: [VIDEO],
      bandwidth: () => {
        throw new Error('boom')
      },
    })
    expect(createAvplayAdapter(callbacks()).getStreamInfo?.()?.bitrateKbps).toBe(4000)
  })

  it('getStreamInfo: campo que o motor não informa fica ausente — nunca zero nem estimado', () => {
    install({ current: [{ index: 0, type: 'VIDEO', extra_info: '{"fourCC":"HEVC","Width":"0","Height":"720"}' }] })
    const info = createAvplayAdapter(callbacks()).getStreamInfo?.()
    expect(info).toEqual({ videoCodec: 'HEVC' })
    expect(info).not.toHaveProperty('width')
    expect(info).not.toHaveProperty('fps')
    expect(info).not.toHaveProperty('bufferMs')
    expect(info).not.toHaveProperty('protocol')
  })

  it('getStreamInfo é null quando o motor lança', () => {
    install({
      current: () => {
        throw new Error('boom')
      },
    })
    expect(createAvplayAdapter(callbacks()).getStreamInfo?.()).toBeNull()
  })
})
