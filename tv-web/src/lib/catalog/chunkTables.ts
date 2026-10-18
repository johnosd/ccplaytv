/**
 * Tabelas da feature 082 (Dexie v26, `dbSchema.ts`) com acesso tipado — formato comprimido em pedaços
 * (`sdd/specs/082-orcamento-armazenamento-tv/data-model.md`). Ficam fora da classe `CatalogDb` porque `db.ts` está no
 * teto de linhas da catraca (mesmo motivo de `parentalTables.ts`).
 */

import type { Table } from 'dexie'
import type { CatalogDb } from './db'

/** Pedaço dos itens de uma categoria: `chunk` 0..n-1 são itens; `IDENTITY_CHUNK` é o índice de identidade. */
export interface CategoryChunkRecord {
  categoryId: number
  sourceId: string
  generation: number
  chunk: number
  /** Posição do primeiro item do pedaço na categoria (0 no índice de identidade). */
  start: number
  count: number
  /** gzip do JSON enxuto. */
  bytes: Uint8Array
}

/** Programas de um canal do guia na janela, comprimidos. */
export interface EpgChunkRecord {
  sourceId: string
  generation: number
  channelKey: string
  /** Início do primeiro e fim do último programa (ms). */
  from: number
  to: number
  count: number
  bytes: Uint8Array
}

/** Chave do pedaço com o índice de identidade (ids, chaves e carimbos de episódios, na ordem da fonte). */
export const IDENTITY_CHUNK = -1

export function categoryChunks(database: CatalogDb): Table<CategoryChunkRecord, [number, number]> {
  return database.table('categoryChunks')
}

export function epgChunks(database: CatalogDb): Table<EpgChunkRecord, [string, number, string]> {
  return database.table('epgChunks')
}
