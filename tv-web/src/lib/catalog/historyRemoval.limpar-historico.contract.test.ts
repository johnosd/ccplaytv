/**
 * Testes de CONTRATO da feature 036 (Limpar histórico e remover item do
 * Histórico) — camada de dados. Travados em
 * `sdd/specs/036-limpar-historico/contract-tests.lock`. O sdd-execute só pode
 * fazê-los passar, nunca editá-los.
 *
 * Regras: `sdd/specs/036-limpar-historico/logic/remocao-historico.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type UserStateRecord } from './db'
import { buildStableId, getContinueWatching, getUserState, updateProgress } from './userStateRepository'
import { loadHistory } from './history'
import { clearHistory, removeMovieFromHistory, removeSeriesFromHistory } from './historyRemoval'

const SOURCE_ID = 'fonte-1'
const OTHER_SOURCE = 'fonte-2'

let database: CatalogDb
let clock = 1_000

beforeEach(async () => {
  clock = 1_000
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
  database = new CatalogDb(`test-history-removal-${Math.random().toString(36).slice(2)}`)
  await database.open()
  for (const id of [SOURCE_ID, OTHER_SOURCE]) {
    await database.sources.add({
      id,
      type: 'provider_credentials',
      displayName: id,
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 1,
      updatedAt: 1,
    })
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function record(overrides: Partial<CatalogRecord> & Pick<CatalogRecord, 'kind' | 'name'>): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, originalName: overrides.name, groupOrder: 0, ...overrides }
}

function state(stableId: string, sourceId: string, patch: Partial<UserStateRecord>): UserStateRecord {
  return { stableId, sourceId, isFavorite: false, createdAt: 0, updatedAt: 0, ...patch }
}

function movieId(streamId: string, sourceId = SOURCE_ID): string {
  return buildStableId({ sourceId, kind: 'movie', providerStreamId: streamId })
}

function episodeId(streamId: string, season: number, episode: number): string {
  return buildStableId({ sourceId: SOURCE_ID, kind: 'episode', providerStreamId: streamId, seasonNumber: season, episodeNumber: episode })
}

async function historyNames(kind: 'movie' | 'series', sourceId = SOURCE_ID): Promise<string[]> {
  return (await loadHistory(sourceId, kind, database)).records.map((r) => r.name)
}

async function continueIds(sourceId = SOURCE_ID): Promise<string[]> {
  return (await getContinueWatching(sourceId, database)).map((s) => s.stableId)
}

describe('historyRemoval — contrato da feature 036', () => {
  // FR-008, FR-012, FR-013, US1/AC1, US1/AC5, SC-001, SC-002
  it('remover filme só do Histórico: sai do Histórico, mas a retomada, o favorito e o "assistido" ficam', async () => {
    await database.channels.bulkAdd([
      record({ kind: 'movie', name: 'Alfa', providerStreamId: 'a' }),
      record({ kind: 'movie', name: 'Beta', providerStreamId: 'b' }),
    ])
    await database.userStates.bulkAdd([
      state(movieId('a'), SOURCE_ID, { progressSeconds: 300, lastWatched: 500, isFavorite: true, favoritedAt: 400, completedAt: 450 }),
      state(movieId('b'), SOURCE_ID, { progressSeconds: 90, lastWatched: 600 }),
    ])

    clock = 2_000
    await removeMovieFromHistory(movieId('a'), SOURCE_ID, 'history-only', database)

    expect(await historyNames('movie')).toEqual(['Beta'])
    expect(await continueIds()).toEqual([movieId('b'), movieId('a')])
    const alfa = await getUserState(movieId('a'), database)
    expect(alfa).toMatchObject({ progressSeconds: 300, isFavorite: true, favoritedAt: 400, completedAt: 450 })
  })

  // FR-009, FR-016, US1/AC2, SC-002
  it('remover e apagar progresso tira do Histórico e de "Continuar"; uma reprodução nova devolve o filme ao Histórico', async () => {
    await database.channels.add(record({ kind: 'movie', name: 'Alfa', providerStreamId: 'a' }))
    await database.userStates.add(state(movieId('a'), SOURCE_ID, { progressSeconds: 300, lastWatched: 500 }))

    clock = 2_000
    await removeMovieFromHistory(movieId('a'), SOURCE_ID, 'history-and-progress', database)

    expect(await historyNames('movie')).toEqual([])
    expect(await continueIds()).toEqual([])

    clock = 3_000
    await updateProgress(movieId('a'), SOURCE_ID, 42, database)

    expect(await historyNames('movie')).toEqual(['Alfa'])
    expect(await continueIds()).toEqual([movieId('a')])
  })

  // FR-013, FR-015, FR-016, US1/AC6
  it('remover uma série age sobre todos os episódios dela, de todas as temporadas — e só dela; "assistido" do episódio fica', async () => {
    await database.channels.bulkAdd([
      record({ kind: 'series', name: 'Série Um', seriesId: 's1' }),
      record({ kind: 'series', name: 'Série Dois', seriesId: 's2' }),
      record({ kind: 'episode', name: 'S1 T1E1', seriesId: 's1', providerStreamId: 'e11', seasonNumber: 1, episodeNumber: 1 }),
      record({ kind: 'episode', name: 'S1 T2E1', seriesId: 's1', providerStreamId: 'e21', seasonNumber: 2, episodeNumber: 1 }),
      record({ kind: 'episode', name: 'S2 T1E1', seriesId: 's2', providerStreamId: 'x11', seasonNumber: 1, episodeNumber: 1 }),
    ])
    await database.userStates.bulkAdd([
      state(episodeId('e11', 1, 1), SOURCE_ID, { completedAt: 150, lastWatched: 100 }),
      state(episodeId('e21', 2, 1), SOURCE_ID, { progressSeconds: 60, lastWatched: 300 }),
      state(episodeId('x11', 1, 1), SOURCE_ID, { progressSeconds: 70, lastWatched: 200 }),
    ])

    clock = 2_000
    await removeSeriesFromHistory(SOURCE_ID, 's1', 'history-and-progress', database)

    expect(await historyNames('series')).toEqual(['Série Dois'])
    expect(await continueIds()).toEqual([episodeId('x11', 1, 1)])
    expect(await getUserState(episodeId('e11', 1, 1), database)).toMatchObject({ completedAt: 150 })
  })

  // FR-014, FR-025, US2/AC2, US2/AC5, US2/AC7, SC-005
  it('limpar Histórico de Filmes: apaga os indisponíveis também, mantém a retomada, e não toca Séries nem outra lista', async () => {
    await database.channels.bulkAdd([
      record({ kind: 'movie', name: 'Alfa', providerStreamId: 'a' }),
      record({ kind: 'series', name: 'Série Um', seriesId: 's1' }),
      record({ kind: 'episode', name: 'S1 T1E1', seriesId: 's1', providerStreamId: 'e11', seasonNumber: 1, episodeNumber: 1 }),
      record({ kind: 'movie', name: 'Alfa (outra lista)', providerStreamId: 'a', sourceId: OTHER_SOURCE }),
    ])
    await database.userStates.bulkAdd([
      state(movieId('a'), SOURCE_ID, { progressSeconds: 300, lastWatched: 500 }),
      // Sem correspondência no catálogo atual (FR-025).
      state(movieId('zz'), SOURCE_ID, { progressSeconds: 30, lastWatched: 400 }),
      state(episodeId('e11', 1, 1), SOURCE_ID, { progressSeconds: 60, lastWatched: 300 }),
      state(movieId('a', OTHER_SOURCE), OTHER_SOURCE, { progressSeconds: 10, lastWatched: 900 }),
    ])

    clock = 2_000
    await clearHistory(SOURCE_ID, 'movies', 'history-only', database)

    const movies = await loadHistory(SOURCE_ID, 'movie', database)
    expect(movies.records).toEqual([])
    expect(movies.unresolved).toBe(0)
    expect(await historyNames('series')).toEqual(['Série Um'])
    expect(await historyNames('movie', OTHER_SOURCE)).toEqual(['Alfa (outra lista)'])
    expect(await continueIds()).toEqual([movieId('a'), movieId('zz'), episodeId('e11', 1, 1)])
  })
})
