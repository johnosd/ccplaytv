import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from './db'
import { listChannels, storeCategories, storeCategoryItems, type CatalogCategory } from './catalogRepository'
import { ensureCategory } from './categoryLoader'
import { readCategoryWindow } from './categoryWindow'
import { PIN_WINDOW_MS, planStorageRelease, type ReleaseCandidate } from './storageBudget'
import { categoryStoredBytes } from './storageLedger'

/**
 * Feature 082 — contrato do formato comprimido em pedaços e do orçamento (`logic/formato-comprimido.md`,
 * `logic/orcamento.md`). Travado pelo sdd-plan: o sdd-execute só pode fazê-lo passar. Só interface pública: leitura
 * pela janela/lista, bytes gravados pela conta, resultado de `ensureCategory`.
 */

const candidate = (key: string, scope: ReleaseCandidate['scope'], bytes: number, lastUsedAt: number,
  extra: Partial<ReleaseCandidate> = {}): ReleaseCandidate =>
  ({ key, scope, bytes, lastUsedAt, refetchable: true, pinned: false, ...extra })

describe('planStorageRelease (puro)', () => {
  // FR-010/FR-011/FR-012 + US4-AC2: temporários → listas inativas (a menos usada primeiro) → categorias da ativa;
  // nunca o que está em uso nem o que não volta pela rede; para quando já cabe; a pré-carga nunca tira da lista ativa.
  it('libera na ordem do orçamento, pula o protegido e para quando cabe; pré-carga não toca a lista ativa', () => {
    const candidates = [
      candidate('cat:x', 'active-category', 50, 1),
      candidate('list:b', 'inactive-list', 100, 5),
      candidate('cat:y', 'active-category', 500, 0, { pinned: true }),
      candidate('tmp', 'temporary', 10, 9),
      candidate('cat:z', 'active-category', 500, 0, { refetchable: false }),
      candidate('list:c', 'inactive-list', 100, 2),
    ]
    const keys = (list: ReleaseCandidate[]) => list.map((item) => item.key)
    expect(keys(planStorageRelease({ capBytes: 1000, ledgerBytes: 1150 }, 50, candidates, 'entry')))
      .toEqual(['tmp', 'list:c', 'list:b'])
    expect(keys(planStorageRelease({ capBytes: 1000, ledgerBytes: 1250 }, 50, candidates, 'entry')))
      .toEqual(['tmp', 'list:c', 'list:b', 'cat:x'])
    expect(keys(planStorageRelease({ capBytes: 1000, ledgerBytes: 1250 }, 50, candidates, 'prefetch')))
      .toEqual(['tmp', 'list:c', 'list:b'])
  })

  // R-002 (medido na TV: `clear()` não devolve espaço na hora): com a conta própria dentro do teto, um uso informado
  // alto libera no máximo UM candidato por chamada — nunca apaga tudo em cascata.
  it('uso informado atrasado libera no máximo um candidato; dentro do teto e do limite, nada', () => {
    const candidates = [
      candidate('list:b', 'inactive-list', 100, 5),
      candidate('list:c', 'inactive-list', 100, 2),
      candidate('cat:x', 'active-category', 50, 1),
    ]
    expect(planStorageRelease({ capBytes: 1000, ledgerBytes: 400, reported: { usage: 990, limit: 1000 } }, 50, candidates, 'entry')
      .map((item) => item.key)).toEqual(['list:c'])
    expect(planStorageRelease({ capBytes: 1000, ledgerBytes: 400, reported: { usage: 500, limit: 1000 } }, 50, candidates, 'entry'))
      .toEqual([])
  })
})

const SOURCE_ID = 'fonte-082'
let database: CatalogDb

async function freshDatabase() {
  database = new CatalogDb(`test-082-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: SOURCE_ID, type: 'provider_credentials', displayName: 'Painel', providerDns: 'http://painel.fixture.test',
    providerUsername: 'usuario-fixture', providerPassword: 'senha-fixture', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1,
  })
}

// Itens parecidos com os reais (nome, capa com prefixo comum, ano, nota) — a compressão precisa de dado realista.
const movie = (index: number, category: string) => ({
  sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, groupOrder: 0,
  name: `Filme de teste ${category}-${index} (${1980 + (index % 45)})`, originalName: `Filme de teste ${category}-${index} (${1980 + (index % 45)})`,
  group: 'Ação', providerCategoryId: category, providerStreamId: `${category}${index}`, streamExtension: index % 3 ? 'mp4' : 'mkv',
  iconUrl: `https://img.fixture.test/t/p/w600_and_h900_bestv2/${(index * 7919).toString(36)}.jpg`, year: 1980 + (index % 45),
  addedAt: 1_600_000_000_000 + index * 1000, providerRating: (index % 100) / 10,
})

