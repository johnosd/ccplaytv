import { describe, it, expect, beforeEach } from 'vitest'
import { decideOnOpen, isCategoryFresh, STALE_AFTER_MS } from './freshness'
import type { SourceRecord } from './db'
import { CatalogDb } from './db'
import { startImport } from './importPipeline'

describe('freshness / decideOnOpen', () => {
  it('não dispara nada se dentro do prazo', () => {
    const now = 1000000000
    const source: SourceRecord = {
      id: 'src-1',
      type: 'm3u_url',
      displayName: 'Test',
      connectionState: 'synced',
      lastSuccessfulSyncAt: now - (STALE_AFTER_MS - 1000), // less than 24h ago
      createdAt: now - STALE_AFTER_MS,
      updatedAt: now,
    }
    expect(decideOnOpen(source, now)).toBe('none')
  })

  it('dispara update_by_age se fora do prazo', () => {
    const now = 1000000000
    const source: SourceRecord = {
      id: 'src-1',
      type: 'm3u_url',
      displayName: 'Test',
      connectionState: 'synced',
      lastSuccessfulSyncAt: now - (STALE_AFTER_MS + 1000), // more than 24h ago
      createdAt: now - STALE_AFTER_MS * 2,
      updatedAt: now,
    }
    expect(decideOnOpen(source, now)).toBe('update_by_age')
  })

  it('fonte nunca sincronizada é pendente, não "velha"', () => {
    const now = 1000000000
    const source: SourceRecord = {
      id: 'src-1',
      type: 'm3u_url',
      displayName: 'Test',
      connectionState: 'never_synced',
      // mesmo sem lastSuccessfulSyncAt
      createdAt: now - STALE_AFTER_MS * 2, // Criada há mais de 24h
      updatedAt: now,
    }
    expect(decideOnOpen(source, now)).toBe('none')
  })

  it('relógio para trás não gera disparo em laço', () => {
    const now = 1000000000
    const source: SourceRecord = {
      id: 'src-1',
      type: 'm3u_url',
      displayName: 'Test',
      connectionState: 'synced',
      lastSuccessfulSyncAt: now + 10000, // Sincronizou no futuro (relógio estava adiantado)
      createdAt: now - 10000,
      updatedAt: now,
    }
    expect(decideOnOpen(source, now)).toBe('none')
  })

  it('dispara migrate para provedor sem providerMigratedAt', () => {
    const now = 1000000000
    const source: SourceRecord = {
      id: 'src-1',
      type: 'provider_credentials',
      displayName: 'Test',
      connectionState: 'synced', // Pode estar sincronizado via M3U (legacy)
      providerMigratedAt: undefined,
      lastSuccessfulSyncAt: now - 1000, // Fresco!
      createdAt: now - 10000,
      updatedAt: now,
    }
    expect(decideOnOpen(source, now)).toBe('migrate')
  })
})

describe('isCategoryFresh (feature 010)', () => {
  it('nunca obtida nunca é fresca', () => {
    expect(isCategoryFresh(undefined, 1000000000)).toBe(false)
  })

  it('dentro do prazo é fresca', () => {
    const now = 1000000000
    expect(isCategoryFresh(now - (STALE_AFTER_MS - 1), now)).toBe(true)
  })

  it('fora do prazo não é fresca', () => {
    const now = 1000000000
    expect(isCategoryFresh(now - (STALE_AFTER_MS + 1), now)).toBe(false)
  })
})

describe('FR-016: falha de atualização não afeta catálogo atual', () => {
  let db: CatalogDb

  beforeEach(() => {
    db = new CatalogDb('TestDB_freshness')
    return async () => {
      await db.delete()
      db.close()
    }
  })

  it('não transforma uma fonte saudável em fonte com erro se falhar', async () => {
    // Fast fail for fetch
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('Network Error') }
    try {
      const source: SourceRecord = {
        id: 'src-healthy',
        type: 'm3u_url',
        displayName: 'Healthy Source',
        m3uUrl: 'http://invalid-url.local/list.m3u',
        connectionState: 'synced',
        lastSuccessfulSyncAt: 1000,
        activeGeneration: 1,
        createdAt: 1000,
        updatedAt: 1000,
      }
      await db.sources.add(source)

      const handle = await startImport(source.id, { database: db, now: () => 2000 })
      try {
        await handle.completion
      } catch {
        // expected network failure
      }

      const updated = await db.sources.get(source.id)
      // Marca de sincronização não avança
      expect(updated?.lastSuccessfulSyncAt).toBe(1000)
      // Fonte não vira erro (continua synced)
      expect(updated?.connectionState).toBe('synced')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
