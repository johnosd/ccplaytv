import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type TitleMetadataRecord } from './db'
import { getChannel, resolveFavorites, storeCategories } from './catalogRepository'
import { convertLegacyCategories } from './categoryBlocks'
import { loadHistory } from './history'
import { buildStableId, parseStableId, type StableIdParts } from './userStateRepository'
import { resolveTmdbTitles } from '../metadata/localTitleMatch'

/**
 * Feature 039, T020 (US3): ★ Favoritos, ↺ Histórico e Semelhantes mostram os
 * MESMOS itens antes e depois da conversão do formato antigo (linhas) para
 * blocos. Estado do usuário e metadados são por `stableId`, nunca pelo id
 * local — que muda na conversão (R-003).
 */

let database: CatalogDb
const SOURCE_ID = 'fonte-conversao'

beforeEach(async () => {
  database = new CatalogDb(`test-conversao-leitores-${Math.random().toString(36).slice(2)}`)
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

function row(kind: CatalogRecord['kind'], name: string, groupOrder: number, extra: Partial<CatalogRecord>): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind, name, originalName: name, groupOrder, ...extra }
}

/** O formato de antes da 039: uma linha por item em `channels`. */
async function seedLegacyCatalog() {
  const [movies, series] = await storeCategories(
    [
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', name: 'Filmes', order: 1 },
      { sourceId: SOURCE_ID, generation: 1, kind: 'series', fetchMode: 'on_demand', name: 'Séries', order: 2 },
    ],
    database,
  )
  // Categorias já obtidas (entram na cobertura de Semelhantes).
  await database.categories.bulkUpdate([
    { key: movies, changes: { itemsFetchedAt: 10 } },
    { key: series, changes: { itemsFetchedAt: 10 } },
  ])
  await database.channels.bulkAdd([
    row('movie', 'Matrix', 1, { providerStreamId: 'm1', year: 1999, categoryId: movies, categoryPosition: 0 }),
    row('movie', 'Duna', 1, { providerStreamId: 'm2', year: 2021, categoryId: movies, categoryPosition: 1 }),
    row('movie', 'Blade Runner', 1, { providerStreamId: 'm3', year: 1982, categoryId: movies, categoryPosition: 2 }),
    row('series', 'Dark', 2, { seriesId: 's1', categoryId: series, categoryPosition: 0 }),
    row('series', 'Lost', 2, { seriesId: 's2', categoryId: series, categoryPosition: 1 }),
    row('episode', 'Dark S01E01', 2, { seriesId: 's1', providerStreamId: 'e1', seasonNumber: 1, episodeNumber: 1 }),
    row('episode', 'Lost S01E01', 2, { seriesId: 's2', providerStreamId: 'e2', seasonNumber: 1, episodeNumber: 1 }),
  ])
}

async function seedUserStateAndMetadata() {
  const id = (kind: 'movie' | 'series' | 'episode', extra: Record<string, unknown>) =>
    buildStableId({ sourceId: SOURCE_ID, kind, ...extra })
  await database.userStates.bulkPut([
    { stableId: id('movie', { providerStreamId: 'm2' }), sourceId: SOURCE_ID, isFavorite: true, favoritedAt: 3, createdAt: 1, updatedAt: 3 },
    { stableId: id('series', { seriesId: 's2' }), sourceId: SOURCE_ID, isFavorite: true, favoritedAt: 2, createdAt: 1, updatedAt: 2 },
    { stableId: id('movie', { providerStreamId: 'm3' }), sourceId: SOURCE_ID, isFavorite: false, progressSeconds: 60, lastWatched: 5, createdAt: 1, updatedAt: 5 },
    { stableId: id('movie', { providerStreamId: 'm1' }), sourceId: SOURCE_ID, isFavorite: false, progressSeconds: 90, lastWatched: 4, createdAt: 1, updatedAt: 4 },
    {
      stableId: id('episode', { providerStreamId: 'e1', seriesId: 's1', seasonNumber: 1, episodeNumber: 1 }),
      sourceId: SOURCE_ID,
      isFavorite: false,
      progressSeconds: 30,
      lastWatched: 6,
      createdAt: 1,
      updatedAt: 6,
    },
  ])
  // "Matrix" já casado no TMDB (identidade); "Duna" só por título + ano.
  const matrix: TitleMetadataRecord = {
    stableId: id('movie', { providerStreamId: 'm1' }),
    sourceId: SOURCE_ID,
    kind: 'movie',
    tmdb: { status: 'matched', tmdbId: 603 } as TitleMetadataRecord['tmdb'],
  }
  await database.titleMetadata.put(matrix)
}

