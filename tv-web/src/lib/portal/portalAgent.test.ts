import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalAgent, sharedPortalAgent, type PortalAgentPorts } from './portalAgent'
import { portalTables } from './portalTables'

const names: string[] = []
const stops: (() => void)[] = []
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(1_000_000) })
afterEach(async () => {
  for (const stop of stops.splice(0)) stop()
  vi.useRealTimers()
  for (const name of names.splice(0)) await Dexie.delete(name)
})
async function fixture(nextSyncAt = Date.now()) {
  const name = 'test-069-agent-' + crypto.randomUUID()
  names.push(name)
  const db = new CatalogDb(name)
  await portalTables(db).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private',
    deviceKey: 'private', recoveryCode: 'private', recoveryCodeVersion: 1,
    authEpoch: 1, recoveryEpoch: 'epoch', nextSyncAt })
  const calls: string[] = []
  const ports: PortalAgentPorts = {
    flushDeletions: vi.fn(async () => { calls.push('deletes') }),
    pull: vi.fn(async () => { calls.push('pull') }),
    publishSnapshot: vi.fn(async () => { calls.push('snapshot') }),
    onError: vi.fn(),
  }
  return { db, ports, calls }
}
async function settle() {
  // IndexedDB usa tarefas reais; os timers de sincronização continuam sob controle.
  for (let i = 0; i < 12; i++) await new Promise<void>(resolve => setImmediate(resolve))
}
async function advance(ms: number) {
  await settle()
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

it('envia exclusões antes do pull e persiste prazo24h que novo agente respeita', async () => {
  const { db, ports, calls } = await fixture()
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    const stop = agent.attach(false)
    await advance(0)
    expect(calls).toEqual(['deletes', 'pull', 'snapshot'])
    const saved = await portalTables(db).device.get('device')
    expect(saved?.nextSyncAt).toBe(Date.now() + 86_400_000)
    stop()
    const reopened = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(reopened.attach(false))
    await advance(86_399_999)
    expect(calls).toHaveLength(3)
    await advance(1)
    expect(calls).toHaveLength(6)
  } finally { db.close() }
})

it('rápido imediato/10s termina ao sair, suspend cancela e resume normal respeita prazo', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    const quick = agent.attach(true)
    const normal = agent.attach(false)
    stops.push(normal)
    await advance(0)
    expect(calls).toHaveLength(3)
    await advance(9_999)
    expect(calls).toHaveLength(3)
    await advance(1)
    expect(calls).toHaveLength(6)
    agent.lifecycle(false, true)
    await advance(60_000)
    expect(calls).toHaveLength(6)
    quick()
    agent.lifecycle(true, true)
    await advance(0)
    expect(calls).toHaveLength(6)
  } finally { db.close() }
})

it('falha de exclusão impede pull, retries1/5/15min são duráveis e terminam após3', async () => {
  const { db, ports, calls } = await fixture()
  ports.flushDeletions = vi.fn(async () => { calls.push('failed-delete'); throw Error('private-error') })
  try {
    let agent = new PortalAgent(db, ports, Date.now, () => 0)
    let stop = agent.attach(false)
    await advance(0)
    expect(calls).toEqual(['failed-delete'])
    expect((await portalTables(db).device.get('device'))?.syncRetry).toEqual({ attempt: 1, dueAt: Date.now() + 60_000 })
    stop()
    agent = new PortalAgent(db, ports, Date.now, () => 0)
    stop = agent.attach(false)
    stops.push(stop)
    for (const delay of [60_000, 300_000, 900_000]) await advance(delay)
    expect(calls).toHaveLength(4)
    expect(ports.pull).not.toHaveBeenCalled()
    const saved = await portalTables(db).device.get('device')
    expect(saved?.syncRetry).toBeUndefined()
    expect(saved?.nextSyncAt).toBe(Date.now() + 86_400_000)
    await advance(900_000)
    expect(calls).toHaveLength(4)
    expect(ports.onError).toHaveBeenCalledWith('sync_error')
  } finally { db.close() }
})

it('compartilha mutex e não sobrepõe requests; background aborta antes do pull', async () => {
  const { db, ports } = await fixture()
  let release!: () => void
  let signal!: AbortSignal
  ports.flushDeletions = vi.fn(async value => {
    signal = value
    await new Promise<void>(resolve => { release = resolve })
  })
  try {
    const agent = sharedPortalAgent(db, ports)
    expect(sharedPortalAgent(db, ports)).toBe(agent)
    expect(() => sharedPortalAgent(db, { ...ports })).toThrow('portal_agent_ports_changed')
    stops.push(agent.attach(true), agent.attach(true))
    await advance(0)
    await advance(30_000)
    expect(ports.flushDeletions).toHaveBeenCalledOnce()
    agent.lifecycle(false, true)
    expect(signal.aborted).toBe(true)
    release()
    await settle()
    expect(ports.pull).not.toHaveBeenCalled()
  } finally { db.close() }
})


const pendingDelete = (id: string) => ({ deletionId: id, sourceId: 'source-' + id, revision: 3, createdAt: Date.now() })

