/**
 * Contrato da feature 030 (EPG — dados e "Agora") — travado em
 * `sdd/specs/030-epg-dados-agora/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import { getEpgStatus, listProgramsForChannels } from './epgRepository'
import { syncEpg } from './epgSync'

const SOURCE_ID = 'fonte-epg'
const PASSWORD = 'senha-secreta-123'
const NOW_1 = Date.UTC(2026, 8, 29, 12, 0, 0)
const NOW_2 = Date.UTC(2026, 8, 29, 18, 0, 0)
const RANGE = { from: Date.UTC(2026, 8, 28, 0, 0, 0), to: Date.UTC(2026, 9, 2, 0, 0, 0) }

const PROVIDER_SOURCE: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario-teste',
  providerPassword: PASSWORD,
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

function xmltv(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="globo.br"><display-name>Globo</display-name></channel>
  <programme start="20260929120000 +0000" stop="20260929130000 +0000" channel="globo.br"><title>${title}</title></programme>
</tv>`
}

function textResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } })
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-epg-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PROVIDER_SOURCE)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

describe('syncEpg — contrato da feature 030', () => {
  // US1/AC1, FR-001 (endereço do painel com a credencial da fonte), FR-004 (substituição inteira), FR-015 (estado "vinculado")
  it('fonte Xtream sem configuração: baixa o xmltv.php do painel, grava, e a sincronização seguinte substitui a anterior', async () => {
    const fetchImpl = vi.fn(async () => textResponse(xmltv('Jornal da Manhã')))

    const first = await syncEpg(SOURCE_ID, { database, now: () => NOW_1, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(first.outcome).toBe('synced')
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]))
    expect(`${url.origin}${url.pathname}`).toBe('http://painel.test/xmltv.php')
    expect(url.searchParams.get('username')).toBe('usuario-teste')
    expect(url.searchParams.get('password')).toBe(PASSWORD)

    let programs = await listProgramsForChannels(SOURCE_ID, ['globo.br'], RANGE, database)
    expect(programs.get('globo.br')?.map((p) => p.title)).toEqual(['Jornal da Manhã'])
    expect(await getEpgStatus(SOURCE_ID, database)).toMatchObject({
      state: 'linked',
      urlOrigin: 'panel',
      lastSyncAt: NOW_1,
      offsetHours: 0,
    })

    fetchImpl.mockImplementation(async () => textResponse(xmltv('Edição da Tarde')))
    const second = await syncEpg(SOURCE_ID, { database, now: () => NOW_2, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(second.outcome).toBe('synced')
    programs = await listProgramsForChannels(SOURCE_ID, ['globo.br'], RANGE, database)
    expect(programs.get('globo.br')?.map((p) => p.title)).toEqual(['Edição da Tarde'])
    expect((await getEpgStatus(SOURCE_ID, database))?.lastSyncAt).toBe(NOW_2)
  })

  // US2/AC3, FR-005 (falha preserva o anterior), FR-013 (credencial fora de erro/log), FR-019 (erro categorizado), Constitution: "Segredos Fora dos Clientes e dos Logs"
  it('falha de rede preserva a programação anterior, registra o erro categorizado e nunca vaza a senha', async () => {
    const ok = vi.fn(async () => textResponse(xmltv('Jornal da Manhã')))
    await syncEpg(SOURCE_ID, { database, now: () => NOW_1, fetchImpl: ok as unknown as typeof fetch })

    const logged: unknown[] = []
    for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(...args)
      })
    }
    const failing = vi.fn(async (input: RequestInfo | URL) => {
      throw new TypeError(`fetch failed: ${String(input)}`)
    })

    const result = await syncEpg(SOURCE_ID, { database, now: () => NOW_2, fetchImpl: failing as unknown as typeof fetch })

    expect(result).toMatchObject({ outcome: 'failed', errorKind: 'network' })
    const programs = await listProgramsForChannels(SOURCE_ID, ['globo.br'], RANGE, database)
    expect(programs.get('globo.br')?.map((p) => p.title)).toEqual(['Jornal da Manhã'])
    const status = await getEpgStatus(SOURCE_ID, database)
    expect(status).toMatchObject({ state: 'error', errorKind: 'network', lastSyncAt: NOW_1 })

    const surfaces = [JSON.stringify(result), JSON.stringify(status), ...logged.map((entry) => String(entry instanceof Error ? `${entry.message} ${entry.stack}` : JSON.stringify(entry)))]
    for (const text of surfaces) expect(text).not.toContain(PASSWORD)
  })
})
