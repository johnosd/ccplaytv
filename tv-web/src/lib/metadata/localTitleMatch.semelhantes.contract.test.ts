/**
 * Contrato da feature 035 (cruzamento de títulos do TMDB com o catálogo
 * local) — travado em `sdd/specs/035-semelhantes-elenco-ator/contract-tests.lock`.
 * O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/cruzamento-local.md`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord, type TmdbTitleRef } from '../catalog/db'
import { titleStableId } from './titleMetadataStore'
import { resolveTmdbTitles } from './localTitleMatch'

const SOURCE_ID = 'fonte-painel'
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)

const SOURCE: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-secreta-123',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-035-match-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(SOURCE)
})

afterEach(async () => {
  await database.delete()
})

function movie(fields: Partial<CatalogRecord> & { originalName: string; groupOrder: number }): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: fields.originalName, ...fields }
}

describe('resolveTmdbTitles — contrato da feature 035', () => {
  // US1/AC1+AC2, FR-005/FR-006/FR-007/FR-008, edge cases "cópias", "casamento ambíguo" e "sem ano"; Constitution: "IA e Classificação Nunca Inventam Dados"
  it('encontrados primeiro na ordem do TMDB; cópias da mesma obra abrem a primeira da fonte; anos diferentes e tipo diferente contam como não encontrado; cobertura X de Y', async () => {
    const [openedCategory, , eagerCategory] = (await database.categories.bulkAdd(
      [
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '1', name: 'Ação', order: 0, itemsFetchedAt: NOW },
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '2', name: 'Drama', order: 1 },
        { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'eager', name: 'Legendados', order: 2 },
      ],
      { allKeys: true },
    )) as number[]

    const dunaFirst = (await database.channels.add(
      movie({ originalName: 'Duna (2021) [LEG]', groupOrder: 0, categoryId: openedCategory, providerStreamId: '10' }),
    )) as number
    await database.channels.add(
      movie({ originalName: 'Duna [4K]', groupOrder: 2, categoryId: eagerCategory, providerStreamId: '11', year: 2021 }),
    )
    // Dois "Matrix" de anos vizinhos (emenda R-012, ano exato): só o de 1999 casa com o TMDB de 1999.
    const matrix1999 = (await database.channels.add(
      movie({ originalName: 'Matrix', groupOrder: 0, categoryId: openedCategory, providerStreamId: '20', year: 1999 }),
    )) as number
    await database.channels.add(movie({ originalName: 'Matrix', groupOrder: 2, categoryId: eagerCategory, providerStreamId: '21', year: 2000 }))
    // Sem ano nem "(AAAA)" no nome: só casa pela identidade TMDB já conhecida.
    const joker: CatalogRecord = movie({ originalName: 'Coringa', groupOrder: 0, categoryId: openedCategory, providerStreamId: '30' })
    const jokerId = (await database.channels.add(joker)) as number
    await database.titleMetadata.put({
      stableId: titleStableId(joker) as string,
      sourceId: SOURCE_ID,
      kind: 'movie',
      tmdb: { status: 'matched', tmdbId: 475557, fields: {} },
      tmdbFetchedAt: NOW,
    })
    // Mesmo título e ano, mas é SÉRIE: filme só cruza com filme.
    await database.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'series',
      name: 'Interestelar',
      originalName: 'Interestelar',
      groupOrder: 0,
      seriesId: '900',
      year: 2014,
    })

    const refs: TmdbTitleRef[] = [
      { tmdbId: 603, kind: 'movie', title: 'Matrix', year: 1999 },
      { tmdbId: 157336, kind: 'movie', title: 'Interestelar', originalTitle: 'Interstellar', year: 2014 },
      { tmdbId: 438631, kind: 'movie', title: 'Duna', originalTitle: 'Dune', year: 2021 },
      { tmdbId: 475557, kind: 'movie', title: 'Coringa', originalTitle: 'Joker', year: 2019 },
      { tmdbId: 577922, kind: 'movie', title: 'Tenet', year: 2020 },
    ]

    const result = await resolveTmdbTitles(SOURCE_ID, refs, ['movie'], { database })

    expect(result.titles.map((title) => [title.tmdbId, title.localItemId])).toEqual([
      [603, String(matrix1999)],
      [438631, String(dunaFirst)],
      [475557, String(jokerId)],
      [157336, undefined],
      [577922, undefined],
    ])
    expect(result.titles.map((title) => title.key)).toEqual([
      'tmdb:movie:603',
      'tmdb:movie:438631',
      'tmdb:movie:475557',
      'tmdb:movie:157336',
      'tmdb:movie:577922',
    ])
    // "Drama" nunca foi aberta: fica fora da cobertura (e nada foi baixado para completá-la).
    expect(result.coverage.movie).toEqual({ covered: 2, total: 3 })
  })
})
