/**
 * Feature 086, FR-010 e FR-011 (task T076): quando o orçamento de armazenamento libera os itens de uma categoria, as
 * fileiras calculadas param de mostrá-los.
 *
 * Por que este teste existe: a convergência levantou a suspeita de que os candidatos sobreviveriam à liberação e a
 * fileira mostraria card de item que já não abre. A garantia real está em `deleteCategoryItems`, que apaga os
 * candidatos **na mesma transação** que apaga o bloco — este teste trava esse acoplamento, que de outro modo é
 * invisível (nada no nome de `deleteCategoryItems` sugere que ele mexe nas fileiras).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { storeCategories, storeCategoryItems } from './catalogRepository'
import { deleteCategoryItems } from './blockChunks'
import { pickCandidates, readCandidates, writeCandidates } from './showcaseCandidates'
import { buildShowcaseRowsFromCandidates } from './showcaseRows'

const SOURCE = 'fonte-086-orcamento'
const NOW = Date.UTC(2026, 9, 20, 12)

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`liberacao-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  await database.delete()
})

/** Duas categorias de 20 filmes, com nome distinguível por categoria. */
async function seed(): Promise<number[]> {
  const ids = await storeCategories(
    [0, 1].map((index) => ({
      sourceId: SOURCE, generation: 1, kind: 'movie' as const, fetchMode: 'on_demand' as const,
      order: index, providerCategoryId: String(100 + index), name: `Cat ${index}`,
    })),
    database,
  )
  for (let index = 0; index < ids.length; index += 1) {
    const items: CatalogRecord[] = Array.from({ length: 20 }, (_, position) => ({
      sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: index,
      name: `Cat${index} Filme ${position}`, originalName: `Cat${index} Filme ${position}`,
      providerStreamId: `${index}-${position}`,
      // Datas intercaladas entre as duas categorias: as duas precisam contribuir para os 12 mais novos do tipo,
      // senão o teste não distingue "saiu porque foi liberada" de "nunca esteve entre as mais novas".
      addedAt: NOW - (position * 2 + index) * 3_600_000,
      providerRating: 7 + (position % 20) / 10,
      year: 2020 + (position % 5),
    }))
    await storeCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: ids[index], groupOrder: index },
      items, NOW, database)
    const stored = await database.categories.get(ids[index])
    await writeCandidates(
      pickCandidates({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: ids[index], groupOrder: index,
        order: stored?.order ?? index }, items, NOW),
      database,
    )
  }
  return ids
}

describe('fileiras calculadas e a liberação pelo orçamento (086)', () => {
  it('para de mostrar os itens de uma categoria que o orçamento liberou', async () => {
    const ids = await seed()

    const antes = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })
    expect(antes.recent.some((item) => item.name.startsWith('Cat0'))).toBe(true)
    expect(antes.recent.some((item) => item.name.startsWith('Cat1'))).toBe(true)
    expect(antes.coveredCategories).toBe(2)

    // O orçamento libera a primeira categoria (feature 082): o bloco sai e a categoria volta a "nunca obtida".
    await deleteCategoryItems(database, ids[0])

    // FR-011: os candidatos da categoria liberada saíram junto — não ficou seleção órfã no aparelho.
    const restantes = await readCandidates(SOURCE, 'movie', database)
    expect(restantes.map((row) => row.categoryId)).toEqual([ids[1]])

    // FR-010: nenhuma fileira mostra item que não está mais no aparelho.
    const depois = await buildShowcaseRowsFromCandidates(SOURCE, 'movie', { database, now: NOW })
    expect(depois.recent.some((item) => item.name.startsWith('Cat0'))).toBe(false)
    expect(depois.rated.some((item) => item.name.startsWith('Cat0'))).toBe(false)
    // A categoria que sobrou continua inteira.
    expect(depois.recent.some((item) => item.name.startsWith('Cat1'))).toBe(true)

    // FR-006: a cobertura parcial continua honesta — a categoria liberada volta a contar como não obtida, sem sair do total.
    expect(depois.coveredCategories).toBe(1)
    expect(depois.totalCategories).toBe(2)
  })
})
