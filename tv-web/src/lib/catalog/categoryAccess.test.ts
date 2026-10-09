import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb } from './db'
import { storeCategories } from './catalogRepository'
import { listManagedCategories, listVisibleCategories, preferenceKey, setCategoryPreference } from './categoryAccess'
import { categoryPreferences } from './parentalTables'
import { deleteSource } from './sourceRepository'

let database: CatalogDb

beforeEach(() => {
  database = new CatalogDb(`TestDB_066_unit_${Math.random()}`)
})

afterEach(async () => {
  await database.delete()
  database.close()
})

async function seed(sourceId: string, generation: number, categories: Array<{ name: string; pid?: string }>) {
  await database.sources.put({ id: sourceId, type: 'm3u_url', displayName: sourceId, connectionState: 'synced', activeGeneration: generation, createdAt: 0, updatedAt: 0 })
  return storeCategories(
    categories.map((category, order) => ({ sourceId, generation, kind: 'channel' as const, fetchMode: 'eager' as const, name: category.name, order, providerCategoryId: category.pid })),
    database,
  )
}

describe('categoryAccess — identidade e limpeza (feature 066)', () => {
  it('a chave é o id do provedor quando existe e o nome declarado em M3U', () => {
    expect(preferenceKey({ sourceId: 's', kind: 'movie', providerCategoryId: '7', name: 'Ação' })).toEqual(['s', 'movie', 'p:7'])
    expect(preferenceKey({ sourceId: 's', kind: 'channel', name: 'Esportes' })).toEqual(['s', 'channel', 'n:Esportes'])
  })

  it('a preferência sobrevive a uma geração nova com ids locais diferentes', async () => {
    const [oldId] = await seed('s', 1, [{ name: 'Notícias' }, { name: 'Esportes' }])
    await setCategoryPreference({ sourceId: 's', kind: 'channel', name: 'Notícias' }, { hidden: true }, database)

    const newIds = await seed('s', 2, [{ name: 'Esportes' }, { name: 'Notícias' }])
    expect(newIds).not.toContain(oldId)
    expect((await listVisibleCategories('s', 'channel', database)).map((category) => category.name)).toEqual(['Esportes'])
    const managed = await listManagedCategories('s', 'channel', database)
    expect(managed.find((category) => category.name === 'Notícias')?.hidden).toBe(true)
  })

  it('campo ausente no patch fica como estava', async () => {
    await seed('s', 1, [{ name: 'Notícias' }])
    const ref = { sourceId: 's', kind: 'channel' as const, name: 'Notícias' }
    await setCategoryPreference(ref, { hidden: true }, database)
    await setCategoryPreference(ref, { declinedSuggestion: true }, database)
    const saved = await categoryPreferences(database).get(preferenceKey(ref))
    expect(saved).toMatchObject({ hidden: true, declinedSuggestion: true })
  })

  it('a categoria escondida anterior entra em hiddenBefore (número do canal, D-012)', async () => {
    await seed('s', 1, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    await setCategoryPreference({ sourceId: 's', kind: 'channel', name: 'A' }, { hidden: true }, database)
    const visible = await listVisibleCategories('s', 'channel', database)
    expect(visible.map((category) => [category.name, category.hiddenBefore.map((hidden) => hidden.name)])).toEqual([
      ['B', ['A']],
      ['C', ['A']],
    ])
  })

  it('remover a lista apaga só as preferências dela (FR-005)', async () => {
    await seed('s', 1, [{ name: 'Notícias' }])
    await seed('t', 1, [{ name: 'Notícias' }])
    await setCategoryPreference({ sourceId: 's', kind: 'channel', name: 'Notícias' }, { hidden: true }, database)
    await setCategoryPreference({ sourceId: 't', kind: 'channel', name: 'Notícias' }, { hidden: true }, database)

    await deleteSource('s', database)

    expect(await categoryPreferences(database).where('sourceId').equals('s').count()).toBe(0)
    expect(await categoryPreferences(database).where('sourceId').equals('t').count()).toBe(1)
  })
})
