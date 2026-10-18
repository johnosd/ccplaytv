import Dexie from 'dexie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalAgent, sharedPortalAgent, type PortalAgentPorts } from './portalAgent'
import { PortalRequestError } from './portalClient'
import { portalTables } from './portalTables'
import { StorageFullError } from '../catalog/catalogRepository'

// Feature 071: o agente não tem ciclo nem timers. Aqui ficam só o ciclo de vida, a exclusão no ato e a exclusão de
// sobreposição; os contratos `portalAgent.consulta-sob-demanda-qr-fixo` definem Atualizar e a ausência de consulta.
const names: string[] = []
const stops: (() => void)[] = []
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(1_000_000) })
afterEach(async () => {
  for (const stop of stops.splice(0)) stop()
  vi.useRealTimers()
  for (const name of names.splice(0)) await Dexie.delete(name)
})
async function fixture() {
  const name = 'test-071-agent-' + crypto.randomUUID()
  names.push(name)
  const db = new CatalogDb(name)
  await portalTables(db).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private',
    deviceKey: 'private', recoveryCode: 'private', recoveryCodeVersion: 1,
    authEpoch: 1, recoveryEpoch: 'epoch', nextSyncAt: 0 })
  const calls: string[] = []
  const ports: PortalAgentPorts = {
    flushDeletions: vi.fn(async () => { calls.push('deletes') }),
    pull: vi.fn(async () => { calls.push('pull') }),
    publishSnapshot: vi.fn(async () => { calls.push('snapshot') }),
    refreshLicense: vi.fn(async () => { calls.push('license') }),
    onError: vi.fn(),
  }
  return { db, ports, calls }
}
async function settle() {
  // IndexedDB usa tarefas reais; os timers continuam sob controle.
  for (let i = 0; i < 12; i++) await new Promise<void>(resolve => setImmediate(resolve))
}
// Dexie notifica o liveQuery por setTimeout: com timers falsos, só emite quando o relógio de teste avança.
async function advance(ms = 0) {
  await settle()
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}
const pendingDelete = (id: string, createdAt = Date.now()) => ({ deletionId: id, sourceId: 'source-' + id, revision: 3, createdAt })

it('exclusão criada agora envia outbox + snapshot no ato: sem pull nem licença', async () => {
  const { db, ports, calls } = await fixture()
  try {
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await advance()
    expect(calls).toEqual([])
    await portalTables(db).deletes.put(pendingDelete('a'))
    await advance()
    expect(calls).toEqual(['deletes', 'snapshot'])
    expect(ports.pull).not.toHaveBeenCalled()
    expect(ports.refreshLicense).not.toHaveBeenCalled()
  } finally { db.close() }
})

it('deletedNow (ação da pessoa) envia no ato e junta com a outbox: um envio só, sem snapshot duplicado', async () => {
  const { db, ports, calls } = await fixture()
  try {
    // A porta real remove a linha ao receber o ACK; o fake faz o mesmo para o teste espelhar o uso.
    ports.flushDeletions = vi.fn(async () => { calls.push('deletes'); await portalTables(db).deletes.clear() })
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await advance()
    await portalTables(db).deletes.put(pendingDelete('b'))
    agent.deletedNow()
    agent.deletedNow()
    await advance()
    expect(calls).toEqual(['deletes', 'snapshot'])
    // Offline: não tenta e nada é reagendado; a outbox fica para o próximo Atualizar.
    agent.lifecycle(true, false)
    agent.deletedNow()
    await advance()
    expect(calls).toEqual(['deletes', 'snapshot'])
  } finally { db.close() }
})

it('exclusão herdada (offline/reinício) não é enviada ao abrir nem ao voltar online: sobe no próximo Atualizar', async () => {
  const { db, ports, calls } = await fixture()
  try {
    await portalTables(db).deletes.put(pendingDelete('inherited', 1))
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await advance()
    expect(calls).toEqual([])
    agent.lifecycle(true, false)
    vi.setSystemTime(Date.now() + 1_000)
    await portalTables(db).deletes.put(pendingDelete('offline-now'))
    await advance()
    agent.lifecycle(true, true)
    await advance()
    expect(calls).toEqual([])
    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'pull', 'snapshot'])
  } finally { db.close() }
})

it('exclusão durante um Atualizar espera o fim e nunca sobrepõe requisições', async () => {
  const { db, ports, calls } = await fixture()
  let active = 0, maxActive = 0
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
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await settle()
    await advance()
    const refreshing = agent.refresh('lists')
    await advance()
    expect(calls).toEqual(['deletes'])
    await portalTables(db).deletes.put(pendingDelete('during'))
    await advance()
    expect(calls).toEqual(['deletes'])
    release()
    expect(await refreshing).toEqual({ ok: true })
    await advance()
    expect(calls).toEqual(['deletes', 'pull', 'snapshot', 'deletes', 'snapshot'])
    expect(maxActive).toBe(1)
  } finally { db.close() }
})

