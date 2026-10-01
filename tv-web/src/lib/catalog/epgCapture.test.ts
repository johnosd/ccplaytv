/**
 * Feature 030 — captura do id de EPG e do `url-tvg`, e o que a fonte guarda
 * sobre EPG (FR-006, FR-007, FR-012, FR-013/FR-017). Testes da fase, fora do
 * contrato travado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { classifyEntry, normalizeEpgChannelId } from './classifier'
import { linesFromText, parseM3uLines, type ParseTally } from './m3uParser'
import { mapLiveEntry } from './xtreamConnector'
import { listAllOfKind, listCategories, listChannels } from './catalogRepository'
import { startImport } from './importPipeline'
import { ensureCategory } from './categoryLoader'
import { deleteSource, getSource, listSources } from './sourceRepository'
import { listProgramsForChannels, setEpgManualUrl, writeEpgPrograms } from '../epg/epgRepository'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-epg-capture-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

describe('normalizeEpgChannelId', () => {
  it('aceita string não vazia (com trim) e recusa o resto', () => {
    expect(normalizeEpgChannelId('  Ae.br ')).toBe('Ae.br')
    expect(normalizeEpgChannelId('')).toBeUndefined()
    expect(normalizeEpgChannelId('   ')).toBeUndefined()
    expect(normalizeEpgChannelId(null)).toBeUndefined()
    expect(normalizeEpgChannelId(42)).toBeUndefined()
  })
})

describe('captura Xtream (research R1)', () => {
  const categories = new Map([['1', { id: '1', name: 'Notícias', order: 0 }]])
  const noUrl = () => undefined

  it('mapLiveEntry lê epg_channel_id; null/vazio = canal sem EPG', () => {
    const base = { name: 'Canal', stream_id: 10, category_id: 1 }
    expect(mapLiveEntry({ ...base, epg_channel_id: 'globo.br' }, categories, noUrl)?.epgChannelId).toBe('globo.br')
    expect(mapLiveEntry({ ...base, epg_channel_id: null }, categories, noUrl)?.epgChannelId).toBeUndefined()
    expect(mapLiveEntry({ ...base, epg_channel_id: '' }, categories, noUrl)?.epgChannelId).toBeUndefined()
    expect(mapLiveEntry(base, categories, noUrl)?.epgChannelId).toBeUndefined()
  })
})

describe('captura M3U', () => {
  it('classifyEntry lê tvg-id no canal', () => {
    const classified = classifyEntry({
      name: 'Globo',
      url: 'http://x.test/1.ts',
      group: 'Canais | Abertos',
      attributes: { 'tvg-id': 'globo.br' },
    })
    expect(classified.kind).toBe('channel')
    expect(classified.epgChannelId).toBe('globo.br')
  })

  it('o parser expõe os atributos do cabeçalho #EXTM3U', async () => {
    const tally: ParseTally = { invalidCount: 0 }
    const text = '#EXTM3U url-tvg="http://epg.test/guia.xml.gz" x-tvg-url="http://outro.test/g.xml"\n#EXTINF:-1,A\nhttp://x.test/1.ts'
    for await (const entry of parseM3uLines(linesFromText(text), tally)) void entry
    expect(tally.headerAttributes).toEqual({
      'url-tvg': 'http://epg.test/guia.xml.gz',
      'x-tvg-url': 'http://outro.test/g.xml',
    })
  })
})

const M3U_SOURCE: SourceRecord = {
  id: 'fonte-m3u',
  type: 'm3u_url',
  displayName: 'Lista',
  m3uUrl: 'http://exemplo.test/lista.m3u',
  connectionState: 'never_synced',
  createdAt: 1,
  updatedAt: 1,
}

function m3u(header: string): string {
  return [
    header,
    '#EXTINF:-1 tvg-id="globo.br" group-title="Canais | Abertos",Globo',
    'http://exemplo.test/live/1.ts',
    '#EXTINF:-1 group-title="Canais | Abertos",Canal Sem Id',
    'http://exemplo.test/live/2.ts',
    '#EXTINF:-1 tvg-id="filme.x" group-title="Filmes",Um Filme',
    'http://exemplo.test/vod/1.mp4',
  ].join('\n')
}

describe('importação M3U (feature 030)', () => {
  it('guarda o url-tvg declarado e a marca de captura; o id de EPG só chega ao canal, após a leitura da categoria', async () => {
    await database.sources.add(M3U_SOURCE)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(m3u('#EXTM3U url-tvg="http://epg.test/guia.xml"')))))

    const run = await (await startImport(M3U_SOURCE.id, { database, now: () => 5_000 })).completion
    expect(run.status).toBe('completed')

    const source = await database.sources.get(M3U_SOURCE.id)
    expect(source?.epgDeclaredUrl).toBe('http://epg.test/guia.xml')
    expect(source?.epgIdsCapturedAt).toBe(5_000)

    const categories = await listCategories(M3U_SOURCE.id, 'channel', database)
    expect(categories.length).toBeGreaterThan(0)
    const abertos = categories.find((category) => category.name === 'Canais | Abertos')!
    await ensureCategory(M3U_SOURCE.id, abertos, { database })
    const channels = await listChannels(M3U_SOURCE.id, abertos.order, 0, 100, 'channel', database)
    const byName = Object.fromEntries(channels.map((channel) => [channel.name, channel.epgChannelId]))
    expect(byName).toEqual({ Globo: 'globo.br', 'Canal Sem Id': undefined })

    // Filme nunca leva id de EPG, mesmo com tvg-id.
    const movies = await listAllOfKind(M3U_SOURCE.id, 'movie', database)
    expect(movies.every((movie) => movie.epgChannelId === undefined)).toBe(true)
  })

  it('uma lista que perdeu o url-tvg não mantém o endereço antigo', async () => {
    await database.sources.add({ ...M3U_SOURCE, epgDeclaredUrl: 'http://velho.test/g.xml' })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(m3u('#EXTM3U')))))

    await (await startImport(M3U_SOURCE.id, { database })).completion

    expect((await database.sources.get(M3U_SOURCE.id))?.epgDeclaredUrl).toBeUndefined()
  })

  it('o endereço declarado nunca vai para o registro da execução', async () => {
    await database.sources.add(M3U_SOURCE)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(m3u('#EXTM3U url-tvg="http://epg.test/guia.xml?token=segredo"')))))

    const run = await (await startImport(M3U_SOURCE.id, { database })).completion

    expect(JSON.stringify(run)).not.toContain('segredo')
  })
})

describe('SourceView e exclusão (FR-012, FR-013, FR-017)', () => {
  it('a visão da fonte traz o estado do EPG e só o host do manual — nunca o endereço', async () => {
    await database.sources.add({ ...M3U_SOURCE, connectionState: 'synced', epgDeclaredUrl: 'http://epg.test/g.xml?token=segredo' })
    await setEpgManualUrl(M3U_SOURCE.id, 'https://guia.exemplo.org/xmltv/tudo.xml?chave=segredo-manual', database)

    const view = await getSource(M3U_SOURCE.id, database)

    expect(view?.epg.state).toBe('never_synced')
    expect(view?.epg.urlOrigin).toBe('manual')
    expect(view?.epgManualHost).toBe('guia.exemplo.org')
    const serialized = JSON.stringify(await listSources(database))
    expect(serialized).not.toContain('segredo')
    expect(serialized).not.toContain('xmltv/tudo')
  })

  it('excluir a fonte apaga a programação dela e só dela', async () => {
    await database.sources.add(M3U_SOURCE)
    await database.sources.add({ ...M3U_SOURCE, id: 'outra', displayName: 'Outra' })
    const program = { channelKey: 'a', start: 1_000, end: 2_000, title: 'P' }
    await writeEpgPrograms(M3U_SOURCE.id, [program], database)
    await writeEpgPrograms('outra', [program], database)

    await deleteSource(M3U_SOURCE.id, database)

    const range = { from: 0, to: 10_000 }
    expect((await listProgramsForChannels(M3U_SOURCE.id, ['a'], range, database)).size).toBe(0)
    expect((await listProgramsForChannels('outra', ['a'], range, database)).size).toBe(1)
  })
})
