import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { getChannel, listChannels, renewCategoryItems, storeCategories } from './catalogRepository'
import { BLOCK_ID_SPACE, blockItemId, categoryIdOfBlockItem, identityKey } from './categoryBlocks'

let database: CatalogDb
const SOURCE_ID = 'fonte-1'

beforeEach(async () => {
  database = new CatalogDb(`test-blocos-extra-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'm3u_url',
    displayName: 'Lista',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  await database.delete()
})

function channel(name: string, extra: Partial<CatalogRecord> = {}): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'channel', name, originalName: name, groupOrder: 0, ...extra }
}

async function seedCategory() {
  const [categoryId] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', fetchMode: 'stored', name: 'Esportes', order: 0 }],
    database,
  )
  return { categoryId, target: { sourceId: SOURCE_ID, generation: 1, kind: 'channel' as const, categoryId, groupOrder: 0 } }
}

describe('blockItemId / categoryIdOfBlockItem (feature 039, §3)', () => {
  it('slot ocupado avança para o próximo livre, sempre do mesmo jeito (R-004)', () => {
    const first = blockItemId(7, 'p:1', new Set())
    const collided = blockItemId(7, 'p:1', new Set([first]))
    expect(collided).toBe(first - 1)
    expect(blockItemId(7, 'p:1', new Set([first]))).toBe(collided)
    expect(categoryIdOfBlockItem(first)).toBe(7)
    expect(categoryIdOfBlockItem(collided)).toBe(7)
  })

  it('o id codifica a categoria; id positivo (linha antiga) não é de bloco', () => {
    const id = blockItemId(123456, 'n:Canal', new Set())
    expect(id).toBeLessThan(0)
    expect(Number.isSafeInteger(id)).toBe(true)
    expect(-id).toBeGreaterThanOrEqual(123456 * BLOCK_ID_SPACE)
    expect(categoryIdOfBlockItem(id)).toBe(123456)
    expect(categoryIdOfBlockItem(42)).toBeUndefined()
    expect(categoryIdOfBlockItem(0)).toBeUndefined()
  })

  it('identidade: série pelo seriesId, provedor pelo id, M3U pelo nome original — nunca pela URL', () => {
    expect(identityKey({ kind: 'series', seriesId: 's1', providerStreamId: '9', originalName: 'X' })).toBe('s:s1')
    expect(identityKey({ kind: 'movie', providerStreamId: '9', originalName: 'X' })).toBe('p:9')
    expect(identityKey({ kind: 'channel', originalName: 'X' })).toBe('n:X')
  })
})

describe('escrita do bloco (feature 039, §4)', () => {
  it('M3U com nomes repetidos: cada cópia tem id próprio, e a renovação mantém os dois', async () => {
    const { target } = await seedCategory()
    await renewCategoryItems(target, [channel('Canal HD', { directUrl: 'http://a/1' }), channel('Canal HD', { directUrl: 'http://a/2' })], 1, database)
    const before = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
    expect(new Set(before.map((r) => r.id)).size).toBe(2)

    // Token novo na URL: a assinatura muda, as identidades (nome) não.
    await renewCategoryItems(target, [channel('Canal HD', { directUrl: 'http://b/1' }), channel('Canal HD', { directUrl: 'http://b/2' })], 2, database)
    const after = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id))
    expect(after.map((r) => r.directUrl)).toEqual(['http://b/1', 'http://b/2'])
    expect(after.map((r) => r.categoryPosition)).toEqual([0, 1])
  })

  it('categoria removida enquanto a busca voava: nada é gravado', async () => {
    const { categoryId, target } = await seedCategory()
    await database.categories.delete(categoryId)
    expect(await renewCategoryItems(target, [channel('A')], 1, database)).toEqual({ written: false })
    expect(await database.categoryBlocks.count()).toBe(0)
  })

  it('getChannel não devolve item de bloco de geração que não é a ativa', async () => {
    const { target } = await seedCategory()
    await renewCategoryItems(target, [channel('A')], 1, database)
    const [record] = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
    expect(await getChannel(record.id as number, database)).toMatchObject({ name: 'A', categoryPosition: 0 })

    await database.sources.update(SOURCE_ID, { activeGeneration: 2 })
    expect(await getChannel(record.id as number, database)).toBeUndefined()
  })
})
