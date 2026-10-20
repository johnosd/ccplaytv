import { db, type CatalogDb, type CatalogRecord } from '../../lib/catalog/db'
import { loadSearchIndex, warmNormalizedName, type SearchableKind } from '../../lib/catalog/catalogSearch'
import { createSliceClock, forEachInSlices, mapInSlices, type SliceOptions } from '../../lib/slices'

/** Itens de "Todos" de um tipo, já convertidos para o formato das telas, mais a cobertura das categorias. */
export interface AggregatedLoad<T> {
  items: T[]
  coveredCategories: number
  totalCategories: number
}

/** Valor estável enquanto o índice ainda não chegou (não recria um array a cada render). */
export const NO_AGGREGATED_ITEMS: never[] = []

/**
 * "Todos" de um tipo (feature 084): o índice de busca em fatias, a conversão `toItem` em fatias (43 mil objetos numa
 * tarefa só travavam a tela) e o nome normalizado dos itens aquecido — a busca dentro de "Todos" filtra os itens, não os
 * registros. `toItem` vem de fora (`toItemOut` mora em `catalogApi.ts`; importá-lo aqui criaria um ciclo).
 */
export async function loadAggregatedItems<T extends { name: string }>(
  sourceId: string,
  kind: SearchableKind,
  toItem: (record: CatalogRecord) => T,
  options: SliceOptions & { database?: CatalogDb } = {},
): Promise<AggregatedLoad<T>> {
  const { database = db, ...slice } = options
  const index = await loadSearchIndex(sourceId, kind, database, slice)
  const clock = createSliceClock(slice)
  const items = await mapInSlices(index.entries, (entry) => toItem(entry.record), clock)
  await forEachInSlices(items, (item) => void warmNormalizedName(item, (candidate) => candidate.name), clock)
  return { items, coveredCategories: index.coveredCategories, totalCategories: index.totalCategories }
}
