import Dexie from 'dexie'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { createSource } from '../catalog/sourceRepository'
import { portalTables, type PendingImportRecord } from './portalTables'
import { clearRemoteImport } from './remoteImportsInFlight'
import { resolveRemoteImportEntry } from './remoteImportEntry'

// Feature 077: entrar numa lista vinda do site enquanto o catálogo ainda carrega mostra o progresso, mesmo depois de a
// página da TV ter sido recarregada (a marca em memória some; o registro durável da importação continua).
const names: string[] = []
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name) })
async function fixture(pending?: Partial<PendingImportRecord>) {
  const db = new CatalogDb('test-077-entry-' + crypto.randomUUID())
  names.push(db.name)
  const sourceId = await createSource({ type: 'm3u_url', displayName: 'Fixture', m3uUrl: 'https://provider.example.test/list' }, db)
  if (pending) await portalTables(db).imports.put({ sourceId, operationId: 'op-a', configRevision: 1, state: 'queued', ...pending } as never)
  return { db, sourceId }
}
const neverCompletes = () => ({ runId: 'run-started-now', completion: new Promise<{ status: string }>(() => {}), cancel: vi.fn() })

it('sem importação do site pendente a lista abre normalmente', async () => {
  const { db, sourceId } = await fixture()
  try { expect(await resolveRemoteImportEntry(db, vi.fn(), sourceId)).toBeUndefined() } finally { db.close() }
})

it('importação já concluída não segura a entrada', async () => {
  const { db, sourceId } = await fixture({ state: 'completed', runId: 'run-done' })
  try { expect(await resolveRemoteImportEntry(db, vi.fn(), sourceId)).toBeUndefined() } finally { db.close() }
})

it('execução registrada e interrompida por recarga da página: acompanha a mesma execução, sem iniciar outra', async () => {
  const { db, sourceId } = await fixture({ state: 'running', runId: 'run-interrupted', owner: 'previous-page', leaseUntil: Date.now() + 60_000 })
  const importer = vi.fn()
  try {
    expect(await resolveRemoteImportEntry(db, importer, sourceId)).toBe('run-interrupted')
    expect(importer).not.toHaveBeenCalled()
  } finally { db.close() }
})

it('importação com erro continua visível na tela de progresso (com Tentar novamente), em vez de uma lista vazia', async () => {
  const { db, sourceId } = await fixture({ state: 'error', runId: 'run-failed' })
  try { expect(await resolveRemoteImportEntry(db, vi.fn(), sourceId)).toBe('run-failed') } finally { db.close() }
})

it('importação aceita mas ainda não iniciada nesta página: inicia agora e acompanha a execução nova', async () => {
  const { db, sourceId } = await fixture({ state: 'queued' })
  const importer = vi.fn(async () => neverCompletes())
  try {
    expect(await resolveRemoteImportEntry(db, importer, sourceId)).toBe('run-started-now')
    expect(importer).toHaveBeenCalledExactlyOnceWith(sourceId)
  } finally { clearRemoteImport(sourceId, 'run-started-now'); db.close() }
})
