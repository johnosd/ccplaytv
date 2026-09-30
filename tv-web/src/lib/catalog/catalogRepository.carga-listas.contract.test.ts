import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { listChannels, renewCategoryItems, storeCategories, storeCategoryItems } from './catalogRepository'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-renew-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

const SOURCE_ID = 'fonte-1'

function series(seriesId: string, name: string): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'series', name, originalName: name, groupOrder: 0, seriesId }
}

describe('Renovação preserva o id local — contrato da feature 038', () => {
  // FR-027 + Constitution: Voltar Restaura Foco e Posição (foco reconciliado por identificador, não por
  // índice) — a renovação em segundo plano não pode trocar o id de quem continua na fonte, nem apagar o que
  // outro carregador gravou nele (`episodesFetchedAt`). D-006: renovação idêntica não regrava nada.
  it('mantém o id de quem continua, remove quem saiu, cria quem entrou e não regrava lista idêntica', async () => {
    await database.sources.add({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Painel',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    const [categoryId] = await storeCategories(
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', providerCategoryId: '7', name: 'Séries', order: 0 }],
      database,
    )
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'series' as const, categoryId, groupOrder: 0 }

    await storeCategoryItems(target, [series('a', 'Alfa'), series('b', 'Beta'), series('c', 'Gama')], 1000, database)
    const before = await listChannels(SOURCE_ID, 0, 0, 100, 'series', database)
    const idOf = (records: CatalogRecord[], seriesId: string) => records.find((r) => r.seriesId === seriesId)?.id
    await database.channels.update(idOf(before, 'a') as number, { episodesFetchedAt: 900 })

    const first = await renewCategoryItems(
      target,
      [series('b', 'Beta (nova capa)'), series('d', 'Delta'), series('a', 'Alfa')],
      2000,
      database,
    )
    expect(first.written).toBe(true)

    const after = await listChannels(SOURCE_ID, 0, 0, 100, 'series', database)
    // A leitura sai na nova ordem da fonte (`categoryPosition`), mesmo com ids preservados fora de ordem.
    expect(after.map((r) => r.seriesId)).toEqual(['b', 'd', 'a'])
    expect(idOf(after, 'a')).toBe(idOf(before, 'a'))
    expect(idOf(after, 'b')).toBe(idOf(before, 'b'))
    expect(after.find((r) => r.seriesId === 'b')?.name).toBe('Beta (nova capa)')
    expect(after.find((r) => r.seriesId === 'a')?.episodesFetchedAt).toBe(900)
    expect(idOf(after, 'c')).toBeUndefined()
    expect(await database.channels.get(idOf(before, 'c') as number)).toBeUndefined()
    const category = await database.categories.get(categoryId)
    expect(category?.itemsCount).toBe(3)
    expect(category?.itemsFetchedAt).toBe(2000)

    const idsBeforeSecond = after.map((r) => r.id)
    const second = await renewCategoryItems(
      target,
      [series('b', 'Beta (nova capa)'), series('d', 'Delta'), series('a', 'Alfa')],
      3000,
      database,
    )
    expect(second.written).toBe(false)
    expect((await listChannels(SOURCE_ID, 0, 0, 100, 'series', database)).map((r) => r.id)).toEqual(idsBeforeSecond)
    expect((await database.categories.get(categoryId))?.itemsFetchedAt).toBe(3000)
  })
})
