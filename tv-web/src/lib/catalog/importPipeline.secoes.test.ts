import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { startImport } from './importPipeline'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-pipeline-secoes-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await database.delete()
})

const PROVIDER: SourceRecord = {
  id: 'fonte-xtream',
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://exemplo.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
  connectionState: 'never_synced',
  createdAt: 1,
  updatedAt: 1,
}

const M3U: SourceRecord = {
  id: 'fonte-m3u',
  type: 'm3u_url',
  displayName: 'Lista',
  m3uUrl: 'http://exemplo.test/lista.m3u',
  connectionState: 'never_synced',
  createdAt: 1,
  updatedAt: 1,
}

describe('importPipeline — seções (feature 038, FR-015/FR-017)', () => {
  it('Xtream: categorias por seção; seção vazia vira "não disponível", seção não servida vira "falhou"', async () => {
    await database.sources.add(PROVIDER)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('get_live_categories')) {
          return Promise.resolve(new Response(JSON.stringify([{ category_id: '1', category_name: 'A' }, { category_id: '2', category_name: 'B' }])))
        }
        if (url.includes('get_vod_categories')) return Promise.resolve(new Response(JSON.stringify([])))
        if (url.includes('get_series_categories')) return Promise.resolve(new Response('', { status: 404 }))
        return Promise.resolve(new Response(JSON.stringify({ user_info: { auth: 1, allowed_output_formats: ['ts'] } })))
      }),
    )

    const done = await (await startImport(PROVIDER.id, { database, now: () => 5000 })).completion
    expect(done.status).toBe('completed')
    expect(done.sections).toEqual({
      channel: { state: 'ready', categories: 2 },
      movie: { state: 'unavailable' },
      series: { state: 'failed' },
    })
  })

  it('M3U: itens por tipo (série conta série, nunca episódio); tipo ausente vira "não disponível"', async () => {
    await database.sources.add(M3U)
    const text = [
      '#EXTM3U',
      '#EXTINF:-1 group-title="Canais",Canal 1',
      'http://exemplo.test/live/1.ts',
      '#EXTINF:-1 group-title="Canais",Canal 2',
      'http://exemplo.test/live/2.ts',
      '#EXTINF:-1 group-title="Novelas",Novela S01E01',
      'http://exemplo.test/series/n1.mp4',
      '#EXTINF:-1 group-title="Novelas",Novela S01E02',
      'http://exemplo.test/series/n2.mp4',
    ].join('\n')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(text))))

    const done = await (await startImport(M3U.id, { database, now: () => 5000 })).completion
    expect(done.status).toBe('completed')
    expect(done.sections?.channel).toEqual({ state: 'ready', items: 2 })
    expect(done.sections?.series).toEqual({ state: 'ready', items: 1 })
    expect(done.sections?.movie).toEqual({ state: 'unavailable' })
  })
})
