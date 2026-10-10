import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { renewCategoryItems, resolveContinueWatching, storeCategories } from './catalogRepository'
import { relockSession, setCategoryPreference, unlockWithPin } from './categoryAccess'
import { enableParentalControl } from '../parental/pin'
import { loadHistory, loadHistoryPage } from './history'
import { buildStableId, getContinueWatching, updateProgress } from './userStateRepository'
import { mapLiveEntry, mapSeriesEntry, mapVodEntry } from './xtreamConnector'
import './adultFlag'

/**
 * Feature 066 — FR-035 (emenda, D-014): conteúdo adulto nunca aparece no ↺ Histórico nem no Continuar assistindo, por
 * padrão (com ou sem controle parental, mesmo com o PIN digitado). A reprodução continua gravada.
 */

const S = 'fonte-hist-adulto'
let database: CatalogDb

beforeEach(() => {
  database = new CatalogDb(`TestDB_066_hist_${Math.random()}`)
})

afterEach(async () => {
  relockSession()
  await database.delete()
  database.close()
})

const movie = (id: string, groupOrder: number, extra: Partial<CatalogRecord> = {}): CatalogRecord => ({
  sourceId: S, generation: 1, kind: 'movie', name: id, originalName: id, groupOrder, providerStreamId: id, addedAt: 1, ...extra,
})
const stableOf = (id: string) => buildStableId({ sourceId: S, kind: 'movie', providerStreamId: id })

/** Ação (comum, com um filme que o painel marca `is_adult`), XXX Adultos (nome adulto) e Drama (comum). */
async function seed() {
  await database.sources.put({ id: S, type: 'provider_credentials', displayName: S, connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  const ids = await storeCategories(
    [
      { sourceId: S, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Ação', order: 0, providerCategoryId: '1' },
      { sourceId: S, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'XXX Adultos', order: 1, providerCategoryId: '2' },
      { sourceId: S, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Drama', order: 2, providerCategoryId: '3' },
    ],
    database,
  )
  await renewCategoryItems({ sourceId: S, generation: 1, kind: 'movie', categoryId: ids[0], groupOrder: 0 }, [movie('acao', 0), movie('marcado', 0, { adult: true })], 1, database)
  await renewCategoryItems({ sourceId: S, generation: 1, kind: 'movie', categoryId: ids[1], groupOrder: 1 }, [movie('adulto', 1)], 1, database)
  await renewCategoryItems({ sourceId: S, generation: 1, kind: 'movie', categoryId: ids[2], groupOrder: 2 }, [movie('drama', 2)], 1, database)
  for (const id of ['acao', 'marcado', 'adulto', 'drama']) await updateProgress(stableOf(id), S, 120, database)
}

const historyNames = async () => (await loadHistory(S, 'movie', database)).records.map((record) => record.name).sort()
const continueNames = async () =>
  (await resolveContinueWatching(S, await getContinueWatching(S, database), database)).map((record) => record.name).sort()

describe('066 — FR-035: adulto fora do histórico', () => {
  it('controle desligado (padrão): nome adulto e `is_adult` não aparecem; a reprodução continua gravada; não conta como não resolvido', async () => {
    await seed()
    expect(await historyNames()).toEqual(['acao', 'drama'])
    expect(await continueNames()).toEqual(['acao', 'drama'])
    expect((await loadHistory(S, 'movie', database)).unresolved).toBe(0)
    const page = await loadHistoryPage(S, 'movie', 0, 50, database)
    expect(page.records.map((record) => record.name).sort()).toEqual(['acao', 'drama'])
    const stored = (await database.userStates.toArray()).map((state) => state.stableId)
    expect(stored).toContain(stableOf('adulto'))
    expect(stored).toContain(stableOf('marcado'))
  })

  it('com o PIN digitado (sessão desbloqueada) continua fora; categoria comum que a pessoa bloqueou também sai', async () => {
    await seed()
    await enableParentalControl('1234', [{ category: { sourceId: S, kind: 'movie', providerCategoryId: '3', name: 'Drama' }, locked: true }], database)
    expect(await historyNames()).toEqual(['acao'])
    expect(await unlockWithPin(S, '1234', database)).toBe(true)
    expect(await historyNames()).toEqual(['acao'])
    expect(await continueNames()).toEqual(['acao'])
    relockSession()
    expect(await historyNames()).toEqual(['acao'])
  })

  it('liberar uma categoria de nome adulto na gestão não a traz de volta ao histórico (o nome continua adulto)', async () => {
    await seed()
    await enableParentalControl('1234', [], database)
    await setCategoryPreference({ sourceId: S, kind: 'movie', providerCategoryId: '2', name: 'XXX Adultos' }, { locked: false }, database)
    expect(await historyNames()).toEqual(['acao', 'drama'])
  })
})

describe('066 — FR-035: `is_adult` do painel', () => {
  const categories = new Map([['10', { name: 'Filmes', order: 0 }]])
  const buildUrl = () => 'u'

  it('filme, canal e série com `is_adult` 1/"1"/true ganham `adult: true`; 0/ausente não ganham a chave', () => {
    expect(mapVodEntry({ name: 'F', stream_id: 1, category_id: '10', is_adult: '1' }, categories, buildUrl)?.adult).toBe(true)
    expect(mapVodEntry({ name: 'F', stream_id: 2, category_id: '10', is_adult: 1 }, categories, buildUrl)?.adult).toBe(true)
    expect(mapLiveEntry({ name: 'C', stream_id: 3, category_id: '10', is_adult: true }, categories, buildUrl)?.adult).toBe(true)
    expect(mapSeriesEntry({ name: 'S', series_id: 4, category_id: '10', is_adult: '1' }, categories)?.adult).toBe(true)
    const plain = mapVodEntry({ name: 'F', stream_id: 5, category_id: '10', is_adult: '0' }, categories, buildUrl)
    expect(plain && 'adult' in plain).toBe(false)
  })
})
