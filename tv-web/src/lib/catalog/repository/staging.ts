/** Área de preparo da carga por seção (feature 039). Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogRecord } from '../db'
import { KEY_MAX, KEY_MIN, StorageFullError, isQuotaError } from './shared'

/** Faixa do preparo de uma fonte (ou de uma categoria dela) — sem `Dexie.minKey` em chave composta (R-008). */
function stagingOf(database: CatalogDb, sourceId: string, categoryId?: number) {
  return categoryId === undefined
    ? database.sectionStaging.where('[sourceId+categoryId]').between([sourceId, KEY_MIN], [sourceId, KEY_MAX], true, true)
    : database.sectionStaging.where('[sourceId+categoryId]').equals([sourceId, categoryId])
}

/**
 * Descarrega partes da carga por seção na área de preparo (feature 039, T031,
 * FR-013) — o Worker não segura a seção inteira até o fluxo acabar.
 */
export async function stageSectionItems(
  parts: Array<{ sourceId: string; categoryId: number; items: CatalogRecord[] }>,
  database: CatalogDb = db,
): Promise<void> {
  if (parts.length === 0) return
  try {
    await database.sectionStaging.bulkAdd(parts)
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/** Os itens preparados de uma categoria, na ordem em que foram descarregados (a da fonte). */
export async function stagedItemsOf(sourceId: string, categoryId: number, database: CatalogDb = db): Promise<CatalogRecord[]> {
  const parts = await stagingOf(database, sourceId, categoryId).toArray()
  parts.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  return parts.flatMap((part) => part.items)
}

/** Apaga o preparo de uma categoria, ou de toda a fonte (sobra de uma carga interrompida). */
export async function clearStagedItems(sourceId: string, categoryId?: number, database: CatalogDb = db): Promise<void> {
  await stagingOf(database, sourceId, categoryId).delete()
}

/**
 * Apaga o preparo que sobrou de OUTRAS fontes (carga interrompida pelo app
 * fechado, e a pessoa trocou de lista): só a fonte ativa carrega seções, então
 * a sobra de outra nunca seria limpa pela próxima carga dela. Lê só as chaves.
 *
 * @returns `true` se apagou algo.
 */
export async function clearStagedItemsOfOtherSources(sourceId: string | undefined, database: CatalogDb = db): Promise<boolean> {
  const keys = (await database.sectionStaging.orderBy('[sourceId+categoryId]').uniqueKeys()) as unknown as Array<[string, number]>
  const others = new Set(keys.map(([owner]) => owner).filter((owner) => owner !== sourceId))
  for (const owner of others) await clearStagedItems(owner, undefined, database)
  return others.size > 0
}
