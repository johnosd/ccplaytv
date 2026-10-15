import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { storeSeriesEpisodes } from '../catalog/catalogRepository'
import { ensureTitleMetadata } from './titleMetadata'
import { MAX_PAUSE_MS, saveTmdbKey, validPause } from './tmdbKeyRepository'

/**
 * Feature 065, T057 (relato da TV física): com o disco cheio, gravar um dado derivado não pode esconder o que acabou de chegar
 * nem fazer a série parecer não carregada; e uma pausa por limite de uso além do teto (relógio adiantado, valor absurdo)
 * não deixa o TMDB calado indefinidamente.
 */

const SOURCE_ID = 'fonte-armazenamento'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 9, 12, 0, 0)

const PANEL: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario',
  providerPassword: 'senha',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const quota = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' })

function fakeFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/3/authentication') return json({ success: true })
    if (url.hostname === 'painel.test') return json({ info: { plot: 'Do provedor.', tmdb_id: '603', backdrop_path: ['http://img.test/p.jpg'] }, movie_data: {} })
    if (url.pathname === '/3/movie/603') {
      return json({ id: 603, title: 'Matrix', original_language: 'en', release_date: '1999-03-31', overview: 'Sinopse.', backdrop_path: '/bd.jpg',
        credits: { cast: [{ name: 'Keanu Reeves' }], crew: [] }, videos: { results: [] } })
    }
    return json({ status_code: 34 }, 404)
  })
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-title-storage-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

async function addMovie(): Promise<number> {
  return (await database.channels.add({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'Matrix', originalName: 'Matrix', groupOrder: 0, providerStreamId: '100', year: 1999 })) as number
}

describe('detalhe com disco cheio e pausa absurda (065, T057)', () => {
  it('sem espaço para guardar, o detalhe ainda mostra o que o provedor e o TMDB acabaram de mandar', async () => {
    const fetchImpl = fakeFetch()
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    const id = await addMovie()
    vi.spyOn(database.titleMetadata, 'put').mockRejectedValue(quota())

    const view = await ensureTitleMetadata(id, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(view.synopsis).toBeDefined()
    expect(view.backdropUrl).toBeDefined()
    expect(view.tmdbMatch).toBe('matched')
    expect(view.cast).toBeDefined()
  })

  it('pausa gravada além do teto (relógio adiantado) não bloqueia o detalhe; dentro do teto continua valendo', async () => {
    expect(validPause(NOW + MAX_PAUSE_MS + 1, NOW)).toBeUndefined()
    expect(validPause(NOW + 60_000, NOW)).toBe(NOW + 60_000)
    expect(validPause(NOW - 1, NOW)).toBeUndefined()

    const fetchImpl = fakeFetch()
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    await database.integrations.update('tmdb', { pausedUntil: NOW + 3 * 24 * 60 * 60 * 1000 })
    const id = await addMovie()

    const view = await ensureTitleMetadata(id, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(view.tmdbMatch).toBe('matched')
  })

  it('falha ao gravar o índice derivado do selo não faz a série parecer não carregada', async () => {
    const seriesRecordId = (await database.channels.add({ sourceId: SOURCE_ID, generation: 1, kind: 'series', name: 'Série', originalName: 'Série', groupOrder: 0, seriesId: 's-1' })) as number
    vi.spyOn(database.seriesWatchMembers, 'put').mockRejectedValue(quota())
    const episodes = [1, 2].map((episodeNumber) => ({
      sourceId: SOURCE_ID, generation: 1, kind: 'episode' as const, name: `E${episodeNumber}`, originalName: `E${episodeNumber}`,
      groupOrder: 0, seriesId: 's-1', providerStreamId: `ep-${episodeNumber}`, seasonNumber: 1, episodeNumber,
    }))

    await expect(storeSeriesEpisodes({ sourceId: SOURCE_ID, generation: 1, seriesId: 's-1', seriesRecordId }, episodes, NOW, database)).resolves.toBeUndefined()
    expect(await database.channels.where('[sourceId+generation+kind+groupOrder]').equals([SOURCE_ID, 1, 'episode', 0]).count()).toBe(2)
  })
})
