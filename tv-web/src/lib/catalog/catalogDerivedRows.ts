import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord } from './db'
import { blockRecords } from './categoryBlocks'
import { readKindPage } from './catalogRepository'

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

/** Itera o tipo ativo por categoria/bloco, sem materializar `listAllOfKind`. */
export async function* iterateKindRecords(
  sourceId: string,
  kind: CatalogItemKind,
  options: KindIteratorOptions = {},
): AsyncGenerator<CatalogRecord> {
  const database = options.database ?? db
  const signal = options.signal
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? 240))
  let cursor = 0
  while (true) {
    throwIfAborted(signal)
    const page = await readKindPage(sourceId, kind, cursor, pageSize, database)
    for (const chunk of page.chunks) {
      throwIfAborted(signal)
      const records = 'block' in chunk ? blockRecords(chunk.block) : chunk.rows
      for (const record of records) {
        throwIfAborted(signal)
        yield record
      }
    }
    if (page.next === undefined) return
    cursor = page.next
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
