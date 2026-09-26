/**
 * Testes de CONTRATO da feature 017 (busca local) — travados em
 * `sdd/specs/017-busca-local-catalogo/contract-tests.lock`. O sdd-execute só
 * pode fazê-los passar, nunca editá-los.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { markCategoryFetched, storeBatch, storeCategories } from './catalogRepository'
import { buildSearchIndex, loadSearchIndex, searchIndex } from './catalogSearch'

const SOURCE_ID = 'fonte-busca'

function record(name: string, overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation: 2,
    kind: 'movie',
    name,
    originalName: name,
    group: 'Ação',
    groupOrder: 0,
    ...overrides,
  }
}

describe('catalogSearch (contrato)', () => {
  let database: CatalogDb

  beforeEach(async () => {
    database = new CatalogDb(`test-busca-${Math.random().toString(36).slice(2)}`)
    await database.open()
  })

  afterEach(async () => {
    await database.delete()
  })

  // FR-005, FR-007, FR-010 (US1/AC3-AC5)
  it('encontra por "contém" sem acento nem caixa, a partir de 3 caracteres, com quem começa pelo termo primeiro', () => {
    const index = buildSearchIndex(
      [
        record('Rio de Janeiro - Cidade'),
        record('Conexão São Paulo'),
        record('SÃO PAULO FC'),
        record('são bento'),
        record('Outro Filme'),
      ],
      { coveredCategories: 1, totalCategories: 1 },
    )

    expect(searchIndex(index, 'sa')).toEqual([])
    expect(searchIndex(index, '  ').length).toBe(0)

    const names = searchIndex(index, 'Sao').map((r) => r.name)
    // "Começa com" primeiro (ordem alfabética entre eles), depois "contém".
    expect(names).toEqual(['são bento', 'SÃO PAULO FC', 'Conexão São Paulo'])
  })

  // FR-002, FR-009, FR-014 + premissa resolvida no plano (stored não aberta = não coberta)
  it('lê só o tipo pedido da geração ativa e conta cobertura apenas das categorias com conteúdo no aparelho', async () => {
    await database.sources.add({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      connectionState: 'synced',
      activeGeneration: 2,
      createdAt: 1,
      updatedAt: 1,
    })
    const [acao] = await storeCategories(
      [
        { sourceId: SOURCE_ID, generation: 2, kind: 'movie', fetchMode: 'on_demand', name: 'Ação', order: 0 },
        { sourceId: SOURCE_ID, generation: 2, kind: 'movie', fetchMode: 'on_demand', name: 'Drama', order: 1 },
        { sourceId: SOURCE_ID, generation: 2, kind: 'movie', fetchMode: 'stored', name: 'Comédia', order: 2 },
        { sourceId: SOURCE_ID, generation: 2, kind: 'channel', fetchMode: 'on_demand', name: 'Canais', order: 0 },
      ],
      database,
    )
    await markCategoryFetched(acao, 1000, 2, database)
    await storeBatch(
      [
        record('Matrix'),
        record('Matrix Reloaded'),
        record('Matrix TV', { kind: 'channel', group: 'Canais' }),
        record('Matrix Antigo', { generation: 1 }),
      ],
      database,
    )

    const index = await loadSearchIndex(SOURCE_ID, 'movie', database)

    expect(index.entries.map((entry) => entry.record.name).sort()).toEqual(['Matrix', 'Matrix Reloaded'])
    expect(index.coveredCategories).toBe(1)
    expect(index.totalCategories).toBe(3)
  })
})
