/**
 * Conta própria do armazenamento (feature 082, `logic/orcamento.md` §2). Com o formato comprimido em pedaços
 * (`logic/formato-comprimido.md`), cada gravação conhece os bytes que gravou: a conta soma esses bytes, em vez de
 * estimar por item. O `navigator.storage.estimate()` da TV não cai depois de apagar registros (medido: `clear()` não
 * devolve espaço), então decidir só por ele seria errado.
 *
 * STUB do sdd-plan: o sdd-execute implementa.
 */
import type { CatalogDb } from './db'

export const LEGACY_ITEM_BYTES = 320
export const LEGACY_EPG_ROW_BYTES = 700
export const METADATA_BYTES = 512

/** Bytes gravados hoje para os itens de uma categoria (pedaços comprimidos + cabeçalho). 0 = nada no aparelho. */
export async function categoryStoredBytes(database: CatalogDb, categoryId: number): Promise<number> {
  const category = await database.categories.get(categoryId)
  if (!category) return 0
  if (category.storedBytes !== undefined) return category.storedBytes
  if (!category.itemsCount) return 0
  const projectionItems = await database.catalogReadChunks.where('categoryId').equals(categoryId).count()
  return category.itemsCount * LEGACY_ITEM_BYTES + projectionItems * LEGACY_ITEM_BYTES
}

/** Conta do catálogo + guia, por lista e total (só leituras baratas: campos gravados e índices). */
export async function catalogLedger(database: CatalogDb): Promise<{ total: number; bySource: Record<string, number> }> {
  const bySource: Record<string, number> = {}
  const categories = await database.categories.toArray()
  for (const category of categories) bySource[category.sourceId] = (bySource[category.sourceId] ?? 0) + await categoryStoredBytes(database, category.id as number)
  const sources = await database.sources.toArray()
  for (const source of sources) bySource[source.id] = (bySource[source.id] ?? 0) + (source.epgStoredBytes ?? 0)
  const epgRows = await database.epgPrograms.toArray()
  for (const row of epgRows) bySource[row.sourceId] = (bySource[row.sourceId] ?? 0) + LEGACY_EPG_ROW_BYTES
  const total = Object.values(bySource).reduce((sum, value) => sum + value, 0)
  return { total, bySource }
}
