import { afterEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from '../catalog/db'
import { categoryPreferences } from '../catalog/parentalTables'
import { resolveSubtitleTarget } from './subtitleTarget'

const opened: CatalogDb[] = []

afterEach(async () => {
  for (const database of opened.splice(0)) await database.delete()
})

async function setup() {
  const database = new CatalogDb('test-090-target-' + crypto.randomUUID())
  opened.push(database)
  await database.sources.put({ id: 'src1', activeGeneration: 1 } as never)
  return database
}

function row(id: number, fields: Partial<CatalogRecord>): CatalogRecord {
  return {
    id,
    sourceId: 'src1',
    generation: 1,
    kind: 'movie',
    name: '',
    originalName: '',
    categoryId: 10,
    ...fields,
  } as CatalogRecord
}

describe('resolveSubtitleTarget (feature 090)', () => {
  it('filme: TMDB casado vence o do painel; sem casamento usa o do painel; sem nenhum, só nome limpo e ano', async () => {
    const database = await setup()
    await database.channels.bulkPut([
      row(1, { kind: 'movie', name: 'Matrix (1999) [4K]', originalName: 'Matrix (1999) [4K]', providerStreamId: '11' }),
      row(2, { kind: 'movie', name: 'Duna', originalName: 'Duna - 2021', providerStreamId: '22' }),
      row(3, { kind: 'movie', name: 'Sem Meta', originalName: 'Sem Meta', providerStreamId: '33', year: 2010 }),
    ])
    await database.titleMetadata.bulkPut([
      { stableId: 'src1|movie|id:11', sourceId: 'src1', kind: 'movie', providerTmdbId: 1, tmdb: { status: 'matched', tmdbId: 603, fields: {} } },
      { stableId: 'src1|movie|id:22', sourceId: 'src1', kind: 'movie', providerTmdbId: 438631, tmdb: { status: 'no_match' } },
    ] as never)

    expect(await resolveSubtitleTarget('1', database)).toEqual({
      stableId: 'src1|movie|id:11', sourceId: 'src1', kind: 'movie', title: 'Matrix', year: 1999, tmdbId: 603,
    })
    expect(await resolveSubtitleTarget('2', database)).toMatchObject({ title: 'Duna', year: 2021, tmdbId: 438631 })
    expect(await resolveSubtitleTarget('3', database)).toMatchObject({ title: 'Sem Meta', year: 2010, tmdbId: undefined })
  })

  it('episódio: TMDB e nome vêm da SÉRIE; sem a série resolvida, o nome do próprio episódio', async () => {
    const database = await setup()
    await database.channels.bulkPut([
      row(10, { kind: 'series', name: 'Breaking Bad', originalName: 'Breaking Bad', seriesId: '77', year: 2008 }),
      row(11, { kind: 'episode', name: 'Pilot', originalName: 'Pilot', providerStreamId: '501', seriesId: '77', seasonNumber: 1, episodeNumber: 1 }),
      row(12, { kind: 'episode', name: 'Órfão S01E02', originalName: 'Órfão S01E02', providerStreamId: '502', seriesId: '99', seasonNumber: 1, episodeNumber: 2 }),
    ])
    await database.titleMetadata.put(
      { stableId: 'src1|series|id:77', sourceId: 'src1', kind: 'series', tmdb: { status: 'matched', tmdbId: 1396, fields: {} } } as never,
    )

    expect(await resolveSubtitleTarget('11', database)).toEqual({
      stableId: 'src1|episode|id:501|s1|e1', sourceId: 'src1', kind: 'episode', title: 'Breaking Bad', year: 2008,
      parentTmdbId: 1396, season: 1, episode: 1, seriesId: '77',
    })
    expect(await resolveSubtitleTarget('12', database)).toMatchObject({ title: 'Órfão S01E02', parentTmdbId: undefined, season: 1, episode: 2 })
  })

  it('canal, item inexistente e categoria escondida não têm alvo (a opção não aparece)', async () => {
    const database = await setup()
    await database.channels.bulkPut([
      row(20, { kind: 'channel', name: 'Canal', originalName: 'Canal', providerStreamId: '7' }),
      row(21, { kind: 'movie', name: 'Escondido', originalName: 'Escondido', providerStreamId: '8', categoryId: 99 }),
    ])
    await database.categories.put({ id: 99, sourceId: 'src1', generation: 1, kind: 'movie', name: 'Cat', providerCategoryId: '99' } as never)
    await categoryPreferences(database).put({ sourceId: 'src1', kind: 'movie', matchKey: 'p:99', hidden: true, updatedAt: 1 })

    expect(await resolveSubtitleTarget('20', database)).toBeNull()
    expect(await resolveSubtitleTarget('404', database)).toBeNull()
    expect(await resolveSubtitleTarget('abc', database)).toBeNull()
    expect(await resolveSubtitleTarget('21', database)).toBeNull()
  })
})
