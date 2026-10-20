import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord, type CategoryBlockRecord } from './db'
import { blockRecords } from './categoryBlocks'
import { getCategoryAccess } from './categoryAccess'
import { readHeaderChunks } from './blockChunks'

/** Campos suficientes para vitrines e cruzamentos; URLs/credenciais ficam no canônico. */
export interface CatalogDerivedRow {
  id: string
  sourceId: string
  kind: CatalogItemKind
  title: string
  originalTitle: string
  year?: number
  addedAt?: number
  providerRating?: number
  hasPlayback: boolean
  categoryId?: number
  categoryPosition?: number
}

export interface KindIteratorOptions {
  pageSize?: number
  signal?: AbortSignal
  database?: CatalogDb
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error('catalog:cancelled')
    error.name = 'AbortError'
    throw error
  }
}

const KEY_MIN = -1
const KEY_MAX = Number.MAX_SAFE_INTEGER

/**
 * Pedaços do tipo ativo na ordem de `readKindPage`/`listAllOfKind` (feature 065, D-005): geração e categorias lidas uma vez,
 * blocos buscados em lotes de `batch`, linhas do formato antigo pela mesma consulta de índice — nunca o tipo inteiro de uma vez.
 */
async function* iterateKindChunks(
  sourceId: string,
  kind: CatalogItemKind,
  batch: number,
  database: CatalogDb,
): AsyncGenerator<{ block: CategoryBlockRecord } | { rows: CatalogRecord[] }> {
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined || kind === 'episode') return
  const access = await getCategoryAccess(sourceId, database)
  // Feature 066: categorias escondidas/bloqueadas nem são lidas (fileiras, Início, vitrines).
  const categories = (
    await database.categories
      .where('[sourceId+generation+kind+order]')
      .between([sourceId, generation, kind, KEY_MIN], [sourceId, generation, kind, KEY_MAX], true, true)
      .toArray()
  ).filter((category) => !access.excluded.has(category.id as number))
  for (let start = 0; start < categories.length; start += batch) {
    const group = categories.slice(start, start + batch)
    const blocks = await database.categoryBlocks.bulkGet(group.map((category) => category.id as number))
    for (let index = 0; index < group.length; index += 1) {
      const block = blocks[index]
      if (block && block.sourceId === sourceId && block.generation === generation) {
        if (block.format === 2) {
          const rows = await readHeaderChunks(database, block)
          if (rows.length > 0) yield { rows }
        } else if ((block.items ?? []).length > 0) yield { block }
        continue
      }
      const order = group[index].order
      const rows = await database.channels
        .where('[sourceId+generation+kind+groupOrder]')
        .between([sourceId, generation, kind, order], [sourceId, generation, kind, order], true, true)
        .toArray()
      if (rows.length > 0) yield { rows }
    }
  }
}

/** Registros do tipo ativo bloco a bloco (um lote por categoria), sem materializar `listAllOfKind`. */
export async function* iterateKindRecordBatches(
  sourceId: string,
  kind: CatalogItemKind,
  options: KindIteratorOptions = {},
): AsyncGenerator<CatalogRecord[]> {
  const signal = options.signal
  throwIfAborted(signal)
  // `pageSize` (itens) vira um lote de blocos: categorias têm em média algumas centenas de itens.
  const batch = Math.max(1, Math.ceil(Math.max(1, Math.floor(options.pageSize ?? 240)) / 240))
  for await (const chunk of iterateKindChunks(sourceId, kind, batch, options.database ?? db)) {
    throwIfAborted(signal)
    yield 'block' in chunk ? blockRecords(chunk.block) : chunk.rows
  }
  throwIfAborted(signal)
}

/** Itera o tipo ativo registro a registro (mesma ordem de `iterateKindRecordBatches`). */
export async function* iterateKindRecords(
  sourceId: string,
  kind: CatalogItemKind,
  options: KindIteratorOptions = {},
): AsyncGenerator<CatalogRecord> {
  for await (const records of iterateKindRecordBatches(sourceId, kind, options)) {
    for (const record of records) {
      throwIfAborted(options.signal)
      yield record
    }
  }
}

export function toCatalogDerivedRow(record: CatalogRecord): CatalogDerivedRow {
  return {
    id: String(record.id ?? `${record.sourceId}:${record.groupOrder}:${record.categoryPosition ?? 0}`),
    sourceId: record.sourceId,
    kind: record.kind,
    title: record.name,
    originalTitle: record.originalName,
    year: record.year,
    addedAt: record.addedAt,
    providerRating: record.providerRating,
    hasPlayback: record.directUrl !== undefined || record.providerStreamId !== undefined,
    categoryId: record.categoryId,
    categoryPosition: record.categoryPosition,
  }
}

/** Variante compacta para cruzamentos; não retém o registro canônico após o yield. */
export async function* iterateKindDerivedRows(
  sourceId: string,
  kind: CatalogItemKind,
  options: KindIteratorOptions = {},
): AsyncGenerator<CatalogDerivedRow> {
  for await (const record of iterateKindRecords(sourceId, kind, options)) yield toCatalogDerivedRow(record)
}
