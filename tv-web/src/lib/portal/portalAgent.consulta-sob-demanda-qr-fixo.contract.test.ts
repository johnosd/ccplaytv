import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalAgent, type PortalAgentPorts } from './portalAgent'
import { portalTables } from './portalTables'

const names: string[] = []
const stops: (() => void)[] = []
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(1_000_000) })
afterEach(async () => {
  for (const stop of stops.splice(0)) stop()
  vi.useRealTimers()
  for (const name of names.splice(0)) await Dexie.delete(name)
})

async function fixture(nextSyncAt: number) {
  const name = 'test-071-agent-' + crypto.randomUUID()
  names.push(name)
  const db = new CatalogDb(name)
  await portalTables(db).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private',
    deviceKey: 'private', recoveryCode: 'private', recoveryCodeVersion: 1,
    authEpoch: 1, recoveryEpoch: 'epoch', nextSyncAt })
  const calls: string[] = []
  const ports = {
    flushDeletions: vi.fn(async () => { calls.push('deletes') }),
    flushUploads: vi.fn(async () => { calls.push('uploads') }),
    pull: vi.fn(async () => { calls.push('pull') }),
    publishSnapshot: vi.fn(async () => { calls.push('snapshot') }),
    refreshLicense: vi.fn(async () => { calls.push('license') }),
    onError: vi.fn(),
  } satisfies PortalAgentPorts
  return { db, ports, calls }
}
async function settle() {
  // IndexedDB usa tarefas reais; os timers do agente continuam sob controle.
  for (let i = 0; i < 12; i++) await new Promise<void>(resolve => setImmediate(resolve))
}
async function advance(ms: number) {
  await settle()
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

// FR-001, FR-002, SC-001 — nenhuma requisição sem ação da pessoa, nem com o prazo vencido e telas "rápidas" abertas
it('sem ação da pessoa o agente não faz nenhuma requisição, mesmo com a TV parada por dias, visível e online', async () => {
  const { db, ports } = await fixture(Date.now())
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    stops.push(agent.attach(true))
    await advance(3 * 86_400_000)
    for (const port of Object.values(ports)) expect(port).not.toHaveBeenCalled()
  } finally { db.close() }
})

// FR-004, FR-005, SC-003 — escopos do Atualizar e pausa de 10 s sem requisição
it('Atualizar de listas envia exclusões, envios e busca nessa ordem; de licença só renova a licença; repetir em 10 s é recusado', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 10 * 86_400_000)
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))

    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'uploads', 'pull', 'snapshot'])

    expect(await agent.refresh('lists')).toEqual({ ok: false, code: 'wait' })
    expect(calls).toHaveLength(4)

    expect(await agent.refresh('license')).toEqual({ ok: true })
    expect(calls.slice(4)).toEqual(['license'])

    await advance(10_000)
    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls.slice(5)).toEqual(['deletes', 'uploads', 'pull', 'snapshot'])
  } finally { db.close() }
})