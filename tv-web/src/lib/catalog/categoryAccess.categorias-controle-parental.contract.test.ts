import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { listAllOfKind, renewCategoryItems, resolveFavorites, storeCategories } from './catalogRepository'
import { iterateKindRecordBatches } from './catalogDerivedRows'
import { buildStableId, parseStableId, type StableIdParts } from './userStateRepository'
import { listVisibleCategories, relockSession, setCategoryPreference, unlockWithPin } from './categoryAccess'
import { enableParentalControl } from '../parental/pin'

/**
 * Feature 066 — contrato da camada de dados: esconder (US1), bloquear com
 * desbloqueio por sessão (US2) e a regra de nome adulto (US3), sempre pela
 * interface pública das leituras que as telas usam.
 */

const SOURCE = 'fonte-066'
const OTHER = 'outra-066'
let database: CatalogDb

const movie = (sourceId: string, id: string, groupOrder: number): CatalogRecord => ({
  sourceId, generation: 1, kind: 'movie', name: `Filme ${id}`, originalName: `Filme ${id}`, groupOrder, providerStreamId: id, addedAt: 1,
})

async function seedSource(sourceId: string, categories: Array<{ name: string; pid: string; items: string[] }>) {
  await database.sources.put({ id: sourceId, type: 'provider_credentials', displayName: sourceId, connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  const ids = await storeCategories(
    categories.map((category, order) => ({ sourceId, generation: 1, kind: 'movie' as const, fetchMode: 'on_demand' as const, name: category.name, order, providerCategoryId: category.pid })),
    database,
  )
  for (const [order, category] of categories.entries()) {
    await renewCategoryItems({ sourceId, generation: 1, kind: 'movie', categoryId: ids[order], groupOrder: order }, category.items.map((id) => movie(sourceId, id, order)), 1, database)
  }
}

const streamIds = (records: CatalogRecord[]): string[] => records.map((record) => record.providerStreamId ?? '').sort()
const favoriteOf = (sourceId: string, id: string) => parseStableId(buildStableId({ sourceId, kind: 'movie', providerStreamId: id })) as StableIdParts

async function batchedIds(sourceId: string): Promise<string[]> {
  const out: CatalogRecord[] = []
  for await (const batch of iterateKindRecordBatches(sourceId, 'movie', { database })) out.push(...batch)
  return streamIds(out)
}

beforeEach(() => {
  database = new CatalogDb(`TestDB_066_access_${Math.random()}`)
})

afterEach(async () => {
  relockSession()
  await database.delete()
  database.close()
})

describe('066 — acesso às categorias (contrato)', () => {
  it('US1/AC2+AC4, FR-007/FR-008: escondida some das trilhas, de "Todos"/busca, das fileiras e dos favoritos; mostrar devolve tudo', async () => {
    await seedSource(SOURCE, [{ name: 'Ação', pid: '1', items: ['a1', 'a2'] }, { name: 'Terror', pid: '2', items: ['t1'] }])

    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '2', name: 'Terror' }, { hidden: true }, database)

    expect((await listVisibleCategories(SOURCE, 'movie', database)).map((category) => category.name)).toEqual(['Ação'])
    expect(streamIds(await listAllOfKind(SOURCE, 'movie', database))).toEqual(['a1', 'a2'])
    expect(await batchedIds(SOURCE)).toEqual(['a1', 'a2'])
    expect((await resolveFavorites(SOURCE, 'movie', [favoriteOf(SOURCE, 't1')], database)).records).toEqual([])

    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '2', name: 'Terror' }, { hidden: false }, database)

    expect((await listVisibleCategories(SOURCE, 'movie', database)).map((category) => category.name)).toEqual(['Ação', 'Terror'])
    expect(streamIds(await listAllOfKind(SOURCE, 'movie', database))).toEqual(['a1', 'a2', 't1'])
    expect(streamIds((await resolveFavorites(SOURCE, 'movie', [favoriteOf(SOURCE, 't1')], database)).records)).toEqual(['t1'])
  })

  it('US2/AC2+AC4, FR-013/FR-014/FR-015: bloqueada fica na trilha com cadeado e sem itens fora dela; PIN certo libera só esta lista até rebloquear', async () => {
    await seedSource(SOURCE, [{ name: 'Ação', pid: '1', items: ['a1'] }, { name: 'Noite', pid: '9', items: ['n1'] }])
    await seedSource(OTHER, [{ name: 'Noite', pid: '9', items: ['o1'] }])
    await enableParentalControl('1357', [
      { category: { sourceId: SOURCE, kind: 'movie', providerCategoryId: '9', name: 'Noite' }, locked: true },
      { category: { sourceId: OTHER, kind: 'movie', providerCategoryId: '9', name: 'Noite' }, locked: true },
    ], database)

    const locked = await listVisibleCategories(SOURCE, 'movie', database)
    expect(locked.map((category) => [category.name, category.locked])).toEqual([['Ação', false], ['Noite', true]])
    expect(streamIds(await listAllOfKind(SOURCE, 'movie', database))).toEqual(['a1'])

    expect(await unlockWithPin(SOURCE, '0000', database)).toBe(false)
    expect(streamIds(await listAllOfKind(SOURCE, 'movie', database))).toEqual(['a1'])

    expect(await unlockWithPin(SOURCE, '1357', database)).toBe(true)
    expect((await listVisibleCategories(SOURCE, 'movie', database)).every((category) => !category.locked)).toBe(true)
    expect(streamIds(await listAllOfKind(SOURCE, 'movie', database))).toEqual(['a1', 'n1'])
    // O desbloqueio é da lista ativa: a outra lista continua bloqueada.
    expect(streamIds(await listAllOfKind(OTHER, 'movie', database))).toEqual([])

    relockSession()
    expect(streamIds(await listAllOfKind(SOURCE, 'movie', database))).toEqual(['a1'])
    expect((await listVisibleCategories(SOURCE, 'movie', database)).find((category) => category.name === 'Noite')?.locked).toBe(true)
  })

  it('US3, FR-022/FR-024/FR-025: com o controle ligado, nome adulto sem decisão chega bloqueado; recusada fica livre; sem PIN nada bloqueia', async () => {
    await seedSource(SOURCE, [
      { name: 'Ação', pid: '1', items: ['a1'] },
      { name: 'XXX Adultos', pid: '2', items: ['x1'] },
      { name: 'Filmes 18+', pid: '3', items: ['d1'] },
    ])
    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', providerCategoryId: '3', name: 'Filmes 18+' }, { declinedSuggestion: true }, database)

    // Sem PIN: o controle está desligado e nada é bloqueado por nome.
    expect((await listVisibleCategories(SOURCE, 'movie', database)).some((category) => category.locked)).toBe(false)

    // Ligado sem decisão para "XXX Adultos" — o caso da categoria nova que chega numa atualização.
    await enableParentalControl('2468', [], database)
    const state = Object.fromEntries((await listVisibleCategories(SOURCE, 'movie', database)).map((category) => [category.name, category.locked]))
    expect(state).toEqual({ 'Ação': false, 'XXX Adultos': true, 'Filmes 18+': false })
    expect(streamIds(await listAllOfKind(SOURCE, 'movie', database))).toEqual(['a1', 'd1'])
  })
})
