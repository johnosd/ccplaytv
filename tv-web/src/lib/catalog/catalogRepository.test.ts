import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord, type UserStateRecord } from './db'
import {
  allocateGeneration,
  countChannels,
  deleteAllForSource,
  discardGeneration,
  getChannel,
  listCategories,
  listChannels,
  listEpisodes,
  markCategoryFetched,
  publishGeneration,
  resolveContinueWatching,
  resolveFavorites,
  storeBatch,
  storeCategories,
  storeCategoryItems,
  storeSeriesEpisodes,
  StorageFullError,
  type NewCategory,
} from './catalogRepository'
import { buildStableId, type StableIdParts } from './userStateRepository'

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

  describe('storedEntries (feature 014 — conteúdo guardado)', () => {
    function stubBlock(generation: number, categoryId: number, chunk = 0) {
      return { sourceId: SOURCE_ID, generation, categoryId, chunk, records: [] }
    }

    it('publicar geração descarta os blocos guardados das anteriores, mantém os da publicada', async () => {
      await seedSource({ activeGeneration: 1 })
      await database.storedEntries.bulkAdd([stubBlock(1, 10), stubBlock(2, 20)])

      await publishGeneration(SOURCE_ID, 2, database)

      const remaining = await database.storedEntries.toArray()
      expect(remaining.map((b) => b.generation)).toEqual([2])
    })

    it('descartar uma geração falha também remove os blocos guardados dela, sem tocar a ativa', async () => {
      await seedSource({ activeGeneration: 1 })
      await database.storedEntries.bulkAdd([stubBlock(1, 10), stubBlock(2, 20)])

      await discardGeneration(SOURCE_ID, 2, database)

      const remaining = await database.storedEntries.toArray()
      expect(remaining.map((b) => b.generation)).toEqual([1])
    })

    it('remover a fonte apaga os blocos guardados de todas as gerações', async () => {
      await seedSource({ activeGeneration: 2 })
      await database.storedEntries.bulkAdd([stubBlock(1, 10), stubBlock(2, 20)])

      await deleteAllForSource(SOURCE_ID, database)

      expect(await database.storedEntries.count()).toBe(0)
    })

    it('não toca os blocos guardados de outra fonte', async () => {
      await seedSource({ activeGeneration: 1 })
      await database.sources.add({
        id: 'fonte-2',
        type: 'provider_credentials',
        displayName: 'Outra',
        connectionState: 'never_synced',
        activeGeneration: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await database.storedEntries.bulkAdd([
        { sourceId: SOURCE_ID, generation: 1, categoryId: 10, chunk: 0, records: [] },
        { sourceId: 'fonte-2', generation: 1, categoryId: 30, chunk: 0, records: [] },
      ])

      await deleteAllForSource(SOURCE_ID, database)

      const remaining = await database.storedEntries.toArray()
      expect(remaining.map((b) => b.sourceId)).toEqual(['fonte-2'])
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

describe('resolveFavorites (feature 013)', () => {
  function idFavorite(kind: StableIdParts['kind'], value: string): StableIdParts {
    return { sourceId: SOURCE_ID, kind, identifier: { type: 'id', value } }
  }
  function nameFavorite(kind: StableIdParts['kind'], value: string): StableIdParts {
    return { sourceId: SOURCE_ID, kind, identifier: { type: 'name', value } }
  }
  function movie(generation: number, name: string, groupOrder: number, providerStreamId?: string): CatalogRecord {
    return {
      sourceId: SOURCE_ID,
      generation,
      kind: 'movie',
      name,
      originalName: name,
      groupOrder,
      providerStreamId,
    }
  }

  it('resolve por providerStreamId, sem confundir tipos com o mesmo id (kind entra na chave)', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch(
      [
        // Mesmo providerStreamId ('7') que o filme abaixo, tipo diferente —
        // só existe pra provar que o índice não confunde os dois.
        { sourceId: SOURCE_ID, generation: 1, kind: 'channel', name: 'Canal 7', originalName: 'Canal 7', groupOrder: 0, providerStreamId: '7' },
        movie(1, 'Filme 7', 0, '7'),
      ],
      database,
    )

    const { records, unresolved } = await resolveFavorites(SOURCE_ID, 'movie', [idFavorite('movie', '7')], database)

    expect(records.map((r) => r.name)).toEqual(['Filme 7'])
    expect(unresolved).toBe(0)
  })

  it('série sem providerStreamId próprio resolve pelo seriesId (mesmo índice da feature 012)', async () => {
    await seedSource({ activeGeneration: 1 })
    await database.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'series',
      name: 'Breaking Bad',
      originalName: 'Breaking Bad',
      groupOrder: 0,
      seriesId: 'srv-200',
    })

    const { records, unresolved } = await resolveFavorites(
      SOURCE_ID,
      'series',
      [idFavorite('series', 'srv-200')],
      database,
    )

    expect(records.map((r) => r.name)).toEqual(['Breaking Bad'])
    expect(unresolved).toBe(0)
  })

  it('fonte M3U resolve por nome, normalizado (caixa e espaços já vieram do buildStableId)', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([movie(1, 'The Matrix', 0)], database)

    const { records, unresolved } = await resolveFavorites(
      SOURCE_ID,
      'movie',
      [nameFavorite('movie', 'the matrix')],
      database,
    )

    expect(records.map((r) => r.name)).toEqual(['The Matrix'])
    expect(unresolved).toBe(0)
  })

  it('favorito cujo item não está carregado é omitido e contado em unresolved, sem inventar cartão', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([movie(1, 'Dune', 0, '1')], database)

    const { records, unresolved } = await resolveFavorites(
      SOURCE_ID,
      'movie',
      [idFavorite('movie', '1'), idFavorite('movie', '999'), nameFavorite('movie', 'inexistente')],
      database,
    )

    expect(records.map((r) => r.name)).toEqual(['Dune'])
    expect(unresolved).toBe(2)
  })

  it('geração antiga (não publicada/ativa) é ignorada — favorito não resolve contra ela', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([movie(1, 'Ativo', 0, '1')], database)
    // Geração 2 em progresso, ainda não publicada — tem o mesmo id, mas não é a ativa.
    await storeBatch([movie(2, 'Em importação', 0, '1')], database)

    const { records } = await resolveFavorites(SOURCE_ID, 'movie', [idFavorite('movie', '1')], database)

    expect(records.map((r) => r.name)).toEqual(['Ativo'])
  })

  it('preserva a ordem dos favoritos pedidos, não a ordem do catálogo', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch(
      [movie(1, 'A', 0, '1'), movie(1, 'B', 1, '2'), movie(1, 'C', 2, '3')],
      database,
    )

    const { records } = await resolveFavorites(
      SOURCE_ID,
      'movie',
      [idFavorite('movie', '3'), idFavorite('movie', '1'), idFavorite('movie', '2')],
      database,
    )

    expect(records.map((r) => r.name)).toEqual(['C', 'A', 'B'])
  })

  it('nome repetido em dois grupos resolve para o registro de menor groupOrder — um só', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch(
      [movie(1, 'Duplicado', 5, undefined), movie(1, 'Duplicado', 1, undefined)],
      database,
    )

    const { records } = await resolveFavorites(
      SOURCE_ID,
      'movie',
      [nameFavorite('movie', 'duplicado')],
      database,
    )

    expect(records).toHaveLength(1)
    expect(records[0].groupOrder).toBe(1)
  })

  it('fonte sem geração ativa (nunca importou) devolve tudo como não resolvido', async () => {
    await seedSource()

    const { records, unresolved } = await resolveFavorites(SOURCE_ID, 'movie', [idFavorite('movie', '1')], database)

    expect(records).toEqual([])
    expect(unresolved).toBe(1)
  })

  it('lista de favoritos vazia devolve vazia, sem tocar o catálogo', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([movie(1, 'Solo', 0, '1')], database)

    expect(await resolveFavorites(SOURCE_ID, 'movie', [], database)).toEqual({ records: [], unresolved: 0 })
  })

  it('favorito sobrevive a uma ressincronização (geração nova, mesmo providerStreamId — SC-003)', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([movie(1, 'Dune', 0, '1')], database)

    // Ressincronização: geração 2 traz o mesmo filme (mesmo id do painel),
    // publicada por cima da 1.
    await storeBatch([movie(2, 'Dune', 0, '1')], database)
    await publishGeneration(SOURCE_ID, 2, database)

    const { records } = await resolveFavorites(SOURCE_ID, 'movie', [idFavorite('movie', '1')], database)
    expect(records.map((r) => r.name)).toEqual(['Dune'])
  })

  it('favorito (userStates) e o catálogo sobrevivem a fechar e reabrir o banco com o mesmo nome (SC-003)', async () => {
    const name = `test-favorites-reopen-${Math.random().toString(36).slice(2)}`
    const first = new CatalogDb(name)
    await first.open()
    await first.sources.add({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      connectionState: 'never_synced',
      activeGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await storeBatch([movie(1, 'Dune', 0, '1')], first)
    const stableId = `${SOURCE_ID}|movie|id:1` // mesmo formato de buildStableId
    await first.userStates.add({
      stableId,
      sourceId: SOURCE_ID,
      isFavorite: true,
      favoritedAt: 100,
      createdAt: 100,
      updatedAt: 100,
    })
    first.close()

    const reopened = new CatalogDb(name)
    await reopened.open()
    try {
      expect((await reopened.userStates.get(stableId))?.isFavorite).toBe(true)
      const { records } = await resolveFavorites(SOURCE_ID, 'movie', [idFavorite('movie', '1')], reopened)
      expect(records.map((r) => r.name)).toEqual(['Dune'])
    } finally {
      await reopened.delete()
    }
  })
})

