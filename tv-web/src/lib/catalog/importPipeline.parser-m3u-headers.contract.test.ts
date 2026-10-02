/**
 * Contrato da feature 044 (parser M3U: headers) — TRAVADO por
 * `contract-tests.lock`. O executor só pode fazê-los passar, nunca editá-los.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord } from './db'
import { listCategories } from './catalogRepository'
import { ensureCategory } from './categoryLoader'
import { startImport } from './importPipeline'
import { resolvePlaybackUrl } from './playbackUrl'
import { storedItems } from '../../testing/catalogStorage'

const USER_AGENT = 'UA-SECRETO-044'
const REFERER = 'http://ref-secreto.test/'

const SOURCE: SourceRecord = {
  id: 'fonte-044',
  type: 'm3u_url',
  displayName: 'Lista',
  m3uUrl: 'http://exemplo.test/lista.m3u',
  connectionState: 'never_synced',
  createdAt: 1,
  updatedAt: 1,
}

const LIST = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-chno="12" radio="true" group-title="Canais",Radio Exemplo',
  `http://exemplo.test/live/1.ts|User-Agent=${USER_AGENT}&Referer=${REFERER}`,
  '#EXTINF:-1 group-title="Canais",Canal Simples',
  'http://exemplo.test/live/2.ts',
  '#EXTINF:-1 tvg-chno="abc" radio="false" group-title="Canais",Canal Invalido',
  'http://exemplo.test/live/3.ts',
].join('\n')

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-044-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(SOURCE)
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(LIST))))
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

async function importAndRead() {
  const run = await (await startImport(SOURCE.id, { database })).completion
  for (const category of await listCategories(SOURCE.id, undefined, database)) {
    await ensureCategory(SOURCE.id, category, { database })
  }
  const items = await storedItems(database, SOURCE.id)
  const byName = (name: string) => items.find((item) => item.originalName === name) as CatalogRecord
  return { run, byName }
}

describe('importação M3U — headers, radio e tvg-chno persistidos (feature 044)', () => {
  it('FR-002/FR-007/FR-008/FR-009/FR-011: guarda headers, radio e tvg-chno; item sem nada fica como hoje', async () => {
    const { run, byName } = await importAndRead()
    expect(run.status).toBe('completed')

    const radio = byName('Radio Exemplo')
    expect(radio.directUrl).toBe('http://exemplo.test/live/1.ts')
    expect(radio.playbackHeaders).toEqual({ userAgent: USER_AGENT, referer: REFERER })
    expect(radio.radio).toBe(true)
    expect(radio.declaredChannelNumber).toBe(12)
    expect(radio.kind).toBe('channel')

    const simple = byName('Canal Simples')
    expect(simple.directUrl).toBe('http://exemplo.test/live/2.ts')
    expect(simple.playbackHeaders).toBeUndefined()
    expect(simple.radio).toBeUndefined()
    expect(simple.declaredChannelNumber).toBeUndefined()

    const invalid = byName('Canal Invalido')
    expect(invalid.radio).toBeUndefined()
    expect(invalid.declaredChannelNumber).toBeUndefined()
  })

  it('FR-001/FR-010 + Constitution (segredos): reprodução abre a URL limpa; header nunca vai a log, execução ou fonte', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))

    const { run, byName } = await importAndRead()

    expect(await resolvePlaybackUrl(byName('Radio Exemplo').id as number, database)).toBe('http://exemplo.test/live/1.ts')

    const visible = JSON.stringify([run, await database.sources.toArray(), await database.importRuns.toArray(), spies.flatMap((spy) => spy.mock.calls)])
    expect(visible).not.toContain(USER_AGENT)
    expect(visible).not.toContain('ref-secreto')
  })
})
