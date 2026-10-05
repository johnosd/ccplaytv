/** Feature 058 (T029, `logic/arquivo.md` §4): linha do tempo do EPG na sessão de arquivo. */
import { describe, expect, it, vi } from 'vitest'
import {
  createPlayerSession,
  FULLSCREEN_REGION,
  type PlayerAdapter,
  type PlayerAdapterCallbacks,
  type PlayerTimeline,
} from './PlayerService'

function setup(kind: 'archive' | 'movie', timeline?: PlayerTimeline) {
  let callbacks!: PlayerAdapterCallbacks
  const seekTo = vi.fn((_ms: number, onSettled: () => void) => onSettled())
  const jumpBy = vi.fn((_ms: number, onSettled: () => void) => onSettled())
  const adapter: PlayerAdapter = {
    name: 'fake',
    rendersOnHardwarePlane: false,
    capabilities: { canPause: true, canSeek: true, reportsPosition: true, reportsDuration: true },
    open: () => {},
    close: () => {},
    seekTo,
    jumpBy,
  }
  const session = createPlayerSession('http://x.invalid/1.ts', FULLSCREEN_REGION, kind, {
    createAdapter: (cb) => {
      callbacks = cb
      return adapter
    },
    timeline,
  })
  return { session, callbacks, seekTo, jumpBy }
}

const MIN = 60_000

describe('PlayerServiceSession — timeline (feature 058)', () => {
  it('a duração do EPG sobrepõe a do motor (inclusive quando o motor não informa)', () => {
    const { session, callbacks } = setup('archive', { durationMs: 90 * MIN })
    callbacks.onProgress?.({ positionMs: MIN })
    expect(session.progress).toEqual({ positionMs: MIN, durationMs: 90 * MIN })
    callbacks.onProgress?.({ positionMs: 2 * MIN, durationMs: 3 * MIN })
    expect(session.progress?.durationMs).toBe(90 * MIN)
  })

  it('no programa em exibição a busca para no "agora"', () => {
    const { session, callbacks, seekTo, jumpBy } = setup('archive', { durationMs: 90 * MIN, maxPositionMs: () => 30 * MIN })
    callbacks.onProgress?.({ positionMs: 25 * MIN })
    session.seekTo(80 * MIN)
    expect(seekTo).toHaveBeenLastCalledWith(30 * MIN, expect.any(Function))
    session.jumpBy(10 * MIN)
    expect(jumpBy).toHaveBeenLastCalledWith(5 * MIN, expect.any(Function))
  })

  it('programa encerrado: só o fim do programa limita', () => {
    const { session, callbacks, seekTo } = setup('archive', { durationMs: 90 * MIN })
    callbacks.onProgress?.({ positionMs: 0 })
    session.seekTo(200 * MIN)
    expect(seekTo).toHaveBeenLastCalledWith(90 * MIN - 1, expect.any(Function))
  })

  it('sem timeline nada muda', () => {
    const { session, callbacks, seekTo } = setup('movie')
    callbacks.onProgress?.({ positionMs: 0 })
    expect(session.progress).toEqual({ positionMs: 0 })
    session.seekTo(500 * MIN)
    expect(seekTo).toHaveBeenLastCalledWith(500 * MIN, expect.any(Function))
  })
})
