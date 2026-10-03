import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { listChannels, storeCategories, storeCategoryItems, type CatalogCategory } from './catalogRepository'
import { ensureCategory } from './categoryLoader'

// Feature 055 (T008, T009, T022): os campos da listagem chegam ao disco, só quando existem, e uma lista antiga é
// regravada no refresh normal — sem isso a nota nunca apareceria em lista já importada.
let database: CatalogDb
const SOURCE_ID = 'fonte-1'
const HOUR = 60 * 60 * 1000
const NOW = 100 * 24 * HOUR

const PROVIDER_SOURCE: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://exemplo.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

beforeEach(async () => {
  database = new CatalogDb(`test-loader-055-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PROVIDER_SOURCE)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

async function seedCategory(kind: 'movie' | 'series'): Promise<CatalogCategory> {
  const [id] = await storeCategories(
    [{ sourceId: SOURCE_ID, generation: 1, kind, fetchMode: 'on_demand', providerCategoryId: '10', name: 'Cat', order: 0 }],
    database,
  )
  return { id, kind, name: 'Cat', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '10' }
}

const respond = (list: unknown[]) => vi.fn(() => Promise.resolve(new Response(JSON.stringify(list))))

describe('campos da listagem até o disco (feature 055)', () => {
  it('filme grava a nota; gênero e fundo da listagem de filme não são gravados e a chave nem existe sem nota', async () => {
    const category = await seedCategory('movie')
    vi.stubGlobal(
      'fetch',
      respond([
        { stream_id: 1, name: 'Com nota', stream_type: 'movie', rating: '7.4', genre: 'Ação', backdrop_path: ['http://a.test/x.jpg'] },
        { stream_id: 2, name: 'Sem nota', stream_type: 'movie', rating: '0' },
      ]),
    )

    await ensureCategory(SOURCE_ID, category, { database, now: () => NOW })

    const [withRating, without] = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(withRating.providerRating).toBe(7.4)
    expect('providerGenres' in withRating).toBe(false)
    expect('providerBackdropUrl' in withRating).toBe(false)
    expect('providerRating' in without).toBe(false)
  })

  it('série grava nota, gênero e fundo', async () => {
    const category = await seedCategory('series')
    vi.stubGlobal(
      'fetch',
      respond([{ series_id: 5, name: 'Série', rating: '8', genre: 'Drama', backdrop_path: ['http://a.test/b.jpg'] }]),
    )

    await ensureCategory(SOURCE_ID, category, { database, now: () => NOW })

    const [serie] = await listChannels(SOURCE_ID, 0, 0, 10, 'series', database)
    expect(serie.providerRating).toBe(8)
    expect(serie.providerGenres).toBe('Drama')
    expect(serie.providerBackdropUrl).toBe('http://a.test/b.jpg')
  })

  it('lista antiga (bloco gravado sem os campos) é regravada no refresh quando a listagem passa a trazê-los', async () => {
    const category = await seedCategory('movie')
    await storeCategoryItems(
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: category.id, groupOrder: 0 },
      [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'Filme', originalName: 'Filme', groupOrder: 0, providerStreamId: '1' }],
      NOW - 25 * HOUR,
      database,
    )
    const [before] = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect('providerRating' in before).toBe(false)

    // 1) A listagem continua sem nota: nada muda.
    vi.stubGlobal('fetch', respond([{ stream_id: 1, name: 'Filme', stream_type: 'movie' }]))
    await ensureCategory(SOURCE_ID, category, { database, now: () => NOW, renew: true })
    const [same] = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect('providerRating' in same).toBe(false)
    expect(same.id).toBe(before.id)

    // 2) Passado o prazo de 24 h (o refresh normal só renova categoria vencida), a listagem passa a trazer a nota: o
    // bloco é regravado e o id do item continua o mesmo.
    vi.stubGlobal('fetch', respond([{ stream_id: 1, name: 'Filme', stream_type: 'movie', rating: '9.2' }]))
    await ensureCategory(SOURCE_ID, category, { database, now: () => NOW + 26 * HOUR, renew: true })
    const [after] = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
    expect(after.providerRating).toBe(9.2)
    expect(after.id).toBe(before.id)
  })
})
