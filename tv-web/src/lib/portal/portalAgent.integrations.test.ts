import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { PortalAgent, type PortalAgentPorts } from './portalAgent'
import { portalTables } from './portalTables'

// Feature 077 (ADR-020): o passo `integrations` roda só no Atualizar de listas, depois do pull e antes do snapshot, e
// uma falha dele nunca derruba o snapshot.
const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })
async function fixture(applyIntegrations?: PortalAgentPorts['applyIntegrations']) {
  const name = 'test-077-agent-' + crypto.randomUUID()
  names.push(name)
  const db = new CatalogDb(name)
  await portalTables(db).device.put({ id: 'device', deviceId: 'fixture', bearer: 'private', deviceKey: 'private',
    recoveryCode: 'private', recoveryCodeVersion: 1, authEpoch: 1, recoveryEpoch: 'epoch', nextSyncAt: 0 })
  const calls: string[] = []
  const ports: PortalAgentPorts = {
    flushDeletions: vi.fn(async () => { calls.push('deletes') }),
    pull: vi.fn(async () => { calls.push('pull') }),
    publishSnapshot: vi.fn(async () => { calls.push('snapshot') }),
    refreshLicense: vi.fn(async () => { calls.push('license') }),
    applyIntegrations: applyIntegrations ?? vi.fn(async () => { calls.push('integrations') }),
    onError: vi.fn(),
  }
  const agent = new PortalAgent(db, ports)
  return { db, ports, calls, agent, stop: agent.attach() }
}

it('Atualizar de listas aplica a chave TMDB entre o pull e o snapshot; licença não a toca', async () => {
  const { db, ports, calls, agent, stop } = await fixture()
  try {
    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'pull', 'integrations', 'snapshot'])
    expect(await agent.refresh('license')).toEqual({ ok: true })
    expect(ports.applyIntegrations).toHaveBeenCalledOnce()
  } finally { stop(); db.close() }
})

it('falha do passo de integrações não derruba o snapshot nem o Atualizar, e só o código não secreto é avisado', async () => {
  const failing = vi.fn(async () => { throw new Error('falha com tmdb-marcador-077') })
  const { db, ports, calls, agent, stop } = await fixture(failing)
  try {
    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'pull', 'snapshot'])
    expect(ports.onError).toHaveBeenCalledWith('integrations_failed')
    expect(JSON.stringify((ports.onError as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('tmdb-marcador-077')
  } finally { stop(); db.close() }
})

it('sem a porta (TV sem conexão com o portal) o Atualizar segue sem o passo', async () => {
  const { db, ports, calls, agent, stop } = await fixture()
  try {
    delete (ports as { applyIntegrations?: unknown }).applyIntegrations
    expect(await agent.refresh('lists')).toEqual({ ok: true })
    expect(calls).toEqual(['deletes', 'pull', 'snapshot'])
  } finally { stop(); db.close() }
})
it('Atualizar da aba Integrações (escopo tmdb) só aplica a chave e publica o estado: sem exclusões, envios, pull nem licença', async () => {
  const { db, ports, calls, agent, stop } = await fixture()
  try {
    expect(await agent.refresh('tmdb')).toEqual({ ok: true })
    expect(calls).toEqual(['integrations', 'snapshot'])
    expect(ports.flushDeletions).not.toHaveBeenCalled()
    expect(ports.pull).not.toHaveBeenCalled()
    expect(ports.refreshLicense).not.toHaveBeenCalled()
    // A pausa de 10 s é por escopo: logo depois, o Atualizar de listas continua liberado.
    expect(await agent.refresh('tmdb')).toEqual({ ok: false, code: 'wait' })
    expect(await agent.refresh('lists')).toEqual({ ok: true })
  } finally { stop(); db.close() }
})