it('falha do envio no ato preserva a outbox e não tenta de novo sozinha', async () => {
  const { db, ports, calls } = await fixture()
  ports.flushDeletions = vi.fn(async () => { calls.push('failed-delete'); throw Error('private-error') })
  try {
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await advance()
    await portalTables(db).deletes.put(pendingDelete('retry'))
    await advance()
    await advance(3_600_000)
    expect(calls).toEqual(['failed-delete'])
    expect(await portalTables(db).deletes.count()).toBe(1)
    expect(ports.pull).not.toHaveBeenCalled()
    expect(ports.onError).toHaveBeenCalledWith('sync_error')
  } finally { db.close() }
})

it('Atualizar offline não toca a rede; em falha devolve o código sem segredo', async () => {
  const { db, ports, calls } = await fixture()
  try {
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    agent.lifecycle(true, false)
    expect(await agent.refresh('lists')).toEqual({ ok: false, code: 'offline' })
    expect(calls).toEqual([])
    agent.lifecycle(true, true)
    ports.pull = vi.fn(async () => { throw new PortalRequestError('rate_limited', 8_000) })
    expect(await agent.refresh('lists')).toEqual({ ok: false, code: 'rate_limited' })
    expect(ports.onError).toHaveBeenCalledWith('rate_limited')
    // A pausa de 10 s vale também depois de uma falha.
    expect(await agent.refresh('lists')).toEqual({ ok: false, code: 'wait' })
  } finally { db.close() }
})

it('compartilha o agente por banco; ficar em segundo plano aborta o Atualizar antes do pull', async () => {
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
    stops.push(agent.attach(), agent.attach())
    expect(() => sharedPortalAgent(db, { ...ports })).toThrow('portal_agent_ports_changed')
    const refreshing = agent.refresh('lists')
    await settle()
    expect(ports.flushDeletions).toHaveBeenCalledOnce()
    agent.lifecycle(false, true)
    expect(signal.aborted).toBe(true)
    release()
    expect(await refreshing).toEqual({ ok: false, code: 'aborted' })
    expect(ports.pull).not.toHaveBeenCalled()
  } finally { db.close() }
})

// Feature 071, FR-008/FR-009: lista criada/editada agora sobe no ato (uma tentativa); offline não tenta e não agenda
it('uploadNow envia as listas + snapshot no ato, sem pull nem licença; offline fica na fila sem tentar', async () => {
  const { db, ports, calls } = await fixture()
  ports.flushUploads = vi.fn(async () => { calls.push('uploads') })
  try {
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await settle()
    agent.uploadNow()
    await advance()
    expect(calls).toEqual(['uploads', 'snapshot'])
    expect(ports.pull).not.toHaveBeenCalled()
    expect(ports.refreshLicense).not.toHaveBeenCalled()

    agent.lifecycle(true, false)
    agent.uploadNow()
    await advance(3_600_000)
    expect(calls).toEqual(['uploads', 'snapshot'])
  } finally { db.close() }
})

it('072: Atualizar de listas faz o backup depois do snapshot; o botão de backup só faz o backup; reset esquece a pausa', async () => {
  const { db, ports, calls } = await fixture()
  ports.backup = vi.fn(async () => { calls.push('backup') })
  try {
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await advance()
    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'pull', 'snapshot', 'backup'])
    calls.length = 0
    expect(await agent.refresh('backup')).toEqual({ ok: true })
    expect(calls).toEqual(['backup'])
    expect(await agent.refresh('backup')).toEqual({ ok: false, code: 'wait' })
    agent.reset()
    expect(await agent.refresh('backup')).toEqual({ ok: true })
  } finally { db.close() }
})

// 073/D-008, D-009: o Atualizar de licença envia a cópia do código antes da licença; falha dela não derruba o Atualizar.
it('Atualizar de licença tenta a cópia do código antes e segue com a licença mesmo se ela falhar', async () => {
  const { db, ports, calls } = await fixture()
  try {
    ports.escrowRecoveryCode = vi.fn(async () => { calls.push('escrow'); throw new PortalRequestError('network_error') })
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    await advance()
    expect(await agent.refresh('license')).toEqual({ ok: true })
    expect(calls).toEqual(['escrow', 'license'])
    expect(ports.onError).toHaveBeenCalledWith('escrow_failed')
  } finally { db.close() }
})

// Bug armazenamento-app-cheio-na-tv-impede: falta de espaço no aparelho vira `storage_full` (mensagem de limite de
// armazenamento do app), não o `sync_error` genérico que escondia a causa na TV.
it('Atualizar da licença sem espaço no aparelho devolve storage_full; outro erro local continua sync_error', async () => {
  const { db, ports } = await fixture()
  try {
    const quota = Object.assign(new Error('x'), { name: 'AbortError', inner: { name: 'QuotaExceededError' } })
    ports.refreshLicense = vi.fn<NonNullable<PortalAgentPorts['refreshLicense']>>()
      .mockRejectedValueOnce(new StorageFullError()).mockRejectedValueOnce(quota).mockRejectedValueOnce(new TypeError('outro'))
    const agent = new PortalAgent(db, ports)
    stops.push(agent.attach())
    expect(await agent.refresh('license')).toMatchObject({ ok: false, code: 'storage_full' })
    vi.setSystemTime(Date.now() + 11_000)
    expect(await agent.refresh('license')).toMatchObject({ ok: false, code: 'storage_full' })
    vi.setSystemTime(Date.now() + 11_000)
    expect(await agent.refresh('license')).toMatchObject({ ok: false, code: 'sync_error' })
  } finally { db.close() }
})