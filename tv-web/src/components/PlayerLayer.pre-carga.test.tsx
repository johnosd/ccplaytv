import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerLayer } from './PlayerLayer'
import { prefetchGate } from '../lib/catalog/prefetch'
import type { PlayerAdapter, PlayerAdapterFactory } from '../lib/player/PlayerService'

vi.mock('../features/catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/catalog/catalogApi')>()
  // Nunca resolve: a camada fica aberta, "resolvendo", sem motor nem IndexedDB.
  return { ...actual, fetchPlayback: vi.fn(() => new Promise(() => {})) }
})

const idleAdapter: PlayerAdapterFactory = (): PlayerAdapter => ({
  name: 'fake',
  rendersOnHardwarePlane: false,
  capabilities: { canPause: false, canSeek: false, reportsPosition: false, reportsDuration: false },
  open: () => {},
  close: () => {},
  pause: () => {},
  resume: () => {},
  seekTo: () => {},
})

afterEach(() => cleanup())

describe('PlayerLayer × pré-carga (feature 038, FR-004)', () => {
  it('camada montada bloqueia o início de categorias; desmontada, libera', () => {
    expect(prefetchGate.blockReason(Date.now() + 60_000, 2000)).toBeUndefined()
    const { unmount } = render(
      <PlayerLayer itemId="1" title="Canal" onClose={() => {}} createAdapter={idleAdapter} />,
    )
    expect(prefetchGate.blockReason(Date.now() + 60_000, 2000)).toBe('playback')
    unmount()
    expect(prefetchGate.blockReason(Date.now() + 60_000, 2000)).toBeUndefined()
  })
})