/** O que as três telas mostram, por nome — nunca pelo id local, que a conversão troca. */
async function whatScreensShow() {
  const favoriteParts = (await database.userStates.toArray())
    .filter((state) => state.isFavorite)
    .sort((a, b) => (b.favoritedAt ?? 0) - (a.favoritedAt ?? 0))
    .map((state) => parseStableId(state.stableId) as StableIdParts)
  const favoriteMovies = await resolveFavorites(SOURCE_ID, 'movie', favoriteParts.filter((p) => p.kind === 'movie'), database)
  const favoriteSeries = await resolveFavorites(SOURCE_ID, 'series', favoriteParts.filter((p) => p.kind === 'series'), database)
  const movieHistory = await loadHistory(SOURCE_ID, 'movie', database)
  const seriesHistory = await loadHistory(SOURCE_ID, 'series', database)
  const similar = await resolveTmdbTitles(
    SOURCE_ID,
    [
      { tmdbId: 603, kind: 'movie', title: 'The Matrix' },
      { tmdbId: 438631, kind: 'movie', title: 'Duna', year: 2021 },
      { tmdbId: 999, kind: 'movie', title: 'Não Está Na Lista', year: 2000 },
    ],
    ['movie'],
    { database },
  )
  const similarShown = await Promise.all(
    similar.titles.map(async (title) => ({
      tmdbId: title.tmdbId,
      local: title.localItemId ? ((await getChannel(Number(title.localItemId), database))?.name ?? 'ID QUEBRADO') : null,
    })),
  )
  return {
    favorites: [...favoriteMovies.records, ...favoriteSeries.records].map((record) => record.name),
    favoritesUnresolved: favoriteMovies.unresolved + favoriteSeries.unresolved,
    movieHistory: movieHistory.records.map((record) => record.name),
    seriesHistory: seriesHistory.records.map((record) => record.name),
    historyUnresolved: movieHistory.unresolved + seriesHistory.unresolved,
    similar: similarShown,
    similarCoverage: similar.coverage,
  }
}

describe('conversão para blocos × ★ Favoritos, ↺ Histórico e Semelhantes (feature 039, T020)', () => {
  it('mostram os mesmos itens antes e depois da conversão, e os ids novos resolvem', async () => {
    await seedLegacyCatalog()
    await seedUserStateAndMetadata()

    const before = await whatScreensShow()
    // Sanidade: o cenário não é trivial.
    expect(before.favorites).toEqual(['Duna', 'Lost'])
    expect(before.movieHistory).toEqual(['Blade Runner', 'Matrix'])
    expect(before.seriesHistory).toEqual(['Dark'])
    expect(before.similar).toEqual([
      { tmdbId: 603, local: 'Matrix' },
      { tmdbId: 438631, local: 'Duna' },
      { tmdbId: 999, local: null },
    ])
    expect(before.similarCoverage.movie).toMatchObject({ covered: 1, total: 1 })

    while (await convertLegacyCategories(SOURCE_ID, { maxCategories: 1 }, database)) {
      // uma categoria por chamada, como a pré-carga faz
    }
    expect(await database.categoryBlocks.count()).toBe(2)
    expect(await database.channels.filter((record) => record.kind !== 'episode').count()).toBe(0)

    expect(await whatScreensShow()).toEqual(before)
  })
})