describe('formato comprimido em pedaços (integração, banco real)', () => {
  beforeEach(freshDatabase)
  afterEach(async () => { vi.restoreAllMocks(); await database.delete() })

  // US1-AC1/AC2 + FR-001/FR-002/FR-006: a categoria é gravada comprimida (bytes gravados bem menores que o JSON dos
  // itens), a lista lê tudo igual e na mesma ordem, e a janela lê o começo e o fim certos sem descomprimir o bloco todo.
  it('grava a categoria comprimida e lê igual pela lista e pela janela', async () => {
    const [categoryId] = await storeCategories([{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', order: 0,
      fetchMode: 'on_demand', providerCategoryId: '10', name: 'Ação' }], database)
    const items = Array.from({ length: 1_200 }, (_, index) => movie(index, '10'))
    await storeCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', groupOrder: 0, categoryId }, items, 100, database)

    const stored = await categoryStoredBytes(database, categoryId)
    expect(stored).toBeGreaterThan(0)
    expect(stored).toBeLessThan(JSON.stringify(items).length * 0.3)

    const all = await listChannels(SOURCE_ID, 0, 0, 1_200, 'movie', database)
    expect(all.map((item) => item.name)).toEqual(items.map((item) => item.name))
    const first = await readCategoryWindow(SOURCE_ID, categoryId, 0, 12, database)
    const last = await readCategoryWindow(SOURCE_ID, categoryId, 1_188, 12, database)
    expect(first.items.map((item) => item.id)).toEqual(all.slice(0, 12).map((item) => item.id))
    expect(last.items.map((item) => item.providerStreamId)).toEqual(items.slice(1_188).map((item) => item.providerStreamId))
    expect(first.total).toBe(1_200)
    expect(last.nextOffset).toBeUndefined()
  })
})

describe('ensureCategory com orçamento (integração, banco real)', () => {
  beforeEach(async () => {
    await freshDatabase()
    // 300 filmes por categoria, ids do provedor derivados da categoria pedida (`category_id` na URL).
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const categoryId = new URL(String(input)).searchParams.get('category_id') ?? '0'
      const movies = Array.from({ length: 300 }, (_, index) => ({
        stream_id: Number(categoryId) * 1000 + index, name: `Filme ${categoryId}-${index}`, category_id: categoryId,
        container_extension: 'mp4', stream_type: 'movie', stream_icon: `https://img.fixture.test/p/${categoryId}-${index}.jpg`,
      }))
      return new Response(JSON.stringify(movies), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
  })
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await database.delete() })

  async function twoCategories(): Promise<[CatalogCategory, CatalogCategory]> {
    const [a, b] = await storeCategories([
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '10', name: 'Ação', order: 0 },
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '20', name: 'Drama', order: 1 },
    ], database)
    return [
      { id: a, kind: 'movie', name: 'Ação', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '10' },
      { id: b, kind: 'movie', name: 'Drama', order: 1, count: 0, fetchMode: 'on_demand', providerCategoryId: '20' },
    ]
  }
  const ids = async (category: CatalogCategory) =>
    (await readCategoryWindow(SOURCE_ID, category.id, 0, 300, database)).items.map((item) => item.id)

  // US5-AC2 / FR-016 / FR-012: no teto, entrar numa categoria nova libera a da mesma lista usada há mais tempo, grava
  // a nova sem erro de armazenamento, e o estado da pessoa fica intacto.
  it('entrada no teto libera a categoria menos usada da lista ativa, grava a nova e mantém os favoritos', async () => {
    const [acao, drama] = await twoCategories()
    expect((await ensureCategory(SOURCE_ID, acao, { database, now: () => 1 })).outcome).toBe('fetched')
    const one = await categoryStoredBytes(database, acao.id)
    const budget = { capBytes: Math.floor(one * 1.5) }
    await database.userStates.put({ stableId: `${SOURCE_ID}|movie|10000`, sourceId: SOURCE_ID, isFavorite: true, favoritedAt: 2,
      createdAt: 2, updatedAt: 2 })

    const result = await ensureCategory(SOURCE_ID, drama, { database, now: () => 1 + PIN_WINDOW_MS + 1, budget })

    expect(result).toEqual({ outcome: 'fetched' })
    expect(await ids(drama)).toHaveLength(300)
    expect(await categoryStoredBytes(database, acao.id)).toBe(0)
    expect((await database.categories.get(acao.id))?.itemsFetchedAt).toBeUndefined()
    expect(await database.userStates.count()).toBe(1)
    expect(await database.categories.count()).toBe(2)
  })

  // Constitution "Voltar Restaura Foco e Posição" / "Identidade de Reprodução Não Depende da URL": uma categoria
  // liberada e obtida de novo devolve os MESMOS ids locais, para foco e retomada reconciliarem pelo id.
  it('categoria liberada e obtida de novo mantém os mesmos ids dos itens', async () => {
    const [acao, drama] = await twoCategories()
    await ensureCategory(SOURCE_ID, acao, { database, now: () => 1 })
    const before = await ids(acao)
    const budget = { capBytes: Math.floor((await categoryStoredBytes(database, acao.id)) * 1.5) }

    const t2 = 1 + PIN_WINDOW_MS + 1
    await ensureCategory(SOURCE_ID, drama, { database, now: () => t2, budget })
    const t3 = t2 + PIN_WINDOW_MS + 1
    expect((await ensureCategory(SOURCE_ID, acao, { database, now: () => t3, budget })).outcome).toBe('fetched')

    expect(await categoryStoredBytes(database, drama.id)).toBe(0)
    expect(await ids(acao)).toEqual(before)
  })
})
