import { describe, expect, it, vi } from 'vitest'
import {
  createPlayerSession,
  FULLSCREEN_REGION,
  type MediaTrack,
  type PlayerAdapter,
  type PlayerAdapterCallbacks,
  type StreamInfo,
  type SubtitleCue,
} from './PlayerService'

interface FakeOptions {
  /** `true` → o adaptador expõe os métodos de faixa/info. */
  withTracks?: boolean
  tracks?: MediaTrack[]
  selectAudio?: (id: string) => boolean
  selectText?: (id: string | null) => boolean
  streamInfo?: () => StreamInfo | null
  getTracksThrows?: boolean
}

function fake(options: FakeOptions = {}) {
  let callbacks: PlayerAdapterCallbacks | null = null
  const { withTracks = true } = options
  const factory = (cbs: PlayerAdapterCallbacks): PlayerAdapter => {
    callbacks = cbs
    const adapter: PlayerAdapter = {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
      open: () => {},
      close: () => {},
    }
    if (withTracks) {
      adapter.getTracks = () => {
        if (options.getTracksThrows) throw new Error('boom')
        return (options.tracks ?? []).map((t) => ({ ...t }))
      }
      adapter.selectAudioTrack = options.selectAudio ?? (() => true)
      adapter.selectTextTrack = options.selectText ?? (() => true)
      adapter.getStreamInfo = options.streamInfo ?? (() => ({ width: 1280, height: 720 }))
    }
    return adapter
  }
  return {
    factory,
    emitSubtitle: (cue: SubtitleCue) => callbacks?.onSubtitle?.(cue),
  }
}

function open(options: FakeOptions = {}) {
  const f = fake(options)
  const session = createPlayerSession('http://exemplo.invalid/x.mp4', FULLSCREEN_REGION, 'movie', {
    createAdapter: f.factory,
  })
  return { ...f, session }
}

const CUE: SubtitleCue = { text: 'Olá', durationMs: 2000 }

