/**
 * Testes de CONTRATO da feature 025 (Filmes e Séries no DS V14) — "↺ Histórico".
 * Travados em `sdd/specs/025-filmes-series-ds-v14/contract-tests.lock`. O
 * sdd-execute só pode fazê-los passar, nunca editá-los.
 *
 * Regras: `sdd/specs/025-filmes-series-ds-v14/logic/historico.md`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type UserStateRecord } from './db'
import { buildStableId } from './userStateRepository'
import { loadHistory } from './history'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-history-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
})

afterEach(async () => {
  await database.delete()
})

const SOURCE_ID = 'fonte-1'
const OTHER_SOURCE = 'fonte-2'

function record(overrides: Partial<CatalogRecord> & Pick<CatalogRecord, 'kind' | 'name'>): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    originalName: overrides.name,
    groupOrder: 0,
    ...overrides,
  }
}

function state(stableId: string, sourceId: string, patch: Partial<UserStateRecord>): UserStateRecord {
  return { stableId, sourceId, isFavorite: false, createdAt: 0, updatedAt: 0, ...patch }
}

function movieId(streamId: string, sourceId = SOURCE_ID): string {
  return buildStableId({ sourceId, kind: 'movie', providerStreamId: streamId })
}

function episodeId(streamId: string, season: number, episode: number): string {
  return buildStableId({
    sourceId: SOURCE_ID,
    kind: 'episode',
    providerStreamId: streamId,
    seasonNumber: season,
    episodeNumber: episode,
  })
}

describe('loadHistory — contrato da feature 025', () => {
  // FR-009, FR-011, FR-012, FR-015, US2/AC1, US2/AC5, US2/AC6, SC-004, Constitution: "Identidade de Reprodução Não Depende da URL"
  it('Filmes: reproduzidos da lista ativa, mais recente primeiro, com concluídos; marcado sem reprodução fica fora; sem correspondência conta como não exibível', async () => {
    await database.channels.bulkAdd([
      record({ kind: 'movie', name: 'Alfa', providerStreamId: 'a' }),
      record({ kind: 'movie', name: 'Beta', providerStreamId: 'b' }),
      record({ kind: 'movie', name: 'Gama', providerStreamId: 'c' }),
    ])
    await database.userStates.bulkAdd([
      // Em andamento, reproduzido há mais tempo.
      state(movieId('a'), SOURCE_ID, { progressSeconds: 300, lastWatched: 100 }),
      // Concluído, reproduzido por último.
      state(movieId('b'), SOURCE_ID, { completedAt: 310, lastWatched: 300 }),
      // Só marcado como assistido à mão, nunca reproduzido: fora (FR-011).
      state(movieId('c'), SOURCE_ID, { completedAt: 200 }),
      // Reproduzido, mas não existe mais no catálogo atual: não vira card (FR-012).
      state(movieId('zz'), SOURCE_ID, { progressSeconds: 90, lastWatched: 250 }),
      // Outra lista: nunca aparece aqui (FR-015).
      state(movieId('a', OTHER_SOURCE), OTHER_SOURCE, { progressSeconds: 60, lastWatched: 900 }),
      // Episódio: nunca entra no Histórico de Filmes.
      state(episodeId('e1', 1, 1), SOURCE_ID, { progressSeconds: 60, lastWatched: 800 }),
    ])

    const result = await loadHistory(SOURCE_ID, 'movie', database)

    expect(result.records.map((r) => ({ kind: r.kind, name: r.name }))).toEqual([
      { kind: 'movie', name: 'Beta' },
      { kind: 'movie', name: 'Alfa' },
    ])
    expect(result.unresolved).toBe(1)
  })

  // FR-010, FR-012, US2/AC2, SC-004, Constitution: "IA e Classificação Nunca Inventam Dados"
  it('Séries: uma entrada por série, na posição do episódio reproduzido mais recente; nunca episódio solto; episódio sem série exibível conta como não exibível', async () => {
    await database.channels.bulkAdd([
      record({ kind: 'series', name: 'Série Um', seriesId: 's1' }),
      record({ kind: 'series', name: 'Série Dois', seriesId: 's2' }),
      record({ kind: 'series', name: 'Série Três', seriesId: 's3' }),
      record({ kind: 'episode', name: 'S1 E1', seriesId: 's1', providerStreamId: 'e11', seasonNumber: 1, episodeNumber: 1 }),
      record({ kind: 'episode', name: 'S1 E2', seriesId: 's1', providerStreamId: 'e12', seasonNumber: 1, episodeNumber: 2 }),
      record({ kind: 'episode', name: 'S2 E1', seriesId: 's2', providerStreamId: 'e21', seasonNumber: 1, episodeNumber: 1 }),
    ])
    await database.userStates.bulkAdd([
      state(episodeId('e11', 1, 1), SOURCE_ID, { completedAt: 120, lastWatched: 100 }),
      state(episodeId('e21', 1, 1), SOURCE_ID, { progressSeconds: 200, lastWatched: 300 }),
      state(episodeId('e12', 1, 2), SOURCE_ID, { progressSeconds: 50, lastWatched: 400 }),
      // Episódio que não está mais no catálogo: não dá para saber a série (FR-012).
      state(episodeId('e99', 2, 1), SOURCE_ID, { progressSeconds: 50, lastWatched: 350 }),
      // Série só favoritada, nunca reproduzida: fora.
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'series', seriesId: 's3' }), SOURCE_ID, {
        isFavorite: true,
        favoritedAt: 500,
      }),
    ])

    const result = await loadHistory(SOURCE_ID, 'series', database)

    expect(result.records.map((r) => ({ kind: r.kind, name: r.name }))).toEqual([
      { kind: 'series', name: 'Série Um' },
      { kind: 'series', name: 'Série Dois' },
    ])
    expect(result.unresolved).toBe(1)
  })
})
