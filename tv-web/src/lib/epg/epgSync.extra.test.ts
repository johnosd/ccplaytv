/**
 * Feature 030 — casos de `syncEpg` fora do contrato travado: gzip, resposta
 * que não é XMLTV, recusa, quota, precedência do endereço manual e descarte
 * quando a fonte muda durante a execução (FR-011).
 */
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { getEpgStatus, listProgramsForChannels, setEpgEnabled } from './epgRepository'
import { syncEpg } from './epgSync'

const SOURCE_ID = 'fonte'
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0)
const RANGE = { from: Date.UTC(2026, 8, 28), to: Date.UTC(2026, 9, 3) }

const PROVIDER: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'u',
  providerPassword: 'p',
  connectionState: 'synced',
  createdAt: 1,
  updatedAt: 1,
}

const XML = `<?xml version="1.0"?><tv>
<programme start="20260929120000 +0000" stop="20260929130000 +0000" channel="a"><title>Agora</title></programme>
<programme start="20261010120000 +0000" stop="20261010130000 +0000" channel="a"><title>Longe demais</title></programme>
</tv>`

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-sync-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PROVIDER)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

const respond = (body: BodyInit | null, init?: ResponseInit) => vi.fn(async () => new Response(body, init)) as unknown as typeof fetch
const run = (fetchImpl: typeof fetch) => syncEpg(SOURCE_ID, { database, now: () => NOW, fetchImpl })
const titles = async () => ((await listProgramsForChannels(SOURCE_ID, ['a'], RANGE, database)).get('a') ?? []).map((p) => p.title)

describe('syncEpg — fora do contrato', () => {
  it('XMLTV comprimido (gzip pelo conteúdo) e só a janela é guardada', async () => {
    const result = await run(respond(new Uint8Array(gzipSync(Buffer.from(XML)))))
    expect(result).toMatchObject({ outcome: 'synced', programCount: 1 })
    expect(await titles()).toEqual(['Agora'])
  })

  it('a janela se alarga pelo deslocamento da fonte', async () => {
    await database.sources.update(SOURCE_ID, { epgOffsetHours: 12 })
    const far = XML.replace('20261010', '20261001') // ~+48h..+72h
    await run(respond(far))
    // 12 h + 48 h de janela + 12 h de deslocamento = +72 h → 01/10 12:00 ainda cabe.
    expect(await titles()).toEqual(['Agora', 'Longe demais'])
  })

  it('resposta que não é XMLTV falha como not_xmltv e não grava nada', async () => {
    const result = await run(respond('<html><body>Erro</body></html>'))
    expect(result).toMatchObject({ outcome: 'failed', errorKind: 'not_xmltv' })
    expect(await database.epgPrograms.count()).toBe(0)
    expect(await getEpgStatus(SOURCE_ID, database)).toMatchObject({ state: 'error', errorKind: 'not_xmltv' })
  })

  it('401/403 = refused; 500 = network', async () => {
    expect(await run(respond('no', { status: 403 }))).toMatchObject({ errorKind: 'refused' })
    expect(await run(respond('no', { status: 500 }))).toMatchObject({ errorKind: 'network' })
  })

  it('arquivo cortado no meio do gzip = unreadable', async () => {
    const bytes = new Uint8Array(gzipSync(Buffer.from(XML))).slice(0, 15)
    expect(await run(respond(bytes))).toMatchObject({ outcome: 'failed', errorKind: 'unreadable' })
  })

  it('o endereço manual vence o do painel', async () => {
    await database.sources.update(SOURCE_ID, { epgManualUrl: 'http://manual.test/g.xml' })
    const fetchImpl = respond(XML)
    await run(fetchImpl)
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toBe('http://manual.test/g.xml')
  })

  it('sem endereço, desativado ou fonte inexistente: skipped, sem rede', async () => {
    const fetchImpl = respond(XML)
    await database.sources.put({ ...PROVIDER, id: 'avulsa', type: 'm3u_url', m3uUrl: 'http://lista.test/a.m3u', providerDns: undefined, providerUsername: undefined, providerPassword: undefined })
    expect(await syncEpg('avulsa', { database, fetchImpl })).toEqual({ outcome: 'skipped' })
    await setEpgEnabled(SOURCE_ID, false, database)
    expect(await run(fetchImpl)).toEqual({ outcome: 'skipped' })
    expect(await syncEpg('nao-existe', { database, fetchImpl })).toEqual({ outcome: 'skipped' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('desativar durante a execução descarta o resultado (FR-011)', async () => {
    const fetchImpl = vi.fn(async () => {
      await setEpgEnabled(SOURCE_ID, false, database)
      return new Response(XML)
    }) as unknown as typeof fetch

    expect(await run(fetchImpl)).toEqual({ outcome: 'skipped' })

    expect(await database.epgPrograms.count()).toBe(0)
    expect((await getEpgStatus(SOURCE_ID, database))?.state).toBe('disabled')
  })

  it('a fonte removida durante a execução não deixa programação órfã (FR-011)', async () => {
    const fetchImpl = vi.fn(async () => {
      await database.sources.delete(SOURCE_ID)
      return new Response(XML)
    }) as unknown as typeof fetch

    expect(await run(fetchImpl)).toEqual({ outcome: 'skipped' })

    expect(await database.epgPrograms.count()).toBe(0)
  })

  it('quota cheia vira storage_full e preserva o que havia', async () => {
    await run(respond(XML))
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    vi.spyOn(database.epgPrograms, 'bulkAdd').mockRejectedValue(quota)

    expect(await run(respond(XML))).toMatchObject({ outcome: 'failed', errorKind: 'storage_full' })
    expect(await titles()).toEqual(['Agora'])
  })
})