describe('PlayerServiceSession — faixas, legenda e info (feature 029)', () => {
  it('supportsTracks/supportsStreamInfo vêm da presença dos métodos; sem eles tudo é no-op', () => {
    const { session } = open({ withTracks: false })
    expect(session.supportsTracks).toBe(false)
    expect(session.supportsStreamInfo).toBe(false)
    expect(session.getTracks()).toBeNull()
    expect(session.selectAudioTrack('a0')).toBe(false)
    expect(session.selectTextTrack('t0')).toBe(false)
    expect(session.getStreamInfo()).toBeNull()

    const withApi = open()
    expect(withApi.session.supportsTracks).toBe(true)
    expect(withApi.session.supportsStreamInfo).toBe(true)
  })

  it('linha do motor é descartada com a legenda desativada; passa ao selecionar; some ao desativar', () => {
    const { session, emitSubtitle } = open()
    const seen: (SubtitleCue | null)[] = []
    session.subscribeSubtitles((cue) => seen.push(cue))

    emitSubtitle(CUE)
    expect(seen).toEqual([])

    expect(session.selectTextTrack('t0')).toBe(true)
    // A troca de legenda apaga a linha anterior na hora...
    expect(seen).toEqual([null])
    emitSubtitle(CUE)
    expect(seen).toEqual([null, CUE])

    // ...e desativar apaga a que estiver na tela e volta a descartar.
    expect(session.selectTextTrack(null)).toBe(true)
    expect(seen).toEqual([null, CUE, null])
    emitSubtitle(CUE)
    expect(seen).toEqual([null, CUE, null])
  })

  it('troca recusada pelo motor (false ou exceção) não altera a seleção nem apaga a linha', () => {
    const selectText = vi.fn<(id: string | null) => boolean>().mockReturnValueOnce(true).mockReturnValueOnce(false)
    const { session, emitSubtitle } = open({ selectText })
    const seen: (SubtitleCue | null)[] = []
    session.subscribeSubtitles((cue) => seen.push(cue))

    expect(session.selectTextTrack('t0')).toBe(true)
    seen.length = 0
    expect(session.selectTextTrack('t1')).toBe(false)
    expect(seen).toEqual([])
    emitSubtitle(CUE) // ainda vale a seleção anterior
    expect(seen).toEqual([CUE])

    const throwing = open({
      selectAudio: () => {
        throw new Error('boom')
      },
      getTracksThrows: true,
    })
    expect(throwing.session.selectAudioTrack('a1')).toBe(false)
    expect(throwing.session.getTracks()).toBeNull()
  })

  it('getTracks sobrescreve a legenda ativa pela seleção da sessão; o áudio segue o motor', () => {
    const tracks: MediaTrack[] = [
      { id: 'a0', kind: 'audio', language: 'por', active: true },
      { id: 'a1', kind: 'audio', language: 'eng', active: false },
      { id: 't0', kind: 'text', language: 'por', active: true }, // o motor "diz" ativa — a sessão manda
      { id: 't1', kind: 'text', language: 'eng', active: false },
    ]
    const { session } = open({ tracks })
    expect(session.getTracks()?.filter((t) => t.kind === 'text').map((t) => t.active)).toEqual([false, false])

    session.selectTextTrack('t1')
    const after = session.getTracks() ?? []
    expect(after.filter((t) => t.kind === 'text').map((t) => [t.id, t.active])).toEqual([
      ['t0', false],
      ['t1', true],
    ])
    expect(after.filter((t) => t.kind === 'audio').map((t) => [t.id, t.active])).toEqual([
      ['a0', true],
      ['a1', false],
    ])
  })

  it('se o motor não marca nenhum áudio ativo, vale a última troca aceita', () => {
    const tracks: MediaTrack[] = [
      { id: 'a0', kind: 'audio', language: 'por', active: false },
      { id: 'a1', kind: 'audio', language: 'eng', active: false },
    ]
    const { session } = open({ tracks })
    expect(session.getTracks()?.map((t) => t.active)).toEqual([false, false])
    expect(session.selectAudioTrack('a1')).toBe(true)
    expect(session.getTracks()?.map((t) => t.active)).toEqual([false, true])
  })

  it('linha de legenda não notifica quem assina o estado da sessão (sem re-render por linha)', () => {
    const { session, emitSubtitle } = open()
    session.selectTextTrack('t0')
    const onState = vi.fn()
    session.subscribe(onState)
    emitSubtitle(CUE)
    emitSubtitle({ text: '', durationMs: 0 })
    expect(onState).not.toHaveBeenCalled()
  })

  it('depois de close(): faixas nulas, trocas recusadas, info nula e nenhuma linha passa', () => {
    const { session, emitSubtitle } = open()
    session.selectTextTrack('t0')
    const seen: (SubtitleCue | null)[] = []
    session.subscribeSubtitles((cue) => seen.push(cue))

    session.close()
    expect(session.getTracks()).toBeNull()
    expect(session.selectAudioTrack('a0')).toBe(false)
    expect(session.selectTextTrack('t0')).toBe(false)
    expect(session.getStreamInfo()).toBeNull()
    emitSubtitle(CUE)
    expect(seen).toEqual([])
  })

  it('getStreamInfo repassa o que o motor informa, e exceção vira null', () => {
    expect(open({ streamInfo: () => ({ width: 1920, height: 1080, videoCodec: 'H264' }) }).session.getStreamInfo()).toEqual({
      width: 1920,
      height: 1080,
      videoCodec: 'H264',
    })
    const throwing = open({
      streamInfo: () => {
        throw new Error('boom')
      },
    })
    expect(throwing.session.getStreamInfo()).toBeNull()
  })

  it('quem cancela a assinatura deixa de receber linhas', () => {
    const { session, emitSubtitle } = open()
    session.selectTextTrack('t0')
    const listener = vi.fn()
    const unsubscribe = session.subscribeSubtitles(listener)
    emitSubtitle(CUE)
    unsubscribe()
    emitSubtitle(CUE)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