it('exclusão local fora da tela rápida envia outbox + snapshot: sem pull, licença nem polling; prazo 24h intacto', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  const refreshLicense = vi.fn(async () => {})
  ports.refreshLicense = refreshLicense
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    await advance(0)
    expect(calls).toEqual([])
    await portalTables(db).deletes.put(pendingDelete('a'))
    await advance(0)
    expect(calls).toEqual(['deletes', 'snapshot'])
    await advance(120_000)
    expect(calls).toEqual(['deletes', 'snapshot'])
    expect(ports.pull).not.toHaveBeenCalled()
    expect(refreshLicense).not.toHaveBeenCalled()
    expect((await portalTables(db).device.get('device'))?.nextSyncAt).toBe(1_000_000 + 86_400_000)
  } finally { db.close() }
})

it('exclusão guardada na outbox (offline/reinício) é enviada quando o agente é anexado', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  try {
    await portalTables(db).deletes.put(pendingDelete('offline'))
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    await advance(0)
    expect(calls).toEqual(['deletes', 'snapshot'])
  } finally { db.close() }
})

it('exclusão durante um ciclo em andamento espera o ciclo terminar e nunca sobrepõe requests', async () => {
  const { db, ports, calls } = await fixture()
  let active = 0
  let maxActive = 0
  let release!: () => void
  let first = true
  ports.flushDeletions = vi.fn(async () => {
    active++
    maxActive = Math.max(maxActive, active)
    calls.push('deletes')
    if (first) { first = false; await new Promise<void>(resolve => { release = resolve }) }
    active--
  })
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    await advance(0)
    expect(calls).toEqual(['deletes'])
    await portalTables(db).deletes.put(pendingDelete('during'))
    await settle()
    expect(calls).toEqual(['deletes'])
    release()
    await advance(0)
    expect(calls).toEqual(['deletes', 'pull', 'snapshot', 'deletes', 'snapshot'])
    expect(maxActive).toBe(1)
  } finally { db.close() }
})

it('falha do envio imediato preserva a outbox e usa o backoff do ciclo normal (1 min), sem pull', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  ports.flushDeletions = vi.fn(async () => { calls.push('failed-delete'); throw Error('private-error') })
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    await advance(0)
    await portalTables(db).deletes.put(pendingDelete('retry'))
    await advance(0)
    expect(calls).toEqual(['failed-delete'])
    expect((await portalTables(db).device.get('device'))?.syncRetry).toEqual({ attempt: 1, dueAt: Date.now() + 60_000 })
    expect(await portalTables(db).deletes.count()).toBe(1)
    expect(ports.pull).not.toHaveBeenCalled()
    expect(ports.onError).toHaveBeenCalledWith('sync_error')
  } finally { db.close() }
})

it('exclusão pedida offline/em background só é enviada ao voltar online e visível', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    await advance(0)
    agent.lifecycle(true, false)
    await portalTables(db).deletes.put(pendingDelete('offline-now'))
    await advance(0)
    expect(calls).toEqual([])
    agent.lifecycle(true, true)
    await advance(0)
    expect(calls).toEqual(['deletes', 'snapshot'])
  } finally { db.close() }
})

it('070/D-011: syncNow roda um ciclo completo fora do prazo, espera 10,2 s desde o último e devolve o código em falha', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    await advance(0)
    expect(calls).toEqual([])
    const first = agent.syncNow()
    await advance(0)
    expect(await first).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'pull', 'snapshot'])
    const second = agent.syncNow()
    await advance(5_000)
    expect(calls).toHaveLength(3) // ainda dentro dos 10,2 s do limite de pull
    await advance(5_200)
    expect(await second).toEqual({ ok: true })
    expect(calls).toHaveLength(6)
    ports.pull = vi.fn(async () => { throw new (await import('./portalClient')).PortalRequestError('rate_limited', 8_000) })
    const failed = agent.syncNow()
    await advance(10_200)
    expect(await failed).toEqual({ ok: false, code: 'rate_limited' })
  } finally { db.close() }
})

it('070/D-011: syncNow offline não toca a rede', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(false))
    agent.lifecycle(true, false)
    expect(await agent.syncNow()).toEqual({ ok: false, code: 'offline' })
    expect(calls).toEqual([])
  } finally { db.close() }
})

it('falha rápida cresce até60s; relógio avançado no standby reconcilia só um ciclo', async () => {
  const { db, ports, calls } = await fixture(Date.now() + 86_400_000)
  ports.flushDeletions = vi.fn(async () => { calls.push('failed'); throw Error('private') })
  try {
    const agent = new PortalAgent(db, ports, Date.now, () => 0)
    stops.push(agent.attach(true))
    await advance(0)
    for (const delay of [10_000, 20_000, 40_000, 60_000]) await advance(delay)
    expect(calls).toHaveLength(5)
    await advance(59_999)
    expect(calls).toHaveLength(5)
    vi.setSystemTime(Date.now() + 3_600_000)
    await advance(1)
    expect(calls).toHaveLength(6)
    await advance(0)
    expect(calls).toHaveLength(6)
    expect((await portalTables(db).device.get('device'))?.syncRetry).toBeUndefined()
  } finally { db.close() }
})
