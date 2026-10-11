import Dexie from 'dexie'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { portalTables } from './portalTables'
import { usePortalAgent } from './usePortalAgent'

it('mounts compartilham agente; offline impede rede e foco não consulta', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const online = Object.getOwnPropertyDescriptor(navigator, 'onLine')
  const db = new CatalogDb('test-069-hook-' + crypto.randomUUID())
  let unmount = () => {}
  try {
    await portalTables(db).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private',
      deviceKey: 'private', recoveryCode: 'private', recoveryCodeVersion: 1,
      authEpoch: 1, recoveryEpoch: 'epoch', nextSyncAt: Date.now() + 86_400_000 })
    const ports = { flushDeletions: vi.fn(async () => {}), pull: vi.fn(async () => {}),
      publishSnapshot: vi.fn(async () => {}) }
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const hook = renderHook(() => { usePortalAgent(db, ports, true); usePortalAgent(db, ports, true) })
    unmount = hook.unmount
    const settle = async () => {
      for (let i = 0; i < 12; i++) await new Promise<void>(resolve => queueMicrotask(resolve))
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    await act(async () => { await settle(); await vi.advanceTimersByTimeAsync(0); await settle() })
    expect(ports.pull).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await settle()
      await vi.advanceTimersByTimeAsync(0)
      await settle()
    })
    // IndexedDB termina fora dos timers de consulta; aguardar commit real.
    for (let i = 0; i < 12; i++) await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
      await portalTables(db).device.get('device')
    })
    expect(ports.pull).toHaveBeenCalledOnce()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(ports.pull).toHaveBeenCalledOnce()
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(ports.pull).toHaveBeenCalledOnce()
  } finally {
    unmount()
    if (online) Object.defineProperty(navigator, 'onLine', online)
    else Reflect.deleteProperty(navigator, 'onLine')
    db.close()
    vi.useRealTimers()
    await Dexie.delete(db.name)
  }
})
