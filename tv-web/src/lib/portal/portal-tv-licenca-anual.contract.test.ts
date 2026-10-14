import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { createSource, getSource, readCredential, updateSource } from '../catalog/sourceRepository'
import { evaluatePlaybackAccess } from '../licensing/playbackAccess'
import { applyRemoteMutation, toPortalSourceView, type RemoteMutation } from './remoteConfiguration'

let database: CatalogDb
beforeEach(async () => {
  database = new CatalogDb('test-portal-069-' + Math.random().toString(36).slice(2))
  await database.open()
})
afterEach(async () => { await database.delete() })

const provider = {
  type: 'provider_credentials' as const,
  displayName: 'Lista de teste',
  providerDns: 'https://provider.example.test',
  providerUsername: 'usuario-ficticio',
  providerPassword: 'senha-ficticia',
}

it('US1/AC3-4 FR-009-010 cria lista local e reenvio não duplica nem reimporta', async () => {
  const importSource = vi.fn(async (_sourceId: string) => {})
  const mutation: RemoteMutation = {
    operationId: 'op-create', deviceId: 'tv-a', sourceId: 'source-remote',
    expectedRevision: 0, action: 'create', input: provider,
  }
  const options = { deviceId: 'tv-a', database, importSource }
  const first = await applyRemoteMutation(mutation, options)
  const replay = await applyRemoteMutation(mutation, options)
  expect(first).toEqual({ state: 'applied', sourceId: 'source-remote', revision: 1 })
  expect(replay).toEqual(first)
  expect(await database.sources.count()).toBe(1)
  expect((await getSource('source-remote', database))?.displayName).toBe(provider.displayName)
  expect(importSource).toHaveBeenCalledExactlyOnceWith('source-remote')
})

it('US1/AC6 FR-010 revisão antiga não sobrescreve edição local', async () => {
  const sourceId = await createSource(provider, database)
  await updateSource(sourceId, { displayName: 'Editado na TV' }, database)
  const importSource = vi.fn(async (_sourceId: string) => {})
  const result = await applyRemoteMutation({
    operationId: 'op-stale', deviceId: 'tv-a', sourceId,
    expectedRevision: 0, action: 'update', input: { displayName: 'Obsoleto' },
  }, { deviceId: 'tv-a', database, importSource })
  expect(result.state).toBe('conflict')
  expect((await getSource(sourceId, database))?.displayName).toBe('Editado na TV')
  expect((await readCredential(sourceId, database))?.password).toBe(provider.providerPassword)
  expect(importSource).not.toHaveBeenCalled()
})

it('FR-005 envelope destinado a outra TV não altera armazenamento nem inicia importação', async () => {
  const importSource = vi.fn(async (_sourceId: string) => {})
  const result = await applyRemoteMutation({
    operationId: 'op-other', deviceId: 'tv-b', sourceId: 'foreign-source',
    expectedRevision: 0, action: 'create', input: provider,
  }, { deviceId: 'tv-a', database, importSource })
  expect(result.state).toBe('wrong_device')
  expect(await database.sources.count()).toBe(0)
  expect(importSource).not.toHaveBeenCalled()
})

it('FR-013-014 Constitution: segredos ficam fora da projeção remota por allowlist', async () => {
  const id = await createSource({ type: 'm3u_url', displayName: 'Minha lista',
    m3uUrl: 'https://provider.example.test/get.php?username=fake-user&password=fake-pass' }, database)
  const source = await getSource(id, database)
  expect(source).toBeDefined()
  const view = toPortalSourceView(Object.assign({}, source!, {
    providerDns: 'https://fake-token@provider.example.test',
    providerPassword: 'fake-private', futureSecret: 'fake-new-secret',
  }))
  expect(view).toEqual({ id, type: 'm3u_url', displayName: 'Minha lista',
    connectionState: 'never_synced', updatedAt: source!.updatedAt })
  expect(JSON.stringify(view)).not.toMatch(/fake-|m3uUrl|providerDns|password|futureSecret/)
})

it('US3/AC7 FR-025-027 licença válida funciona offline e vence sem apagar ou consultar rede', () => {
  const entitlement = { deviceId: 'tv-a', startsAt: 1000, expiresAt: 5000, state: 'active' as const }
  const input = { deviceId: 'tv-a', entitlement, verification: 'valid' as const,
    trustedNow: 4999, serviceOnline: false }
  expect(evaluatePlaybackAccess(input)).toEqual({ allowed: true, reason: 'valid' })
  expect(evaluatePlaybackAccess({ ...input, trustedNow: 5000 })).toEqual({ allowed: false, reason: 'expired' })
  expect(evaluatePlaybackAccess({ ...input, verification: 'invalid' })).toEqual({ allowed: false, reason: 'invalid' })
  expect(evaluatePlaybackAccess({ ...input, deviceId: 'tv-b' })).toEqual({ allowed: false, reason: 'invalid' })
  expect(evaluatePlaybackAccess({ ...input, entitlement: { ...entitlement, state: 'revoked' } })).toEqual({ allowed: false, reason: 'revoked' })
  expect(entitlement).toEqual({ deviceId: 'tv-a', startsAt: 1000, expiresAt: 5000, state: 'active' })
})
