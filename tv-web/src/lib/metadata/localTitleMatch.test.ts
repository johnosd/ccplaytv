import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord } from '../catalog/db'
import { resolveTmdbTitles } from './localTitleMatch'

const SOURCE_ID = 'fonte'
const SOURCE: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'u',
  providerPassword: 'p',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-035-localmatch-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(SOURCE)
})

afterEach(async () => {
  await database.delete()
})

function record(fields: Partial<CatalogRecord> & { originalName: string; kind: CatalogRecord['kind'] }): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, name: fields.originalName, groupOrder: 0, ...fields }
}

describe('resolveTmdbTitles — casos além do contrato (feature 035)', () => {
  it('série cruza com série; ref repetida entra uma vez', async () => {
    const id = (await database.channels.add(record({ kind: 'series', originalName: 'Dark', year: 2017, seriesId: '9' }))) as number
    const ref = { tmdbId: 70523, kind: 'series' as const, title: 'Dark', year: 2017 }

    const result = await resolveTmdbTitles(SOURCE_ID, [ref, ref], ['series'], { database })

    expect(result.titles).toHaveLength(1)
    expect(result.titles[0].localItemId).toBe(String(id))
    expect(result.titles[0].key).toBe('tmdb:series:70523')
  })

  it('fonte sem geração ativa: tudo não encontrado e cobertura 0 de 0', async () => {
    await database.sources.update(SOURCE_ID, { activeGeneration: undefined })
    const result = await resolveTmdbTitles(SOURCE_ID, [{ tmdbId: 1, kind: 'movie', title: 'X', year: 2000 }], ['movie'], { database })
    expect(result.titles[0].localItemId).toBeUndefined()
    expect(result.coverage.movie).toEqual({ covered: 0, total: 0 })
  })

  it('registro sem ano (nem no nome) nunca casa só por título', async () => {
    await database.channels.add(record({ kind: 'movie', originalName: 'Coringa' }))
    const result = await resolveTmdbTitles(SOURCE_ID, [{ tmdbId: 5, kind: 'movie', title: 'Coringa', year: 2019 }], ['movie'], {
      database,
    })
    expect(result.titles[0].localItemId).toBeUndefined()
  })

  it('conteúdo guardado de categoria nunca aberta (storedEntries) não é catálogo: nada é lido nem casado', async () => {
    await database.categories.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      fetchMode: 'stored',
      name: 'Guardada',
      order: 0,
    })
    const result = await resolveTmdbTitles(SOURCE_ID, [{ tmdbId: 7, kind: 'movie', title: 'Duna', year: 2021 }], ['movie'], { database })
    expect(result.titles[0].localItemId).toBeUndefined()
    expect(result.coverage.movie).toEqual({ covered: 0, total: 1 })
  })

  it('cobertura é informada para o tipo pedido mesmo sem nenhuma ref', async () => {
    const result = await resolveTmdbTitles(SOURCE_ID, [], ['movie', 'series'], { database })
    expect(result.titles).toEqual([])
    expect(result.coverage).toEqual({ movie: { covered: 0, total: 0 }, series: { covered: 0, total: 0 } })
  })

  it('ano exato: homônimos de anos vizinhos não casam (emenda R-012), o de mesmo ano casa', async () => {
    const same = (await database.channels.add(record({ kind: 'movie', originalName: 'A Cura', year: 2018 }))) as number
    await database.channels.add(record({ kind: 'movie', originalName: 'A Casa Sombria', year: 2020 }))
    const refs = [
      { tmdbId: 1, kind: 'movie' as const, title: 'A Cura', year: 2017 },
      { tmdbId: 2, kind: 'movie' as const, title: 'A Casa Sombria', year: 2021 },
      { tmdbId: 3, kind: 'movie' as const, title: 'A Cura', year: 2018 },
    ]
    const result = await resolveTmdbTitles(SOURCE_ID, refs, ['movie'], { database })
    expect(result.titles.map((title) => [title.tmdbId, title.localItemId])).toEqual([
      [3, String(same)],
      [1, undefined],
      [2, undefined],
    ])
  })
})