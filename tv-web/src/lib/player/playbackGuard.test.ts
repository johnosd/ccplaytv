import { expect, it, vi } from 'vitest'
import { createPlayerSession, FULLSCREEN_REGION, type PlayerAdapterCallbacks, type PlayerAdapterFactory, type PlayableKind } from './PlayerService'
// A autorização é feita ao entrar na lista; playback não revalida seu vencimento.
it.each<PlayableKind>(['channel', 'movie', 'series', 'episode', 'unclassified', 'archive'])('lista admitida mantém %s disponível até sair', kind => {
  const open = vi.fn(), close = vi.fn()
  const factory: PlayerAdapterFactory = () => ({ name: 'fixture', rendersOnHardwarePlane: false,
    capabilities: { canPause: true, canSeek: true, reportsDuration: true, reportsPosition: true }, open, close })
  const session = createPlayerSession('fixture', FULLSCREEN_REGION, kind, { createAdapter: factory })
  expect(open).toHaveBeenCalledOnce()
  session.close()
  expect(close).toHaveBeenCalledOnce()
})
it('retomada pausada permanece disponível na sessão da lista', () => {
  let callbacks: PlayerAdapterCallbacks | undefined
  const resume = vi.fn()
  const factory: PlayerAdapterFactory = value => { callbacks = value; return { name: 'fixture', rendersOnHardwarePlane: false,
    capabilities: { canPause: true, canSeek: true, reportsDuration: true, reportsPosition: true }, open: vi.fn(), resume, close: vi.fn() } }
  const session = createPlayerSession('fixture', FULLSCREEN_REGION, 'movie', { createAdapter: factory })
  callbacks!.onStateChange('buffering'); callbacks!.onStateChange('playing'); callbacks!.onStateChange('paused')
  session.togglePause()
  expect(resume).toHaveBeenCalledOnce()
  session.close()
})
