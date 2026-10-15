import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from '../db'
import {
  invalidateCategoryReadModel,
  invalidateGenerationReadModels,
  invalidateSourceReadModels,
  projectReadItem,
  readProjectionManifest,
} from './readProjection'

let database: CatalogDb
const SOURCE_ID = 'read-projection-tests'

beforeEach(async () => {
  database = new CatalogDb(`test-read-projection-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
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

function manifest(categoryId: number, generation: number) {
  return {
    categoryId,
    sourceId: SOURCE_ID,
    generation,
    kind: 'movie' as const,
    revision: `revision-${generation}`,
    formatVersion: 1,
    count: 1,
    chunkSize: 240,
    chunkCount: 1,
    ready: true,
  }
}

function chunk(categoryId: number, generation: number, revision: string) {
  return {
    id: [categoryId, revision, 0] as [number, string, number],
    categoryId,
    sourceId: SOURCE_ID,
    generation,
    kind: 'movie' as const,
    revision,
    chunk: 0,
    items: [],
  }
}

describe('readProjection', () => {
  it('mantém campos de listagem e remove a URL direta da projeção', () => {
    const record: CatalogRecord = {
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Filme',
      originalName: 'Filme',
      groupOrder: 0,
      providerStreamId: '42',
      directUrl: 'https://segredo.invalid/token',
      playbackHeaders: { userAgent: 'TV' },
    }

    const projected = projectReadItem(record, {
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      categoryId: 7,
      groupOrder: 0,
      categoryPosition: 0,
    })

    expect(projected).toMatchObject({ id: undefined, name: 'Filme', providerStreamId: '42', hasPlayback: true })
    expect(projected).not.toHaveProperty('directUrl')
    expect(projected).not.toHaveProperty('playbackHeaders')
  })

  it('ignora manifesto de geração inativa e remove chunks ao invalidar categoria', async () => {
    await database.catalogReadManifests.put(manifest(7, 1))
    await database.catalogReadChunks.put(chunk(7, 1, 'revision-1'))
    expect(await readProjectionManifest(SOURCE_ID, 7, database)).toMatchObject({ generation: 1 })

    await database.sources.update(SOURCE_ID, { activeGeneration: 2 })
    expect(await readProjectionManifest(SOURCE_ID, 7, database)).toBeUndefined()

    await invalidateCategoryReadModel(7, database)
    expect(await database.catalogReadManifests.get(7)).toBeUndefined()
    expect(await database.catalogReadChunks.count()).toBe(0)
  })

  it('limpa apenas a geração solicitada e depois remove todas as gerações da fonte', async () => {
    await database.catalogReadManifests.bulkPut([manifest(1, 1), manifest(2, 2)])
    await database.catalogReadChunks.bulkPut([chunk(1, 1, 'revision-1'), chunk(2, 2, 'revision-2')])

    await invalidateGenerationReadModels(SOURCE_ID, 1, database)
    expect(await database.catalogReadManifests.get(1)).toBeUndefined()
    expect(await database.catalogReadManifests.get(2)).toBeDefined()
    expect(await database.catalogReadChunks.count()).toBe(1)

    await invalidateSourceReadModels(SOURCE_ID, database)
    expect(await database.catalogReadManifests.count()).toBe(0)
    expect(await database.catalogReadChunks.count()).toBe(0)
  })
})
