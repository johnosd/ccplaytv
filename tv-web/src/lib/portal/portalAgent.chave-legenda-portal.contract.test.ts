// Contrato da feature 091: o Atualizar da seção Legendas aplica SÓ as chaves de legenda; o do card TMDB aplica tudo.
// Travado pelo sdd-plan.
import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalAgent, type PortalAgentPorts } from './portalAgent'
import { portalTables } from './portalTables'

const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })

async function fixture() {
  const name = 'test-091-agent-' + crypto.randomUUID()
  names.push(name)
  const db = new CatalogDb(name)
  await portalTables(db).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private', deviceKey: 'private',
    recoveryCode: 'private', recoveryCodeVersion: 1, authEpoch: 1, recoveryEpoch: 'epoch', nextSyncAt: 0 })
  const calls: string[] = []
  const applyIntegrations = vi.fn(async (_signal: AbortSignal, only?: 'subtitles') => { calls.push('integrations:' + (only ?? 'all')) })
  const ports: PortalAgentPorts = {
    flushDeletions: vi.fn(async () => { calls.push('deletes') }),
    pull: vi.fn(async () => { calls.push('pull') }),
    publishSnapshot: vi.fn(async () => { calls.push('snapshot') }),
    refreshLicense: vi.fn(async () => { calls.push('license') }),
    applyIntegrations,
    onError: vi.fn(),
  }
  const agent = new PortalAgent(db, ports)
  return { db, ports, calls, agent, stop: agent.attach() }
}

it('FR-005, US1/AC3-AC4: escopo "subtitles" aplica só as chaves de legenda e publica o estado; "tmdb" e "lists" aplicam tudo; nada de pull, exclusões ou licença no primeiro', async () => {
  const { db, ports, calls, agent, stop } = await fixture()
  try {
    expect(await agent.refresh('subtitles')).toEqual({ ok: true })
    expect(calls).toEqual(['integrations:subtitles', 'snapshot'])
    expect(ports.flushDeletions).not.toHaveBeenCalled(); expect(ports.pull).not.toHaveBeenCalled(); expect(ports.refreshLicense).not.toHaveBeenCalled()

    // A pausa de 10 s é por escopo: o Atualizar do card TMDB continua liberado e aplica as duas coisas.
    expect(await agent.refresh('subtitles')).toEqual({ ok: false, code: 'wait' })
    calls.length = 0
    expect(await agent.refresh('tmdb')).toEqual({ ok: true })
    expect(calls).toEqual(['integrations:all', 'snapshot'])
    calls.length = 0
    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'pull', 'integrations:all', 'snapshot'])
  } finally { stop(); db.close() }
})
