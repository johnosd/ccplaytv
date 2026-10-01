import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { listCategories, listChannels } from './catalogRepository'
import { ensureCategory } from './categoryLoader'
import { startImport } from './importPipeline'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-pipeline-atualizacao-${Math.random().toString(36).slice(2)}`)
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

function panel(vodCategories: Array<{ category_id: string; category_name: string }>, failVod = false) {
  return vi.fn((url: string) => {
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)))
    if (url.includes('get_live_categories')) return json([{ category_id: '1', category_name: 'Canais' }])
    if (url.includes('get_vod_categories')) return failVod ? Promise.resolve(new Response('', { status: 404 })) : json(vodCategories)
    if (url.includes('get_series_categories')) return json([])
    if (url.includes('get_vod_streams')) return json([{ stream_id: 7, name: 'Filme', stream_type: 'movie' }])
    return json({ user_info: { auth: 1, allowed_output_formats: ['ts'] } })
  })
}

async function importOnce(source: SourceRecord, at: number) {
  return (await startImport(source.id, { database, now: () => at })).completion
}

describe('importPipeline — atualização no lugar (feature 038, D-004)', () => {
  it('Xtream → Xtream: mesma geração, mesmos ids de categoria e itens servidos até a renovação', async () => {
    await database.sources.add(PROVIDER)
    vi.stubGlobal('fetch', panel([{ category_id: '10', category_name: 'Ação' }]))
    await importOnce(PROVIDER, 1000)
    const [action] = await listCategories(PROVIDER.id, 'movie', database)
    await ensureCategory(PROVIDER.id, action, { database, now: () => 1100 })
    const generation = (await database.sources.get(PROVIDER.id))?.activeGeneration
    const [movie] = await listChannels(PROVIDER.id, action.order, 0, 10, 'movie', database)

    vi.stubGlobal('fetch', panel([{ category_id: '10', category_name: 'Ação!' }, { category_id: '11', category_name: 'Nova' }]))
    const second = await importOnce(PROVIDER, 2000)

    expect(second.status).toBe('completed')
    expect((await database.sources.get(PROVIDER.id))?.activeGeneration).toBe(generation)
    const after = await listCategories(PROVIDER.id, 'movie', database)
    expect(after.map((c) => [c.id === action.id, c.name])).toEqual([[true, 'Ação!'], [false, 'Nova']])
    expect(after[0]).toMatchObject({ itemsFetchedAt: 1100, renewRequestedAt: 2000 })
    const [stillThere] = await listChannels(PROVIDER.id, action.order, 0, 10, 'movie', database)
    expect(stillThere.id).toBe(movie.id)
  })

  it('seção que falhou nesta atualização não apaga as categorias dela (FR-030)', async () => {
    await database.sources.add(PROVIDER)
    vi.stubGlobal('fetch', panel([{ category_id: '10', category_name: 'Ação' }]))
    await importOnce(PROVIDER, 1000)
    vi.stubGlobal('fetch', panel([], true))
    await importOnce(PROVIDER, 2000)
    expect((await listCategories(PROVIDER.id, 'movie', database)).map((c) => c.name)).toEqual(['Ação'])
  })

  it('M3U → M3U: categoria mantida aponta para o conteúdo novo e continua servindo o antigo até renovar', async () => {
    await database.sources.add(M3U)
    const file = (name: string) =>
      ['#EXTM3U', '#EXTINF:-1 group-title="Canais",' + name, 'http://exemplo.test/live/1.ts'].join('\n')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(file('Canal Antigo')))))
    await importOnce(M3U, 1000)
    const [category] = await listCategories(M3U.id, 'channel', database)
    await ensureCategory(M3U.id, category, { database, now: () => 1100 })
    const [before] = await listChannels(M3U.id, category.order, 0, 10, 'channel', database)

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(file('Canal Antigo')))))
    await importOnce(M3U, 2000)

    const [kept] = await listCategories(M3U.id, 'channel', database)
    expect(kept.id).toBe(category.id)
    expect(kept.renewRequestedAt).toBe(2000)
    // Entrada: serve o que tem, sem esperar.
    const served = await ensureCategory(M3U.id, kept, { database, now: () => 2100, serveStale: () => {} })
    expect(served.outcome).toBe('stale-served')
    // Renovação (pré-carga): lê os blocos novos e preserva o id.
    const renewed = await ensureCategory(M3U.id, kept, { database, now: () => 2200, renew: true })
    expect(renewed.outcome).toBe('fetched')
    const [after] = await listChannels(M3U.id, category.order, 0, 10, 'channel', database)
    expect(after.id).toBe(before.id)
    expect((await database.categories.get(kept.id))?.storedFrom).toBeUndefined()
  })

  it('troca de caminho (M3U → Xtream) publica uma geração nova', async () => {
    await database.sources.add({ ...PROVIDER })
    // 1ª: painel não fala o protocolo → conteúdo guardado (Modo limitado).
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('get_live_categories')) return Promise.resolve(new Response('', { status: 404 }))
        if (url.includes('get.php')) {
          return Promise.resolve(new Response('#EXTM3U\n#EXTINF:-1 group-title="Canais",C\nhttp://exemplo.test/live/u/p/1.ts'))
        }
        return Promise.resolve(new Response(JSON.stringify({ user_info: { auth: 1, allowed_output_formats: ['ts'] } })))
      }),
    )
    await importOnce(PROVIDER, 1000)
    const first = (await database.sources.get(PROVIDER.id))?.activeGeneration
    vi.stubGlobal('fetch', panel([{ category_id: '10', category_name: 'Ação' }]))
    await importOnce(PROVIDER, 2000)
    expect((await database.sources.get(PROVIDER.id))?.activeGeneration).not.toBe(first)
  })
})
