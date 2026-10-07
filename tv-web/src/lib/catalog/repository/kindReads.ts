/** Leituras por tipo: todos de um tipo, "Todos" aos poucos e campos de ordenaÃ§Ã£o. Parte da divisÃ£o de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord, type CategoryBlockRecord } from '../db'
import { blockRecords, blocksOfKind } from '../categoryBlocks'
import { FavoritesScanComplete, KEY_MAX, KEY_MIN, activeGenerationOf, query } from './shared'

/**
 * Todos os registros de um tipo na geração ativa, sem paginação — só para a
 * busca local (feature 017), que lê uma vez e filtra em memória (D-002 do
 * `plan.md` da 017). Nunca use isto para uma tela renderizar direto: sem
 * paginação, é exatamente o que `listChannels` existe para evitar.
 */
export async function listAllOfKind(
  sourceId: string,
  kind: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  // Feature 039 (`logic/blocos-e-identidade.md` §5): blocos do tipo + linhas
  // das categorias ainda no formato antigo. Uma categoria é ou uma ou outra,
  // então juntar não duplica. Ordem: `groupOrder` (a da leitura por índice de
  // antes), e dentro da categoria a da fonte — `sort` é estável.
  const blocks = await blocksOfKind(database, sourceId, generation, kind).toArray()
  const rows = await query(database, sourceId, generation, undefined, kind).toArray()
  if (blocks.length === 0) return rows
  blocks.sort((a, b) => a.groupOrder - b.groupOrder)
  const records = blocks.flatMap(blockRecords)
  if (rows.length === 0) return records
  return [...records, ...rows].sort((a, b) => a.groupOrder - b.groupOrder)
}

/** Um pedaço de uma página de "Todos": o bloco de uma categoria, ou as linhas dela (formato antigo). */
export type KindPageChunk = { block: CategoryBlockRecord } | { rows: CatalogRecord[] }

export interface KindPage {
  chunks: KindPageChunk[]
  /** Cursor da próxima página; `undefined` = acabou. */
  next: number | undefined
}

/**
 * "Todos" aos poucos (feature 039, T022): a partir da categoria `cursor` (na
 * ordem de `order`, a mesma de `listAllOfKind`), lê categoria por categoria —
 * bloco, ou as linhas se ainda no formato antigo — até juntar `minItems`
 * itens. Uma categoria nunca é partida. Concatenar todas as páginas dá a mesma
 * sequência de `listAllOfKind`, sem nunca ter o tipo inteiro na memória.
 */
export async function readKindPage(
  sourceId: string,
  kind: CatalogItemKind,
  cursor: number,
  minItems: number,
  database: CatalogDb = db,
): Promise<KindPage> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined || kind === 'episode') return { chunks: [], next: undefined }
  const categories = await database.categories
    .where('[sourceId+generation+kind+order]')
    .between([sourceId, generation, kind, KEY_MIN], [sourceId, generation, kind, KEY_MAX], true, true)
    .toArray()
  const chunks: KindPageChunk[] = []
  let count = 0
  let index = cursor
  while (index < categories.length && count < minItems) {
    const category = categories[index]
    index += 1
    const block = await database.categoryBlocks.get(category.id as number)
    if (block && block.sourceId === sourceId && block.generation === generation) {
      if (block.items.length > 0) chunks.push({ block })
      count += block.items.length
      continue
    }
    const rows = await query(database, sourceId, generation, category.order, kind).toArray()
    if (rows.length > 0) chunks.push({ rows })
    count += rows.length
  }
  return { chunks, next: index < categories.length ? index : undefined }
}

/**
 * Se algum item do tipo declara ano / data de inclusão (feature 039, T033) —
 * decide as opções "Ano"/"Recém-adicionados" de "Ordenar" em "Todos" aos
 * poucos, que só tem parte do tipo na memória. Lê um bloco por vez (FR-013)
 * e para assim que achar os dois; depois, as linhas do formato antigo.
 */
export async function kindSortFields(
  sourceId: string,
  kind: CatalogItemKind,
  database: CatalogDb = db,
): Promise<{ year: boolean; addedAt: boolean }> {
  const found = { year: false, addedAt: false }
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined || kind === 'episode') return found
  const take = (item: { year?: number; addedAt?: number }) => {
    if (item.year != null) found.year = true
    if (item.addedAt != null) found.addedAt = true
  }
  try {
    await blocksOfKind(database, sourceId, generation, kind).each((block) => {
      for (const item of block.items) take(item)
      if (found.year && found.addedAt) throw new FavoritesScanComplete()
    })
    await query(database, sourceId, generation, undefined, kind).each((record) => {
      take(record)
      if (found.year && found.addedAt) throw new FavoritesScanComplete()
    })
  } catch (error) {
    if (!(error instanceof FavoritesScanComplete)) throw error
  }
  return found
}
