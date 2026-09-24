import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord } from './db'
import {
  allocateGeneration,
  countChannels,
  discardGeneration,
  getChannel,
  listCategories,
  listChannels,
  listEpisodes,
  markCategoryFetched,
  publishGeneration,
  storeBatch,
  storeCategories,
  storeCategoryItems,
  storeSeriesEpisodes,
  StorageFullError,
  type NewCategory,
} from './catalogRepository'

let database: CatalogDb

/** Banco novo por teste: estado vazado entre casos esconderia exatamente os bugs de geração. */
beforeEach(async () => {
  database = new CatalogDb(`test-catalog-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

const SOURCE_ID = 'fonte-1'

async function seedSource(overrides: Partial<SourceRecord> = {}): Promise<void> {
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'never_synced',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  })
}

function channel(generation: number, name: string, group: string, groupOrder: number): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation,
    name,
    originalName: name,
    group,
    groupOrder,
    providerStreamId: name,
    kind: 'channel',
  }
}

function newCategory(overrides: Partial<NewCategory> = {}): NewCategory {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'channel',
    fetchMode: 'on_demand',
    order: 0,
    ...overrides,
  }
}

describe('catalogRepository', () => {
  it('grava em lote e devolve a página pedida, não o catálogo', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch(
      Array.from({ length: 50 }, (_, index) => channel(1, `Canal ${index}`, 'Esportes', 0)),
      database,
    )

    const page = await listChannels(SOURCE_ID, 0, 20, 10, undefined, database)

    expect(page).toHaveLength(10)
    expect(page[0].name).toBe('Canal 20')
    expect(await countChannels(SOURCE_ID, 0, undefined, database)).toBe(50)
  })

  it('lista categorias na ordem declarada pela fonte, não em ordem alfabética', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeCategories(
      [newCategory({ name: 'Zulu', order: 0 }), newCategory({ name: 'Alfa', order: 1 })],
      database,
    )
    await storeBatch(
      [
        channel(1, 'Zulu 1', 'Zulu', 0),
        channel(1, 'Zulu 2', 'Zulu', 0),
        channel(1, 'Alfa 1', 'Alfa', 1),
      ],
      database,
    )

    const categories = await listCategories(SOURCE_ID, undefined, database)

    // A ordem vem de `categories.order` — quem declarou "Zulu" antes de
    // "Alfa" foi a fonte, e listCategories não reordena por texto.
    expect(categories.map((category) => category.name)).toEqual(['Zulu', 'Alfa'])
  })

  it('preserva categoria sem nome como estado legítimo, sem rótulo inventado', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeCategories([newCategory({ name: undefined, order: 0 })], database)

    const categories = await listCategories(SOURCE_ID, undefined, database)

    expect(categories).toHaveLength(1)
    expect(categories[0].name).toBeUndefined()
  })

  describe('categories (feature 010 — estrutura e carga sob demanda)', () => {
    it('storeCategories grava e devolve os ids locais na mesma ordem', async () => {
      await seedSource({ activeGeneration: 1 })

      const ids = await storeCategories(
        [
          newCategory({ kind: 'movie', order: 0, name: 'Ação', declaredCount: 42 }),
          newCategory({ kind: 'movie', order: 1, name: 'Comédia', declaredCount: 7 }),
        ],
        database,
      )

      expect(ids).toHaveLength(2)
      const categories = await listCategories(SOURCE_ID, 'movie', database)
      expect(categories.map((c) => c.id)).toEqual(ids)
      expect(categories.map((c) => c.declaredCount)).toEqual([42, 7])
      // Categoria recém-criada, sem itens: contagem real é zero, nunca
      // fundida com a declarada (D-005).
      expect(categories.map((c) => c.count)).toEqual([0, 0])
    })

    it('storeCategoryItems substitui integralmente os itens de uma categoria e carimba a obtenção', async () => {
      await seedSource({ activeGeneration: 1 })
      const [categoryId] = await storeCategories(
        [newCategory({ kind: 'movie', order: 0, name: 'Ação', declaredCount: 2 })],
        database,
      )

      await storeCategoryItems(
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 },
        [
          { ...channel(1, 'Filme Antigo', 'Ação', 0), kind: 'movie' },
        ],
        1000,
        database,
      )
      // Segunda obtenção com um item diferente — a primeira não pode sobrar
      // órfã (D-006).
      await storeCategoryItems(
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 },
        [
          { ...channel(1, 'Filme Novo 1', 'Ação', 0), kind: 'movie' },
          { ...channel(1, 'Filme Novo 2', 'Ação', 0), kind: 'movie' },
        ],
        2000,
        database,
      )

      const items = await listChannels(SOURCE_ID, 0, 0, 10, 'movie', database)
      expect(items.map((i) => i.name).sort()).toEqual(['Filme Novo 1', 'Filme Novo 2'])
      expect(items.every((i) => i.categoryId === categoryId)).toBe(true)

      const [category] = await listCategories(SOURCE_ID, 'movie', database)
      expect(category.count).toBe(2)
      expect(category.itemsFetchedAt).toBe(2000)
      // Declarada (2) e real (2) batem aqui, mas são campos distintos —
      // ver o teste de divergência abaixo.
      expect(category.declaredCount).toBe(2)
    })

    it('a contagem real e a declarada são campos distintos, mesmo quando divergem', async () => {
      await seedSource({ activeGeneration: 1 })
      const [categoryId] = await storeCategories(
        [newCategory({ kind: 'movie', order: 0, name: 'Ação', declaredCount: 100 })],
        database,
      )

      await storeCategoryItems(
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 },
        [{ ...channel(1, 'Único Filme', 'Ação', 0), kind: 'movie' }],
        1000,
        database,
      )

      const [category] = await listCategories(SOURCE_ID, 'movie', database)
      // O provedor declarou 100; só 1 veio. FR-015 exige que a interface
      // consiga ver os dois números, não um substituindo o outro.
      expect(category.declaredCount).toBe(100)
      expect(category.count).toBe(1)
    })

    it('markCategoryFetched carimba instante e contagem sem tocar nos itens já gravados', async () => {
      await seedSource({ activeGeneration: 1 })
      const [categoryId] = await storeCategories(
        [newCategory({ kind: 'channel', fetchMode: 'eager', order: 0, name: 'Esportes' })],
        database,
      )
      await storeBatch(
        [{ ...channel(1, 'Canal 1', 'Esportes', 0), categoryId }],
        database,
      )

      await markCategoryFetched(categoryId, 5000, 1, database)

      const [category] = await listCategories(SOURCE_ID, 'channel', database)
      expect(category.itemsFetchedAt).toBe(5000)
      expect(category.count).toBe(1)
      // O item que já estava lá continua exatamente onde estava.
      const items = await listChannels(SOURCE_ID, 0, 0, 10, 'channel', database)
      expect(items.map((i) => i.name)).toEqual(['Canal 1'])
    })

    it('publicar geração também descarta as categorias da anterior, sem tocar userStates', async () => {
      await seedSource({ activeGeneration: 1 })
      await database.userStates.add({
        stableId: 'src-1|movie|id:1',
        sourceId: SOURCE_ID,
        isFavorite: true,
        favoritedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await storeCategories([newCategory({ generation: 1, order: 0, name: 'Antiga' })], database)
      await storeCategories([newCategory({ generation: 2, order: 0, name: 'Nova' })], database)

      await publishGeneration(SOURCE_ID, 2, database)

      const categories = await listCategories(SOURCE_ID, 'channel', database)
      expect(categories.map((c) => c.name)).toEqual(['Nova'])
      expect(await database.categories.count()).toBe(1)
      // D-002: a troca de geração nunca toca o estado do usuário.
      expect(await database.userStates.get('src-1|movie|id:1')).toMatchObject({ isFavorite: true })
    })

    it('descartar uma geração falha também remove as categorias dela', async () => {
      await seedSource({ activeGeneration: 1 })
      await storeCategories([newCategory({ generation: 1, order: 0, name: 'Ativa' })], database)
      await storeCategories([newCategory({ generation: 2, order: 0, name: 'Incompleta' })], database)

      await discardGeneration(SOURCE_ID, 2, database)

      const categories = await listCategories(SOURCE_ID, 'channel', database)
      expect(categories.map((c) => c.name)).toEqual(['Ativa'])
    })
  })

  it('a geração anterior continua inteiramente legível enquanto a nova é escrita', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Antigo', 'Esportes', 0)], database)

    // Importação nova em andamento, ainda não publicada.
    await storeBatch([channel(2, 'Novo', 'Esportes', 0)], database)

    const visible = await listChannels(SOURCE_ID, 0, 0, 100, undefined, database)
    expect(visible.map((item) => item.name)).toEqual(['Antigo'])
    expect(await countChannels(SOURCE_ID, undefined, undefined, database)).toBe(1)
  })

  it('publicar troca o ponteiro e só então descarta a geração anterior', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Antigo', 'Esportes', 0)], database)
    await storeBatch([channel(2, 'Novo', 'Esportes', 0)], database)

    await publishGeneration(SOURCE_ID, 2, database)

    const visible = await listChannels(SOURCE_ID, 0, 0, 100, undefined, database)
    expect(visible.map((item) => item.name)).toEqual(['Novo'])
    // A anterior saiu do disco — não fica ocupando espaço num aparelho que
    // já é apertado.
    expect(await database.channels.count()).toBe(1)
  })

  it('fonte sem geração publicada não mostra catálogo pela metade', async () => {
    await seedSource()
    await storeBatch([channel(1, 'Em escrita', 'Esportes', 0)], database)

    expect(await listChannels(SOURCE_ID, 0, 0, 100, undefined, database)).toEqual([])
    expect(await listCategories(SOURCE_ID, undefined, database)).toEqual([])
  })

  it('descartar uma geração falha não toca na ativa', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Bom', 'Esportes', 0)], database)
    await storeBatch([channel(2, 'Incompleto', 'Esportes', 0)], database)

    await discardGeneration(SOURCE_ID, 2, database)

    expect(await countChannels(SOURCE_ID, undefined, undefined, database)).toBe(1)
    expect((await listChannels(SOURCE_ID, 0, 0, 10, undefined, database))[0].name).toBe('Bom')
  })

  it('recusa descartar a geração que está no ar', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Bom', 'Esportes', 0)], database)

    await expect(discardGeneration(SOURCE_ID, 1, database)).rejects.toThrow()
  })

  it('falta de espaço é sinalizada ao chamador, não engolida (FR-018)', async () => {
    await seedSource()
    const quota = new Error('quota')
    quota.name = 'QuotaExceededError'
    vi.spyOn(database.channels, 'bulkAdd').mockRejectedValue(quota)

    await expect(storeBatch([channel(1, 'Canal', 'Esportes', 0)], database)).rejects.toBeInstanceOf(
      StorageFullError,
    )
  })

  it('reconhece a falta de espaço mesmo embrulhada pela camada de banco', async () => {
    await seedSource()
    const inner = new Error('quota')
    inner.name = 'QuotaExceededError'
    const wrapped = Object.assign(new Error('falha ao gravar'), { name: 'BulkError', inner })
    vi.spyOn(database.channels, 'bulkAdd').mockRejectedValue(wrapped)

    await expect(storeBatch([channel(1, 'Canal', 'Esportes', 0)], database)).rejects.toBeInstanceOf(
      StorageFullError,
    )
  })

  it('erro de gravação que não é falta de espaço sobe como ele mesmo', async () => {
    await seedSource()
    vi.spyOn(database.channels, 'bulkAdd').mockRejectedValue(new Error('outra coisa'))

    await expect(storeBatch([channel(1, 'Canal', 'Esportes', 0)], database)).rejects.toThrow(
      'outra coisa',
    )
  })

  it('nova geração não reaproveita número deixado por importação que falhou', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Ativo', 'Esportes', 0)], database)
    // Sobra de uma importação interrompida, com número acima do ativo.
    await storeBatch([channel(5, 'Lixo', 'Esportes', 0)], database)

    expect(await allocateGeneration(SOURCE_ID, database)).toBe(6)
  })

  describe('episódios de série (feature 012)', () => {
    function episode(seriesId: string, name: string, season: number, ep: number): CatalogRecord {
      return {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'episode',
        name,
        originalName: name,
        groupOrder: Number.MAX_SAFE_INTEGER,
        seriesId,
        seasonNumber: season,
        episodeNumber: ep,
        providerStreamId: name,
      }
    }

    async function seedSeries(seriesId: string): Promise<number> {
      const [id] = await database.channels.bulkAdd(
        [
          {
            sourceId: SOURCE_ID,
            generation: 1,
            kind: 'series',
            name: 'Breaking Bad',
            originalName: 'Breaking Bad',
            groupOrder: 0,
            seriesId,
          },
        ],
        { allKeys: true },
      )
      return id as number
    }

    it('storeSeriesEpisodes substitui integralmente os episódios e carimba a série, sem apagar o registro da série', async () => {
      await seedSource({ activeGeneration: 1 })
      const seriesRecordId = await seedSeries('srv-200')

      await storeSeriesEpisodes(
        { sourceId: SOURCE_ID, generation: 1, seriesId: 'srv-200', seriesRecordId },
        [episode('srv-200', 'Pilot', 1, 1)],
        1000,
        database,
      )
      // Segunda obtenção com episódios diferentes — a primeira não pode
      // sobrar órfã, mesmo padrão de storeCategoryItems.
      await storeSeriesEpisodes(
        { sourceId: SOURCE_ID, generation: 1, seriesId: 'srv-200', seriesRecordId },
        [episode('srv-200', 'Cat in the Bag', 1, 2), episode('srv-200', "...and the Bag's in the River", 1, 3)],
        2000,
        database,
      )

      const episodes = await listEpisodes(SOURCE_ID, 'srv-200', database)
      expect(episodes.map((e) => e.name).sort()).toEqual(["...and the Bag's in the River", 'Cat in the Bag'])
      expect(episodes.every((e) => e.seriesId === 'srv-200')).toBe(true)

      // O registro da série em si sobreviveu às duas substituições.
      const series = await getChannel(seriesRecordId, database)
      expect(series?.kind).toBe('series')
      expect(series?.name).toBe('Breaking Bad')
      expect(series?.episodesFetchedAt).toBe(2000)
    })

    it('listEpisodes só devolve kind:episode, nunca o registro da própria série', async () => {
      await seedSource({ activeGeneration: 1 })
      const seriesRecordId = await seedSeries('srv-200')
      await storeSeriesEpisodes(
        { sourceId: SOURCE_ID, generation: 1, seriesId: 'srv-200', seriesRecordId },
        [episode('srv-200', 'Pilot', 1, 1)],
        1000,
        database,
      )

      const episodes = await listEpisodes(SOURCE_ID, 'srv-200', database)
      expect(episodes.every((e) => e.kind === 'episode')).toBe(true)
    })

    it('listEpisodes só lê a geração ativa', async () => {
      await seedSource() // sem activeGeneration — nada publicado ainda
      const seriesRecordId = await seedSeries('srv-200')
      await storeSeriesEpisodes(
        { sourceId: SOURCE_ID, generation: 1, seriesId: 'srv-200', seriesRecordId },
        [episode('srv-200', 'Pilot', 1, 1)],
        1000,
        database,
      )

      expect(await listEpisodes(SOURCE_ID, 'srv-200', database)).toEqual([])
    })

    it('falta de espaço ao gravar episódios é sinalizada, não engolida', async () => {
      await seedSource({ activeGeneration: 1 })
      const seriesRecordId = await seedSeries('srv-200')
      const quota = new Error('quota')
      quota.name = 'QuotaExceededError'
      vi.spyOn(database.channels, 'bulkAdd').mockRejectedValue(quota)

      await expect(
        storeSeriesEpisodes(
          { sourceId: SOURCE_ID, generation: 1, seriesId: 'srv-200', seriesRecordId },
          [episode('srv-200', 'Pilot', 1, 1)],
          1000,
          database,
        ),
      ).rejects.toBeInstanceOf(StorageFullError)
    })
  })
})
