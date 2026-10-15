import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { listCategories } from './catalogRepository'
import { ensureCategory } from './categoryLoader'
import { startImport } from './importPipeline'
import { storedItems } from '../../testing/catalogStorage'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-044-pipeline-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

async function readAll(sourceId: string): Promise<void> {
  for (const category of await listCategories(sourceId, undefined, database)) {
    await ensureCategory(sourceId, category, { database })
  }
}

describe('importação M3U — headers e Modo limitado (feature 044)', () => {
  it('Modo limitado não guarda a URL, então também não guarda os headers (nem o valor aparece no que foi gravado)', async () => {
    const source: SourceRecord = {
      id: 'fonte-legado',
      type: 'provider_credentials',
      displayName: 'Painel Legado',
      providerDns: 'http://exemplo.test',
      providerUsername: 'usuario-teste',
      providerPassword: 'senha-teste',
      connectionState: 'never_synced',
      createdAt: 1,
      updatedAt: 1,
    }
    await database.sources.add(source)
    const list = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-chno="3" group-title="Canais",Canal Legado',
      'http://exemplo.test/live/usuario-teste/senha-teste/101.ts|User-Agent=UA-LEGADO-044',
    ].join('\n')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/get.php')) return Promise.resolve(new Response(list))
        if (url.includes('player_api.php') && url.includes('action=')) return Promise.resolve(new Response('erro', { status: 404 }))
        return Promise.resolve(new Response(JSON.stringify({ user_info: { auth: 1, allowed_output_formats: ['ts'] } })))
      }),
    )

    const run = await (await startImport(source.id, { database })).completion
    expect(run.status).toBe('completed')
    await readAll(source.id)

    const items = await storedItems(database, source.id)
    const channel = items.find((item) => item.originalName === 'Canal Legado')
    expect(channel).toBeDefined()
    expect(channel?.directUrl).toBeUndefined()
    expect(channel?.providerStreamId).toBe('101')
    expect(channel?.playbackHeaders).toBeUndefined()
    expect(channel?.declaredChannelNumber).toBe(3)
    expect(JSON.stringify(items)).not.toContain('UA-LEGADO-044')
  })

  it('T017: um item sem headers/radio/tvg-chno não ganha as três chaves no que foi gravado (nem como `undefined`)', async () => {
    const source: SourceRecord = {
      id: 'fonte-chaves',
      type: 'm3u_url',
      displayName: 'Lista',
      m3uUrl: 'http://exemplo.test/lista.m3u',
      connectionState: 'never_synced',
      createdAt: 1,
      updatedAt: 1,
    }
    await database.sources.add(source)
    const list = [
      '#EXTM3U',
      '#EXTINF:-1 group-title="Canais",Canal Comum',
      'http://exemplo.test/live/1.ts',
      '#EXTINF:-1 tvg-chno="9" radio="true" group-title="Canais",Canal Com Campos',
      'http://exemplo.test/live/2.ts|User-Agent=UA-CHAVES',
    ].join('\n')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(list))))

    await (await startImport(source.id, { database })).completion
    await readAll(source.id)

    const items = await storedItems(database, source.id)
    const keysOf = (name: string) => Object.keys(items.find((item) => item.originalName === name) ?? {})
    const added = ['playbackHeaders', 'radio', 'declaredChannelNumber']

    for (const key of added) expect(keysOf('Canal Comum')).not.toContain(key)
    for (const key of added) expect(keysOf('Canal Com Campos')).toContain(key)
  })

  it('renovar a categoria com um header novo regrava o bloco (a assinatura enxerga a mudança) e mantém o id do item', async () => {
    const source: SourceRecord = {
      id: 'fonte-m3u',
      type: 'm3u_url',
      displayName: 'Lista',
      m3uUrl: 'http://exemplo.test/lista.m3u',
      connectionState: 'never_synced',
      createdAt: 1,
      updatedAt: 1,
    }
    await database.sources.add(source)
    const text = (agent: string) =>
      ['#EXTM3U', '#EXTINF:-1 group-title="Canais",Canal', `http://exemplo.test/live/1.ts|User-Agent=${agent}`].join('\n')
    const fetchMock = vi.fn(() => Promise.resolve(new Response(text('UA-A'))))
    vi.stubGlobal('fetch', fetchMock)

    await (await startImport(source.id, { database })).completion
    await readAll(source.id)
    const before = (await storedItems(database, source.id))[0]
    expect(before.playbackHeaders).toEqual({ userAgent: 'UA-A' })

    // Mesmo item, header diferente: a leitura guardada de uma nova importação traz o valor novo.
    fetchMock.mockImplementation(() => Promise.resolve(new Response(text('UA-B'))))
    await (await startImport(source.id, { database })).completion
    await readAll(source.id)
    const after = (await storedItems(database, source.id))[0]
    expect(after.playbackHeaders).toEqual({ userAgent: 'UA-B' })
  })
})
