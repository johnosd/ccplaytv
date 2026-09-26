import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvplayAdapter, hasAvplay } from './avplayAdapter'
import type { PlayerAdapterCallbacks } from './PlayerService'

interface FakeAvplayListener {
  onbufferingstart?: () => void
  onbufferingcomplete?: () => void
  oncurrentplaytime?: (currentTime: number) => void
  onstreamcompleted?: () => void
  onerror?: (error: unknown) => void
}

function installFakeAvplay() {
  const listeners: FakeAvplayListener = {}
  const calls = {
    open: [] as string[],
    play: 0,
    pause: 0,
    stop: 0,
    close: 0,
    seekTo: [] as number[],
    jumpForward: [] as number[],
    jumpBackward: [] as number[],
  }
  let duration = 0
  let seekSettle: (() => void) | null = null
  let jumpSettle: (() => void) | null = null

  const fake = {
    open: (url: string) => calls.open.push(url),
    close: () => {
      calls.close += 1
    },
    prepareAsync: (onSuccess: () => void) => onSuccess(),
    play: () => {
      calls.play += 1
    },
    pause: () => {
      calls.pause += 1
    },
    stop: () => {
      calls.stop += 1
    },
    seekTo: (ms: number, onOk: () => void, _onErr: () => void) => {
      calls.seekTo.push(ms)
      seekSettle = onOk
    },
    jumpForward: (ms: number, onOk: () => void, _onErr: () => void) => {
      calls.jumpForward.push(ms)
      jumpSettle = onOk
    },
    jumpBackward: (ms: number, onOk: () => void, _onErr: () => void) => {
      calls.jumpBackward.push(ms)
      jumpSettle = onOk
    },
    getCurrentTime: () => 0,
    getDuration: () => duration,
    setListener: (listener: FakeAvplayListener) => {
      Object.assign(listeners, listener)
    },
    setDisplayRect: () => {},
  }

  // @ts-expect-error -- mock mínimo da Web API do Tizen
  window.webapis = { avplay: fake }

  return {
    calls,
    listeners,
    setDuration: (ms: number) => {
      duration = ms
    },
    settleSeek: () => {
      const s = seekSettle
      seekSettle = null
      s?.()
    },
    settleJump: () => {
      const s = jumpSettle
      jumpSettle = null
      s?.()
    },
  }
}

function fakeCallbacks() {
  return {
    onStateChange: vi.fn(),
    onError: vi.fn(),
    onProgress: vi.fn(),
    onCompleted: vi.fn(),
  } satisfies PlayerAdapterCallbacks
}

describe('avplayAdapter', () => {
  afterEach(() => {
    // @ts-expect-error -- propriedade injetada só em runtime Tizen real
    delete window.webapis
  })

  it('hasAvplay é falso sem window.webapis', () => {
    expect(hasAvplay()).toBe(false)
  })

  it('hasAvplay é verdadeiro com o motor instalado', () => {
    installFakeAvplay()
    expect(hasAvplay()).toBe(true)
  })

  it('declara capacidades completas — é a crença do motor, não a decisão final', () => {
    installFakeAvplay()
    const adapter = createAvplayAdapter(fakeCallbacks())
    expect(adapter.capabilities).toEqual({
      canPause: true,
      canSeek: true,
      reportsPosition: true,
      reportsDuration: true,
    })
  })

  describe('pause/resume', () => {
    it('pause() delega ao motor e reporta o estado paused', () => {
      const fake = installFakeAvplay()
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      adapter.pause?.()

      expect(fake.calls.pause).toBe(1)
      expect(callbacks.onStateChange).toHaveBeenCalledWith('paused')
    })

    it('resume() chama play() — o AVPlay não tem método de resume separado', () => {
      const fake = installFakeAvplay()
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      adapter.resume?.()

      expect(fake.calls.play).toBeGreaterThanOrEqual(1)
      expect(callbacks.onStateChange).toHaveBeenCalledWith('playing')
    })
  })

  describe('progresso', () => {
    it('oncurrentplaytime vira onProgress, com a duração real do motor', () => {
      const fake = installFakeAvplay()
      fake.setDuration(120_000)
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      fake.listeners.oncurrentplaytime?.(45_000)

      expect(callbacks.onProgress).toHaveBeenCalledWith({ positionMs: 45_000, durationMs: 120_000 })
    })

    it('sem duração conhecida (0), onProgress vem sem durationMs — nada é estimado', () => {
      const fake = installFakeAvplay()
      fake.setDuration(0)
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      fake.listeners.oncurrentplaytime?.(5_000)

      expect(callbacks.onProgress).toHaveBeenCalledWith({ positionMs: 5_000, durationMs: undefined })
    })
  })

  describe('onstreamcompleted', () => {
    it('vira onCompleted — e NÃO mais onError (a tradução é responsabilidade da sessão, D-008)', () => {
      const fake = installFakeAvplay()
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      fake.listeners.onstreamcompleted?.()

      expect(callbacks.onCompleted).toHaveBeenCalledTimes(1)
      expect(callbacks.onError).not.toHaveBeenCalled()
    })
  })

  describe('seekTo / jumpBy', () => {
    it('seekTo delega ao motor e chama onSettled ao voltar', () => {
      const fake = installFakeAvplay()
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      const onSettled = vi.fn()
      adapter.seekTo?.(30_000, onSettled)

      expect(fake.calls.seekTo).toEqual([30_000])
      expect(onSettled).not.toHaveBeenCalled()

      fake.settleSeek()
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('jumpBy positivo usa jumpForward', () => {
      const fake = installFakeAvplay()
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      const onSettled = vi.fn()
      adapter.jumpBy?.(10_000, onSettled)

      expect(fake.calls.jumpForward).toEqual([10_000])
      expect(fake.calls.jumpBackward).toEqual([])

      fake.settleJump()
      expect(onSettled).toHaveBeenCalledTimes(1)
    })

    it('jumpBy negativo usa jumpBackward com o valor absoluto', () => {
      const fake = installFakeAvplay()
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      adapter.jumpBy?.(-10_000, vi.fn())

      expect(fake.calls.jumpBackward).toEqual([10_000])
      expect(fake.calls.jumpForward).toEqual([])
    })

    it('erro de seekTo não repassa o objeto cru do motor (contrato §6)', () => {
      // @ts-expect-error -- mock mínimo da Web API do Tizen
      window.webapis = {
        avplay: {
          open: () => {},
          close: () => {},
          prepareAsync: (onSuccess: () => void) => onSuccess(),
          play: () => {},
          pause: () => {},
          stop: () => {},
          seekTo: (_ms: number, _onOk: () => void, onErr: (error: unknown) => void) =>
            onErr(new Error('falha em http://usuario:senha@exemplo.invalid/x.mp4')),
          jumpForward: () => {},
          jumpBackward: () => {},
          getCurrentTime: () => 0,
          getDuration: () => 0,
          setListener: () => {},
          setDisplayRect: () => {},
        },
      }
      const callbacks = fakeCallbacks()
      const adapter = createAvplayAdapter(callbacks)
      adapter.open('http://exemplo.invalid/x.mp4', { x: 0, y: 0, width: 1920, height: 1080 })

      const onSettled = vi.fn()
      // Não deve lançar, e onSettled deve rodar mesmo na falha (libera a porta).
      expect(() => adapter.seekTo?.(30_000, onSettled)).not.toThrow()
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })
})
