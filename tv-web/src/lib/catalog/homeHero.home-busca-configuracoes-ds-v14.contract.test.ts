/**
 * Testes de CONTRATO da feature 026 (Home, Busca global e Configurações no
 * DS V14) — hero do Início. Travados em
 * `sdd/specs/026-home-busca-configuracoes-ds-v14/contract-tests.lock`. O
 * sdd-execute só pode fazê-los passar, nunca editá-los.
 *
 * Regras: `sdd/specs/026-home-busca-configuracoes-ds-v14/logic/hero-home.md`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type UserStateRecord } from './db'
import { buildStableId } from './userStateRepository'
import { loadHomeHero } from './homeHero'

let database: CatalogDb

const SOURCE_ID = 'fonte-1'
const OTHER_SOURCE = 'fonte-2'

beforeEach(async () => {
  database = new CatalogDb(`test-home-hero-${Math.random().toString(36).slice(2)}`)
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

function record(overrides: Partial<CatalogRecord> & Pick<CatalogRecord, 'kind' | 'name'>): CatalogRecord {
  return {
    sourceId: SOURCE_ID,
    generation: 1,
    originalName: overrides.name,
    groupOrder: 0,
    ...overrides,
  }
}

async function add(overrides: Partial<CatalogRecord> & Pick<CatalogRecord, 'kind' | 'name'>): Promise<string> {
  return String(await database.channels.add(record(overrides)))
}

function state(stableId: string, sourceId: string, patch: Partial<UserStateRecord>): UserStateRecord {
  return { stableId, sourceId, isFavorite: false, createdAt: 0, updatedAt: 0, ...patch }
}

function movieId(streamId: string, sourceId = SOURCE_ID): string {
  return buildStableId({ sourceId, kind: 'movie', providerStreamId: streamId })
}

function seriesId(id: string): string {
  return buildStableId({ sourceId: SOURCE_ID, kind: 'series', seriesId: id })
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

describe('loadHomeHero — contrato da feature 026', () => {
  // FR-002, FR-004, FR-005, US1/AC1, US1/AC5, SC-001, Constitution: "Identidade de Reprodução Não Depende da URL"
  it('com progresso: o hero é o item mais recente de "Continuar assistindo" que resolve; episódio vira a série, e a ação reproduz o EPISÓDIO na posição salva', async () => {
    await add({ kind: 'movie', name: 'Alfa', providerStreamId: 'a' })
    await add({ kind: 'series', name: 'Série Um', seriesId: 's1' })
    await add({ kind: 'episode', name: 'S1 E1', seriesId: 's1', providerStreamId: 'e11', seasonNumber: 1, episodeNumber: 1 })
    const e12 = await add({
      kind: 'episode',
      name: 'S1 E2',
      seriesId: 's1',
      providerStreamId: 'e12',
      seasonNumber: 1,
      episodeNumber: 2,
    })
    await database.userStates.bulkAdd([
      state(movieId('a'), SOURCE_ID, { progressSeconds: 300, lastWatched: 100 }),
      state(episodeId('e12', 1, 2), SOURCE_ID, { progressSeconds: 600, lastWatched: 400 }),
      // Mais recente de todos, mas não existe no catálogo atual: pulado, nunca card quebrado.
      state(movieId('zz'), SOURCE_ID, { progressSeconds: 90, lastWatched: 500 }),
      // Outra lista: nunca entra no hero desta.
      state(movieId('a', OTHER_SOURCE), OTHER_SOURCE, { progressSeconds: 60, lastWatched: 900 }),
    ])

    const hero = await loadHomeHero(SOURCE_ID, database)

    expect(hero.kind).toBe('continue')
    if (hero.kind === 'welcome') throw new Error('hero inesperado')
    expect(hero.record.kind).toBe('series')
    expect(hero.record.name).toBe('Série Um')
    expect(hero.primary).toEqual(
      expect.objectContaining({ type: 'play', itemId: e12, startAtMs: 600_000, resume: true }),
    )
  })

  // FR-002, FR-003, FR-006, US1/AC2, US1/AC3, Constitution: "IA e Classificação Nunca Inventam Dados", "Comandos Locais Independem de Rede"
  it('sem progresso: favorito mais recente de filme/série que resolve; série sem episódio conhecido abre o detalhe; sem favorito, boas-vindas', async () => {
    await add({ kind: 'series', name: 'Série Sem Episódios', seriesId: 's3' })
    await add({ kind: 'series', name: 'Série Com Episódios', seriesId: 's4' })
    await add({ kind: 'episode', name: 'S4 T1E2', seriesId: 's4', providerStreamId: 'e42', seasonNumber: 1, episodeNumber: 2 })
    await add({ kind: 'episode', name: 'S4 T2E1', seriesId: 's4', providerStreamId: 'e51', seasonNumber: 2, episodeNumber: 1 })
    const e41 = await add({
      kind: 'episode',
      name: 'S4 T1E1',
      seriesId: 's4',
      providerStreamId: 'e41',
      seasonNumber: 1,
      episodeNumber: 1,
    })
    const delta = await add({ kind: 'movie', name: 'Delta', providerStreamId: 'd' })
    await add({ kind: 'channel', name: 'Canal X', providerStreamId: 'c1' })

    await database.userStates.bulkAdd([
      state(seriesId('s3'), SOURCE_ID, { isFavorite: true, favoritedAt: 300 }),
      // Mais recente que s3, mas não resolve no catálogo: pulado.
      state(movieId('zz'), SOURCE_ID, { isFavorite: true, favoritedAt: 350 }),
      // Canal favorito nunca vira hero (só filme ou série).
      state(buildStableId({ sourceId: SOURCE_ID, kind: 'channel', providerStreamId: 'c1' }), SOURCE_ID, {
        isFavorite: true,
        favoritedAt: 900,
      }),
      // Outra lista.
      state(movieId('d', OTHER_SOURCE), OTHER_SOURCE, { isFavorite: true, favoritedAt: 950 }),
    ])

    const semEpisodios = await loadHomeHero(SOURCE_ID, database)
    expect(semEpisodios.kind).toBe('favorite')
    if (semEpisodios.kind === 'welcome') throw new Error('hero inesperado')
    expect(semEpisodios.record.name).toBe('Série Sem Episódios')
    expect(semEpisodios.primary).toEqual({ type: 'open-detail' })

    await database.userStates.add(state(seriesId('s4'), SOURCE_ID, { isFavorite: true, favoritedAt: 400 }))
    const comEpisodios = await loadHomeHero(SOURCE_ID, database)
    if (comEpisodios.kind === 'welcome') throw new Error('hero inesperado')
    expect(comEpisodios.record.name).toBe('Série Com Episódios')
    // Primeiro episódio conhecido (T1:E1), do início — nunca retomada inventada.
    expect(comEpisodios.primary).toEqual(
      expect.objectContaining({ type: 'play', itemId: e41, startAtMs: undefined, resume: false }),
    )

    await database.userStates.add(state(movieId('d'), SOURCE_ID, { isFavorite: true, favoritedAt: 500 }))
    const filme = await loadHomeHero(SOURCE_ID, database)
    if (filme.kind === 'welcome') throw new Error('hero inesperado')
    expect(filme.kind).toBe('favorite')
    expect(filme.record.name).toBe('Delta')
    expect(filme.primary).toEqual(expect.objectContaining({ type: 'play', itemId: delta, startAtMs: undefined, resume: false }))

    await database.userStates.clear()
    expect(await loadHomeHero(SOURCE_ID, database)).toEqual({ kind: 'welcome' })
  })
})
