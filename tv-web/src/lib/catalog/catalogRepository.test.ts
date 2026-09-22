import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type ChannelRecord, type SourceRecord } from './db'
import {
  allocateGeneration,
  countChannels,
  discardGeneration,
  listCategories,
  listChannels,
  publishGeneration,
  storeBatch,
  StorageFullError,
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

function channel(generation: number, name: string, group: string, groupOrder: number): ChannelRecord {
  return {
    sourceId: SOURCE_ID,
    generation,
    name,
    originalName: name,
    group,
    groupOrder,
    providerStreamId: name,
  }
}

describe('catalogRepository', () => {
  it('grava em lote e devolve a página pedida, não o catálogo', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch(
      Array.from({ length: 50 }, (_, index) => channel(1, `Canal ${index}`, 'Esportes', 0)),
      database,
    )

    const page = await listChannels(SOURCE_ID, 0, 20, 10, database)

    expect(page).toHaveLength(10)
    expect(page[0].name).toBe('Canal 20')
    expect(await countChannels(SOURCE_ID, 0, database)).toBe(50)
  })

  it('lista categorias na ordem declarada pela fonte, não em ordem alfabética', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch(
      [
        channel(1, 'Zulu 1', 'Zulu', 0),
        channel(1, 'Zulu 2', 'Zulu', 0),
        channel(1, 'Alfa 1', 'Alfa', 1),
      ],
      database,
    )

    const categories = await listCategories(SOURCE_ID, database)

    expect(categories.map((category) => category.name)).toEqual(['Zulu', 'Alfa'])
    expect(categories.map((category) => category.count)).toEqual([2, 1])
  })

  it('preserva categoria sem nome como estado legítimo, sem rótulo inventado', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([{ ...channel(1, 'Sem grupo', '', 0), group: undefined }], database)

    const categories = await listCategories(SOURCE_ID, database)

    expect(categories).toHaveLength(1)
    expect(categories[0].name).toBeUndefined()
  })

  it('a geração anterior continua inteiramente legível enquanto a nova é escrita', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Antigo', 'Esportes', 0)], database)

    // Importação nova em andamento, ainda não publicada.
    await storeBatch([channel(2, 'Novo', 'Esportes', 0)], database)

    const visible = await listChannels(SOURCE_ID, 0, 0, 100, database)
    expect(visible.map((item) => item.name)).toEqual(['Antigo'])
    expect(await countChannels(SOURCE_ID, undefined, database)).toBe(1)
  })

  it('publicar troca o ponteiro e só então descarta a geração anterior', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Antigo', 'Esportes', 0)], database)
    await storeBatch([channel(2, 'Novo', 'Esportes', 0)], database)

    await publishGeneration(SOURCE_ID, 2, database)

    const visible = await listChannels(SOURCE_ID, 0, 0, 100, database)
    expect(visible.map((item) => item.name)).toEqual(['Novo'])
    // A anterior saiu do disco — não fica ocupando espaço num aparelho que
    // já é apertado.
    expect(await database.channels.count()).toBe(1)
  })

  it('fonte sem geração publicada não mostra catálogo pela metade', async () => {
    await seedSource()
    await storeBatch([channel(1, 'Em escrita', 'Esportes', 0)], database)

    expect(await listChannels(SOURCE_ID, 0, 0, 100, database)).toEqual([])
    expect(await listCategories(SOURCE_ID, database)).toEqual([])
  })

  it('descartar uma geração falha não toca na ativa', async () => {
    await seedSource({ activeGeneration: 1 })
    await storeBatch([channel(1, 'Bom', 'Esportes', 0)], database)
    await storeBatch([channel(2, 'Incompleto', 'Esportes', 0)], database)

    await discardGeneration(SOURCE_ID, 2, database)

    expect(await countChannels(SOURCE_ID, undefined, database)).toBe(1)
    expect((await listChannels(SOURCE_ID, 0, 0, 10, database))[0].name).toBe('Bom')
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
})
