import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { startImport } from './importPipeline'
import { getSource } from './sourceRepository'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-pipeline-account-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await database.delete()
})

const PROVIDER_SOURCE: SourceRecord = {
  id: 'fonte-provedor',
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://exemplo.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
  connectionState: 'never_synced',
  createdAt: 1,
  updatedAt: 1,
}

const EXP_SECONDS = 1_800_000_000

function panelFetch(userInfo: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('get_live_categories')) {
      return Promise.resolve(new Response(JSON.stringify([{ category_id: '1', category_name: 'Esportes' }])))
    }
    if (url.includes('get_vod_categories') || url.includes('get_series_categories')) {
      return Promise.resolve(new Response(JSON.stringify([])))
    }
    return Promise.resolve(
      new Response(JSON.stringify({ user_info: { auth: 1, allowed_output_formats: ['ts'], ...userInfo } })),
    )
  })
}

describe('Sincronização grava a conta — contrato da feature 034', () => {
  // FR-001, FR-002, FR-016; US3 AC3; constitution 1.7.0 (estado local preservado)
  it('sucesso grava vencimento e verificação; credencial recusada depois marca "refused" sem perder o catálogo', async () => {
    await database.sources.add(PROVIDER_SOURCE)

    vi.stubGlobal('fetch', panelFetch({ exp_date: String(EXP_SECONDS) }))
    const ok = await (await startImport(PROVIDER_SOURCE.id, { database, now: () => 7000 })).completion
    expect(ok.status).toBe('completed')

    const synced = await getSource(PROVIDER_SOURCE.id, database)
    expect(synced?.account).toEqual({ status: 'active', expiresAt: EXP_SECONDS * 1000, checkedAt: 7000 })

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 401 }))))
    const refused = await (await startImport(PROVIDER_SOURCE.id, { database, now: () => 9000 })).completion
    expect(refused.errorKind).toBe('invalid_credentials')

    const after = await getSource(PROVIDER_SOURCE.id, database)
    expect(after?.account?.status).toBe('refused')
    expect(after?.account?.checkedAt).toBe(9000)
    // O catálogo já sincronizado continua publicado e a fonte continua "synced".
    expect(after?.connectionState).toBe('synced')
    expect(after?.activeGeneration).toBe(synced?.activeGeneration)
  })
})
