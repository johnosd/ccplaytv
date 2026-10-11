import { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerLayer } from '../PlayerLayer'
import { TrailerLayer } from '../TrailerLayer'
import { LicenseGate } from '../../features/portal/LicenseGate'
import type { PlayerAdapterCallbacks, PlayerAdapterFactory } from '../../lib/player/PlayerService'
import * as catalogApi from '../../features/catalog/catalogApi'
import * as userState from '../../lib/catalog/userStateRepository'
const fixture = vi.hoisted(() => ({ allowed: true, listeners: new Set<() => void>(), denied: new Set<() => void>(),
  snapshot: { decision: { allowed: true, reason: 'active' } } }))
vi.mock('../../lib/licensing/licenseRuntime', () => ({ commercialBuild: true,
  licenseMonitor: { check: () => fixture.snapshot.decision, getSnapshot: () => fixture.snapshot,
    subscribe: (listener: () => void) => { fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener) } } },
  onListEntryDenied: (listener: () => void) => { fixture.denied.add(listener); return () => { fixture.denied.delete(listener) } },
}))
vi.mock('../../features/catalog/catalogApi', async original => ({ ...await original<typeof catalogApi>(), fetchPlayback: vi.fn() }))
vi.mock('../../lib/catalog/userStateRepository', async original => ({ ...await original<typeof userState>(), updateProgress: vi.fn(async () => {}), clearProgress: vi.fn(async () => {}) }))
afterEach(() => { cleanup(); fixture.allowed = true; fixture.snapshot = { decision: { allowed: true, reason: 'active' } }; fixture.listeners.clear(); fixture.denied.clear(); vi.clearAllMocks() })
it('vencimento mantém PlayerLayer; saída voluntária salva a posição antes de close', async () => {
  let callbacks: PlayerAdapterCallbacks | undefined
  const close = vi.fn(), onPortal = vi.fn()
  const factory: PlayerAdapterFactory = value => { callbacks = value; return { name: 'fixture', rendersOnHardwarePlane: false,
    capabilities: { canPause: true, canSeek: true, reportsDuration: true, reportsPosition: true }, open: vi.fn(), close } }
  vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({ item_id: 'fixture-item', kind: 'movie', url: 'https://media.invalid/fixture.mp4', container_hint: 'mp4',
    source_id: 'fixture-source', provider_stream_id: '1', original_name: 'Fixture', series_id: null, season_number: null, episode_number: null })
  function Host() {
    const [playing, setPlaying] = useState(true)
    return <>{playing && <PlayerLayer itemId="fixture-item" title="Fixture" createAdapter={factory} onClose={() => setPlaying(false)} />}
      <button onClick={() => setPlaying(false)}>sair da lista fixture</button><LicenseGate activeSourceId="fixture-source" onStop={() => setPlaying(false)} onPortal={onPortal} /></>
  }
  render(<Host />)
  await waitFor(() => expect(callbacks).toBeDefined())
  act(() => { callbacks!.onStateChange('buffering'); callbacks!.onStateChange('playing'); callbacks!.onProgress!({ positionMs: 40000, durationMs: 1200000 }); callbacks!.onProgress!({ positionMs: 43000, durationMs: 1200000 }) })
  act(() => { fixture.allowed = false; fixture.snapshot = { decision: { allowed: false, reason: 'expired' } }; for (const listener of fixture.listeners) listener() })
  expect(close).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Licença necessária para abrir a lista' })).not.toBeInTheDocument()
  act(() => screen.getByRole('button', { name: 'sair da lista fixture' }).click())
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(vi.mocked(userState.updateProgress).mock.calls.map(call => call.slice(0, 3))).toContainEqual(['fixture-source|movie|id:1', 'fixture-source', 43])
  expect(vi.mocked(userState.updateProgress).mock.invocationCallOrder.at(-1)).toBeLessThan(close.mock.invocationCallOrder[0])
  expect(userState.clearProgress).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Licença necessária para abrir a lista' })).not.toBeInTheDocument()
  expect(onPortal).not.toHaveBeenCalled()
})
it('trailer continua disponível na lista já aberta após vencimento', async () => {
  fixture.allowed = false; fixture.snapshot = { decision: { allowed: false, reason: 'expired' } }
  const close = vi.fn()
  const view = render(<TrailerLayer title="Fixture" candidates={[{ videoId: 'fixture0001', kind: 'trailer', origin: 'provider' }]} onClose={close} />)
  expect(view.container.querySelector('iframe')).not.toBeNull()
  expect(close).not.toHaveBeenCalled()
})

it('vencimento sem reprodução mantém o usuário nas configurações', () => {
  const stop = vi.fn()
  render(<LicenseGate onStop={stop} onPortal={vi.fn()} />)
  act(() => { fixture.allowed = false; fixture.snapshot = { decision: { allowed: false, reason: 'expired' } }; for (const listener of fixture.listeners) listener() })
  expect(stop).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Licença necessária para abrir a lista' })).not.toBeInTheDocument()
})

it('entrada recusada oferece renovação com foco e RETURN sem apagar dados', () => {
  const stop = vi.fn()
  render(<LicenseGate onStop={stop} onPortal={vi.fn()} />)
  act(() => { for (const listener of fixture.denied) listener() })
  expect(stop).toHaveBeenCalledOnce()
  expect(screen.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Comprar ou renovar licença' })).toHaveClass('tv-focus')
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(screen.queryByRole('dialog', { name: 'Licença necessária para abrir a lista' })).not.toBeInTheDocument()
})
it('revogação confirmada mantém o encerramento da lista ativa', () => {
  const stop = vi.fn()
  render(<LicenseGate activeSourceId="source" onStop={stop} onPortal={vi.fn()} />)
  act(() => { fixture.allowed = false; fixture.snapshot = { decision: { allowed: false, reason: 'revoked' } }; for (const listener of fixture.listeners) listener() })
  expect(stop).toHaveBeenCalledOnce()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
