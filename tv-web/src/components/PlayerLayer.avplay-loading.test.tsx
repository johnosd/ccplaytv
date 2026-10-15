import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import { createAvplayAdapter } from '../lib/player/avplayAdapter'

vi.mock('../features/catalog/catalogApi', async (original) => ({
  ...await original<typeof import('../features/catalog/catalogApi')>(),
  fetchPlayback: vi.fn(async () => ({ item_id: 'c1', kind: 'channel', url: 'http://example.invalid/live.ts', source_id: 's1', provider_stream_id: '1' })),
}))
vi.mock('../lib/player/playbackSourceAccess', () => ({ readPlaybackSourceAccess: async () => null }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('Live: tempo crescente do AVPlay remove Carregando sem bufferingcomplete e RETURN fecha', async () => {
  let listener: { oncurrentplaytime?: (ms: number) => void; onbufferingstart?: () => void } = {}
  const stop = vi.fn(), onClose = vi.fn(), onEnteredPlaying = vi.fn()
  vi.stubGlobal('webapis', { avplay: {
    open: vi.fn(), close: vi.fn(), stop, play: vi.fn(),
    prepareAsync: (ready: () => void) => ready(),
    setListener: (value: typeof listener) => { listener = value },
    setDisplayRect: vi.fn(), getDuration: () => 0,
  } })
  render(<PlayerLayer itemId="c1" title="Canal" createAdapter={createAvplayAdapter} onClose={onClose} onEnteredPlaying={onEnteredPlaying} />)
  await waitFor(() => expect(screen.getByText('Carregando…')).toBeInTheDocument())
  act(() => { listener.oncurrentplaytime?.(0); listener.oncurrentplaytime?.(1000) })
  expect(screen.queryByText('Carregando…')).not.toBeInTheDocument()
  expect(onEnteredPlaying).toHaveBeenCalledTimes(1)
  act(() => listener.onbufferingstart?.())
  expect(screen.getByText('Carregando…')).toBeInTheDocument()
  act(() => { listener.oncurrentplaytime?.(1000); listener.oncurrentplaytime?.(2000) })
  expect(screen.queryByText('Carregando…')).not.toBeInTheDocument()
  expect(onEnteredPlaying).toHaveBeenCalledTimes(1)
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(onClose).toHaveBeenCalledTimes(1)
})
