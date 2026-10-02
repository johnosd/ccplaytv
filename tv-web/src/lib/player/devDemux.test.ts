import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultDemuxStarter, isMpegTsUrl } from './devDemux'

// Biblioteca falsa: o demux real precisa de MediaSource e de rede.
const fakePlayer = {
  on: vi.fn(),
  attachMediaElement: vi.fn(),
  load: vi.fn(),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  unload: vi.fn(),
  detachMediaElement: vi.fn(),
  destroy: vi.fn(),
}
const fakeMpegts = {
  isSupported: vi.fn(() => true),
  LoggingControl: { applyConfig: vi.fn() },
  Events: { ERROR: 'error' },
  createPlayer: vi.fn(() => fakePlayer),
}
vi.mock('mpegts.js', () => ({ default: fakeMpegts }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  fakeMpegts.isSupported.mockReturnValue(true)
})

describe('isMpegTsUrl', () => {
  it('lê só o caminho: query e fragmento não contam, maiúsculas valem', () => {
    expect(isMpegTsUrl('http://h.test/live/u/p/1.ts')).toBe(true)
    expect(isMpegTsUrl('http://h.test/live/u/p/1.TS?a=b.mp4#x')).toBe(true)
    expect(isMpegTsUrl('http://h.test/live/u/p/1.mp4?next=.ts')).toBe(false)
    expect(isMpegTsUrl('http://h.test/live/u/p/stream.tsx')).toBe(false)
    expect(isMpegTsUrl('')).toBe(false)
  })
})

describe('defaultDemuxStarter', () => {
  it('é null sem MediaSource (jsdom, TV): comportamento idêntico ao de antes', () => {
    expect(defaultDemuxStarter()).toBeNull()
  })

  it('com MediaSource devolve um starter que liga a biblioteca ao elemento, sem log', async () => {
    vi.stubGlobal('MediaSource', class {})
    const starter = defaultDemuxStarter()
    expect(starter).not.toBeNull()

    const video = {} as HTMLVideoElement
    const onFailure = vi.fn()
    const handle = await starter!(video, 'http://h.test/live/u/p/1.ts', { onFailure })

    // D-006: log da biblioteca desligado antes de criar o player.
    expect(fakeMpegts.LoggingControl.applyConfig).toHaveBeenCalledWith(expect.objectContaining({ enableAll: false }))
    expect(fakeMpegts.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mpegts', isLive: true, url: 'http://h.test/live/u/p/1.ts' }),
      expect.anything(),
    )
    expect(fakePlayer.attachMediaElement).toHaveBeenCalledWith(video)
    expect(fakePlayer.load).toHaveBeenCalled()

    // O ERROR da biblioteca vira `onFailure()` sem repassar o argumento (pode embutir a URL).
    const [event, handler] = fakePlayer.on.mock.calls[0]
    expect(event).toBe('error')
    handler('NetworkError', { msg: 'http://h.test/live/u/p/1.ts' })
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenCalledWith()

    // destroy() é idempotente e depois dele a biblioteca não avisa mais.
    handle.destroy()
    handle.destroy()
    expect(fakePlayer.destroy).toHaveBeenCalledTimes(1)
    handler('NetworkError', {})
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('rejeita quando a biblioteca não é suportada, para o adaptador cair em PLAY-04', async () => {
    vi.stubGlobal('MediaSource', class {})
    fakeMpegts.isSupported.mockReturnValue(false)
    const starter = defaultDemuxStarter()
    await expect(starter!({} as HTMLVideoElement, 'http://h.test/1.ts', { onFailure: vi.fn() })).rejects.toThrow()
    expect(fakeMpegts.createPlayer).not.toHaveBeenCalled()
  })
})
