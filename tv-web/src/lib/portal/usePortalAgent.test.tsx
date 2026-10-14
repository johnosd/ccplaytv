import Dexie from 'dexie'
import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { portalTables } from './portalTables'
import { refreshPortal } from './portalRuntime'
import { usePortalAgent } from './usePortalAgent'

it('mounts compartilham agente; offline impede rede, só Atualizar consulta e desmontar o desliga', async () => {
  const online = Object.getOwnPropertyDescriptor(navigator, 'onLine')
  const db = new CatalogDb('test-071-hook-' + crypto.randomUUID())
  let unmount = () => {}
  try {
    await portalTables(db).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private',
      deviceKey: 'private', recoveryCode: 'private', recoveryCodeVersion: 1,
      authEpoch: 1, recoveryEpoch: 'epoch', nextSyncAt: 0 })
    const ports = { flushDeletions: vi.fn(async () => {}), pull: vi.fn(async () => {}),
      publishSnapshot: vi.fn(async () => {}) }
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const hook = renderHook(() => { usePortalAgent(db, ports); usePortalAgent(db, ports) })
    unmount = hook.unmount
    await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 20)) })
    // Montar não consulta nada, nem online, nem parado: só o botão Atualizar fala com o serviço.
    expect(ports.pull).not.toHaveBeenCalled()
    await act(async () => { expect(await refreshPortal('lists')).toEqual({ ok: false, code: 'offline' }) })
    expect(ports.pull).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    await act(async () => { window.dispatchEvent(new Event('online')); await new Promise<void>(resolve => setTimeout(resolve, 20)) })
    expect(ports.pull).not.toHaveBeenCalled()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(ports.pull).not.toHaveBeenCalled()
    await act(async () => { expect(await refreshPortal('lists')).toEqual({ ok: true }) })
    expect(ports.pull).toHaveBeenCalledOnce()
    unmount()
    expect(await refreshPortal('lists')).toEqual({ ok: false, code: 'unavailable' })
  } finally {
    unmount()
    if (online) Object.defineProperty(navigator, 'onLine', online)
    else Reflect.deleteProperty(navigator, 'onLine')
    db.close()
    await Dexie.delete(db.name)
  }
})