describe('resolveContinueWatching (feature 019, D-009/R-002/R-004)', () => {
  function userState(stableId: string, progressSeconds: number): UserStateRecord {
    return { stableId, sourceId: SOURCE_ID, isFavorite: false, progressSeconds, createdAt: 0, updatedAt: 0 }
  }

  it('filme com progresso resolve direto para o registro do filme', async () => {
    await seedSource({ activeGeneration: 1 })
    await database.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Dune',
      originalName: 'Dune',
      groupOrder: 0,
      providerStreamId: '1',
    })
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '1' })

    const records = await resolveContinueWatching(SOURCE_ID, [userState(stableId, 300)], database)

    expect(records.map((r) => ({ kind: r.kind, name: r.name }))).toEqual([{ kind: 'movie', name: 'Dune' }])
  })

  it('episódio com progresso resolve para a SÉRIE-pai, nunca para o episódio isolado (R-002/R-004, D-011)', async () => {
    await seedSource({ activeGeneration: 1 })
    await database.channels.bulkAdd([
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'series',
        name: 'Breaking Bad',
        originalName: 'Breaking Bad',
        groupOrder: 0,
        seriesId: 'srv-200',
      },
      {
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'episode',
        name: 'Piloto',
        originalName: 'Piloto',
        groupOrder: 0,
        seriesId: 'srv-200',
        providerStreamId: '55',
        seasonNumber: 1,
        episodeNumber: 1,
      },
    ])
    const stableId = buildStableId({
      sourceId: SOURCE_ID,
      kind: 'episode',
      providerStreamId: '55',
      seasonNumber: 1,
      episodeNumber: 1,
    })

    const records = await resolveContinueWatching(SOURCE_ID, [userState(stableId, 120)], database)

    expect(records.map((r) => ({ kind: r.kind, name: r.name }))).toEqual([{ kind: 'series', name: 'Breaking Bad' }])
  })

  it('item sem correspondência no catálogo atual é omitido, nunca lança (D-016/FR-016)', async () => {
    await seedSource({ activeGeneration: 1 })
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '999' })

    const records = await resolveContinueWatching(SOURCE_ID, [userState(stableId, 300)], database)

    expect(records).toEqual([])
  })
})
