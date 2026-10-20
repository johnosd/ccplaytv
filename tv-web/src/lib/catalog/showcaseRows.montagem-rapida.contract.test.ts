// Contratos da feature 086 — travados pelo sdd-plan; o sdd-execute só pode fazê-los passar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { storeCategories, storeCategoryItems } from './catalogRepository'
import { setCategoryPreference } from './categoryAccess'
import { pickCandidates, writeCandidates } from './showcaseCandidates'
import { buildShowcaseRowsFromCandidates, readExternalRow } from './showcaseRows'
import { selectShowcaseRowsByScan } from './showcaseSelection'

const SOURCE = 'fonte-086'
const NOW = Date.UTC(2026, 9, 20, 12)
const YEAR = 2026

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`showcase-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

/** Catálogo sintético com variedade real: datas, notas e anos espalhados, nomes repetidos entre categorias (dedupe). */
async function seed(categories: number, perCategory: number): Promise<number[]> {
  const ids = await storeCategories(
    Array.from({ length: categories }, (_, index) => ({
      sourceId: SOURCE, generation: 1, kind: 'movie' as const, fetchMode: 'on_demand' as const,
      order: index, providerCategoryId: String(100 + index), name: `Cat ${index}`,
    })),
    database,
  )
  for (let index = 0; index < ids.length; index += 1) {
    const items: CatalogRecord[] = Array.from({ length: perCategory }, (_, position) => {
      const serial = index * perCategory + position
      // Nome repetido a cada 7 itens entre categorias: força o dedupe por título de "Bem avaliados".
      const name = serial % 7 === 0 ? `Repetido ${serial % 21}` : `Filme ${serial}`
      return {
        sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: index, name, originalName: name,
        providerStreamId: String(serial),
        addedAt: serial % 11 === 0 ? undefined : NOW - serial * 3_600_000,
        providerRating: serial % 13 === 0 ? undefined : 6 + ((serial * 7) % 39) / 10,
        year: serial % 17 === 0 ? undefined : YEAR - ((serial * 3) % 14),
      }
    })
    await storeCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: index, categoryId: ids[index] },
      items, NOW, database)
    const block = await database.categoryBlocks.get(ids[index])
    await writeCandidates(
      pickCandidates({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: ids[index], groupOrder: index, order: index },
        block?.items ?? items, NOW),
      database,
    )
  }
  return ids
}

describe('fileiras calculadas a partir dos candidatos guardados (086)', () => {
  // FR-004 / US1/AC1: o conteúdo tem de ser IDÊNTICO ao da varredura do tipo inteiro — mesmos itens, ordem e quantidade.
  it('a montagem por candidatos devolve exatamente o mesmo que a varredura completa', async () => {
    await seed(9, 40)

    const byCandidates = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })
    const byScan = await selectShowcaseRowsByScan(SOURCE, 'movie', { database, now: NOW })

    expect(byCandidates.recent.map((item) => item.name)).toEqual(byScan.recent.map((item) => item.name))
    expect(byCandidates.rated.map((item) => item.name)).toEqual(byScan.rated.map((item) => item.name))
    expect(byCandidates.recent.length).toBeGreaterThan(0)
    expect(byCandidates.rated.length).toBeGreaterThan(0)
    expect([byCandidates.coveredCategories, byCandidates.totalCategories])
      .toEqual([byScan.coveredCategories, byScan.totalCategories])
  })

  // FR-005 / Constitution: categorias escondidas e travadas (feature 066) nunca vazam para fileira nenhuma.
  it('item de categoria escondida ou travada por PIN nunca aparece, e o filtro vale sem recalcular candidatos', async () => {
    const ids = await seed(6, 30)
    const antes = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })
    const visiveisAntes = antes.totalCategories

    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', name: 'Cat 0' }, { hidden: true }, database)
    await setCategoryPreference({ sourceId: SOURCE, kind: 'movie', name: 'Cat 1' }, { locked: true }, database)
    // Nenhum recálculo de candidatos entre as duas montagens: o filtro acontece na leitura.
    const depois = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })

    expect(depois.totalCategories).toBe(visiveisAntes - 2)
    for (const item of [...depois.recent, ...depois.rated]) {
      expect([ids[0], ids[1]]).not.toContain(item.categoryId)
    }
    const porVarredura = await selectShowcaseRowsByScan(SOURCE, 'movie', { database, now: NOW })
    expect(depois.recent.map((item) => item.name)).toEqual(porVarredura.recent.map((item) => item.name))
  })

  // FR-002 / FR-015: a abertura não lê blocos do catálogo e não retém o tipo; a fileira externa não dispara rede.
  it('montar as fileiras não lê nenhum bloco do catálogo nem toca a rede', async () => {
    await seed(6, 30)
    const blocks = vi.spyOn(database.categoryBlocks, 'bulkGet')
    const oneBlock = vi.spyOn(database.categoryBlocks, 'get')
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    const rows = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })
    const external = await readExternalRow(SOURCE, 'movie', 'top10', database)

    expect(rows.recent.length).toBeGreaterThan(0)
    expect(blocks).not.toHaveBeenCalled()
    expect(oneBlock).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(external).toBeUndefined()
    vi.unstubAllGlobals()
  })

  // FR-008 / US1/AC3: gravar uma categoria durante a sessão muda a fileira na leitura seguinte, sem passo extra.
  it('uma categoria gravada depois entra nas fileiras na montagem seguinte', async () => {
    const ids = await seed(4, 20)
    const antes = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })
    expect(antes.recent.map((item) => item.name)).not.toContain('Novidade')

    const novos: CatalogRecord[] = [{
      sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: 0, name: 'Novidade', originalName: 'Novidade',
      providerStreamId: 'novo-1', addedAt: NOW + 86_400_000, providerRating: 9.1, year: YEAR,
    }]
    await storeCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: 0, categoryId: ids[0] },
      novos, NOW, database)
    const block = await database.categoryBlocks.get(ids[0])
    await writeCandidates(
      pickCandidates({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: ids[0], groupOrder: 0, order: 0 },
        block?.items ?? novos, NOW),
      database,
    )

    const depois = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })
    expect(depois.recent[0]?.name).toBe('Novidade')
  })
})
