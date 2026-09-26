/**
 * Teste de paridade M3U (SC-005) — `sdd/specs/014-m3u-sob-demanda/tasks.md`.
 *
 * T002 (Setup) rodou o caminho integral **de antes desta feature** sobre
 * as fixtures de `m3uParity.fixtures.ts` e gravou o resultado como
 * expectativa fixa (`EXPECTED_AVULSA`/`EXPECTED_LEGACY`) — essa expectativa
 * não muda. T031 (US3) atualizou este arquivo para exercer o caminho
 * **novo** (`scanToStored` + `ensureCategory`) sobre as mesmas fixtures e
 * comparar contra a mesma expectativa, sem duplicar dado. Cobre também o
 * que só o caminho novo tem: nenhum item gravado até a conclusão da
 * importação (FR-007), e o conteúdo só chega a `channels` quando cada
 * categoria é lida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from './db'
import { listCategories } from './catalogRepository'
import { startImport } from './importPipeline'
import { ensureCategory } from './categoryLoader'
import { getSource } from './sourceRepository'
import {
  EXPECTED_AVULSA,
  EXPECTED_AVULSA_TALLY,
  EXPECTED_LEGACY,
  EXPECTED_LEGACY_TALLY,
  M3U_AVULSA_FIXTURE,
  M3U_LEGACY_FIXTURE,
  normalizeCategories,
  normalizeItems,
} from './m3uParity.fixtures'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-parity-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status })
}

/** Lê todas as categorias da fonte pelo caminho normal de tela (`ensureCategory`), uma de cada vez. */
async function readAllCategories(sourceId: string): Promise<void> {
  const categories = await listCategories(sourceId, undefined, database)
  for (const category of categories) {
    const result = await ensureCategory(sourceId, category, { database })
    expect(result.outcome).toBe('fetched')
  }
}

describe('paridade M3U — caminho do conteúdo guardado (SC-005)', () => {
  it('URL M3U avulsa: importação não grava item nenhum; lendo as categorias, bate a expectativa gravada pela T002', async () => {
    const source: SourceRecord = {
      id: 'fonte-avulsa',
      type: 'm3u_url',
      displayName: 'Lista Avulsa',
      m3uUrl: 'http://exemplo.test/lista.m3u',
      connectionState: 'never_synced',
      createdAt: 1,
      updatedAt: 1,
    }
    await database.sources.add(source)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(textResponse(M3U_AVULSA_FIXTURE)))

    const run = await (await startImport(source.id, { database })).completion

    expect(run.status).toBe('completed')
    expect({
      entriesRead: run.entriesRead,
      discardedByType: run.discardedByType,
      channelsStored: run.channelsStored,
    }).toEqual(EXPECTED_AVULSA_TALLY)

    // FR-007: a importação conclui sem gravar nenhum item no catálogo.
    expect(await database.channels.where('sourceId').equals(source.id).count()).toBe(0)
    const categoriesRightAfterImport = await listCategories(source.id, undefined, database)
    for (const category of categoriesRightAfterImport) {
      expect(category.fetchMode).toBe('stored')
      expect(category.itemsFetchedAt).toBeUndefined()
    }

    await readAllCategories(source.id)

    const categories = await listCategories(source.id, undefined, database)
    const items = await database.channels.where('sourceId').equals(source.id).toArray()

    expect(normalizeCategories(categories)).toEqual(EXPECTED_AVULSA.categories)
    expect(normalizeItems(items, categories)).toEqual(EXPECTED_AVULSA.items)
  })

  it('Modo limitado (provedor sem protocolo JSON): importação não grava item nenhum; lendo as categorias, bate a expectativa gravada pela T002', async () => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/get.php')) return Promise.resolve(textResponse(M3U_LEGACY_FIXTURE))
        // O painel autentica, mas não responde a nenhuma consulta de catálogo
        // pelo protocolo JSON — é o que empurra para o caminho M3U legado.
        if (url.includes('player_api.php') && url.includes('action='))
          return Promise.resolve(textResponse('erro', 404))
        return Promise.resolve(
          textResponse(JSON.stringify({ user_info: { auth: 1, allowed_output_formats: ['ts'] } })),
        )
      }),
    )

    const run = await (await startImport(source.id, { database })).completion

    expect(run.status).toBe('completed')
    expect((await getSource(source.id, database))?.providerImportMode).toBe('legacy_m3u')
    expect({
      entriesRead: run.entriesRead,
      discardedByType: run.discardedByType,
      channelsStored: run.channelsStored,
    }).toEqual(EXPECTED_LEGACY_TALLY)

    expect(await database.channels.where('sourceId').equals(source.id).count()).toBe(0)

    await readAllCategories(source.id)

    const categories = await listCategories(source.id, undefined, database)
    const items = await database.channels.where('sourceId').equals(source.id).toArray()

    expect(normalizeCategories(categories)).toEqual(EXPECTED_LEGACY.categories)
    expect(normalizeItems(items, categories)).toEqual(EXPECTED_LEGACY.items)
  })
})
