/** Leituras por tipo: todos de um tipo, "Todos" aos poucos e campos de ordenação. Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord, type CategoryBlockRecord } from '../db'
import { blockRecords, blocksOfKind } from '../categoryBlocks'
import { FavoritesScanComplete, KEY_MAX, KEY_MIN, activeGenerationOf, query } from './shared'
import { categoryWindowInfo, readCategoryWindow } from './categoryWindow'
import { getCategoryAccess } from '../categoryAccess'
import { iterateHeaderChunks, readHeaderChunks } from '../blockChunks'
import { stableSortInSlices, type SliceClock } from '../../slices'

/** Categorias do tipo na geração ativa, na ordem de `order`, sem as escondidas/bloqueadas (feature 066). */
async function visibleCategoriesOfKind(database: CatalogDb, sourceId: string, generation: number, kind: CatalogItemKind) {
  const [categories, access] = await Promise.all([
    database.categories
      .where('[sourceId+generation+kind+order]')
      .between([sourceId, generation, kind, KEY_MIN], [sourceId, generation, kind, KEY_MAX], true, true)
      .toArray(),
    getCategoryAccess(sourceId, database),
  ])
  return categories.filter((category) => !access.excluded.has(category.id as number))
}

/**
 * Todos os registros de um tipo na geração ativa, sem paginação — só para a
 * busca local (feature 017), que lê uma vez e filtra em memória (D-002 do
 * `plan.md` da 017). Nunca use isto para uma tela renderizar direto: sem
 * paginação, é exatamente o que `listChannels` existe para evitar.
 *
 * Feature 084: com `clock`, o resultado é o mesmo, mas lê um bloco por vez (não `Promise.all`, que junta tudo numa leva
 * só), cede a vez à interface a cada bloco e se deixa cancelar pelo sinal do relógio.
 */
export async function listAllOfKind(
  sourceId: string,
  kind: CatalogItemKind,
  database: CatalogDb = db,
  clock?: SliceClock,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  // Feature 039 (`logic/blocos-e-identidade.md` §5): blocos do tipo + linhas
  // das categorias ainda no formato antigo. Uma categoria é ou uma ou outra,
  // então juntar não duplica. Ordem: `groupOrder` (a da leitura por índice de
  // antes), e dentro da categoria a da fonte — `sort` é estável.
  // Feature 066 (D-003): escondidas e bloqueadas ficam de fora — filtro na leitura, nada memorizado.
  const access = await getCategoryAccess(sourceId, database)
  const blocks = (await blocksOfKind(database, sourceId, generation, kind).toArray()).filter((block) => !access.excluded.has(block.categoryId))
  const rows = (await query(database, sourceId, generation, undefined, kind).toArray()).filter((row) => !access.isExcludedRecord(row))
  if (blocks.length === 0) return rows
  blocks.sort((a, b) => a.groupOrder - b.groupOrder)
  const read = (block: CategoryBlockRecord) => block.format === 2 ? readHeaderChunks(database, block) : blockRecords(block)
  let records: CatalogRecord[]
  if (clock) {
    const parts: CatalogRecord[][] = []
    for (const block of blocks) {
      clock.check()
      if (block.format === 2) {
        // Um pedaço (500 itens) por vez: ler e converter a categoria inteira numa tarefa só travava a tela da TV.
        for await (const part of iterateHeaderChunks(database, block)) {
          parts.push(part)
          await clock.maybeYield()
        }
      } else {
        parts.push(await read(block))
      }
      await clock.maybeYield(true)
    }
    records = parts.flat()
  } else {
    records = (await Promise.all(blocks.map(read))).flat()
  }
  if (rows.length === 0) return records
  const byGroupOrder = (a: CatalogRecord, b: CatalogRecord) => a.groupOrder - b.groupOrder
  return clock ? stableSortInSlices([...records, ...rows], byGroupOrder, clock) : [...records, ...rows].sort(byGroupOrder)
}

/** Um pedaço de uma página de "Todos": o bloco de uma categoria, ou as linhas dela (formato antigo). */
export type KindPageChunk = { block: CategoryBlockRecord } | { rows: CatalogRecord[] }

export interface KindPage {
  chunks: KindPageChunk[]
  /** Cursor da próxima página; `undefined` = acabou. */
  next: number | undefined
}

/** Cursor estável de "Todos": posição dentro da categoria e revisão da sua projeção. */
export interface KindCursor {
  sourceId: string
  generation: number
  kind: Exclude<CatalogItemKind, 'episode'>
  categoryId: number
  offset: number
  revision?: string
}

export interface KindCursorPage {
  items: CatalogRecord[]
  next?: KindCursor
  totalCategories: number
}

/**
 * Lê uma janela por categoria, sem acumular o tipo inteiro. O cursor carrega
 * a revisão para que uma renovação reinicie a categoria afetada em vez de
 * reaproveitar um offset antigo.
 */
export async function readKindCursorPage(
  sourceId: string,
  kind: Exclude<CatalogItemKind, 'episode'>,
  cursor: KindCursor | undefined,
  limit: number,
  database: CatalogDb = db,
): Promise<KindCursorPage> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined || limit <= 0) return { items: [], totalCategories: 0 }
  const categories = await visibleCategoriesOfKind(database, sourceId, generation, kind)
  const cursorIndex = cursor && cursor.sourceId === sourceId && cursor.generation === generation && cursor.kind === kind
    ? categories.findIndex((category) => category.id === cursor.categoryId)
    : -1
  const items: CatalogRecord[] = []
  let index = cursorIndex >= 0 ? cursorIndex : 0
  let offset = cursorIndex >= 0 ? Math.max(0, cursor?.offset ?? 0) : 0
  let next: KindCursor | undefined
  while (index < categories.length && items.length < limit) {
    const category = categories[index]
    // Feature 082: formato 2 também é lido por janela (só os pedaços que cobrem a página).
    const manifest = await categoryWindowInfo(sourceId, category, database)
    if (manifest) {
      const categoryOffset = cursorIndex === index && cursor?.revision !== undefined && cursor.revision !== manifest.revision ? 0 : offset
      const resumingCategory = cursorIndex === index && offset > 0
      const categoryLimit = !resumingCategory && items.length > 0 ? manifest.count - categoryOffset : limit - items.length
      const page = await readCategoryWindow(sourceId, category.id as number, categoryOffset, categoryLimit, database)
      items.push(...page.items)
      if (page.nextOffset !== undefined) {
        next = { sourceId, generation, kind, categoryId: category.id as number, offset: page.nextOffset, revision: manifest.revision }
        break
      }
    } else {
      const block = await database.categoryBlocks.get(category.id as number)
      const records = block && block.sourceId === sourceId && block.generation === generation
        ? block.format === 2 ? await readHeaderChunks(database, block) : blockRecords(block)
        : await query(database, sourceId, generation, category.order, kind).toArray()
      // Sem projeção (categoria pequena, 065): a assinatura dos itens faz o papel de revisão — renovou, recomeça a categoria.
      const blockRevision = category.itemsSignature !== undefined ? `items:${category.itemsSignature}` : undefined
      if (cursorIndex === index && cursor?.revision !== undefined && cursor.revision !== blockRevision) offset = 0
      const resumingCategory = cursorIndex === index && offset > 0
      const categoryLimit = !resumingCategory && items.length > 0 ? records.length - offset : limit - items.length
      const before = items.length
      items.push(...records.slice(offset, offset + categoryLimit))
      if (offset + items.length - before < records.length) {
        next = { sourceId, generation, kind, categoryId: category.id as number, offset: offset + items.length - before, revision: blockRevision }
        break
      }
    }
    index += 1
    offset = 0
    if (index < categories.length && items.length >= limit) {
      const following = categories[index]
      const followingManifest = await categoryWindowInfo(sourceId, following, database)
      next = { sourceId, generation, kind, categoryId: following.id as number, offset: 0, revision: followingManifest?.revision ?? (following.itemsSignature !== undefined ? `items:${following.itemsSignature}` : undefined) }
    }
  }
  return { items, next, totalCategories: categories.length }
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
  const categories = await visibleCategoriesOfKind(database, sourceId, generation, kind)
  const chunks: KindPageChunk[] = []
  let count = 0
  let index = cursor
  while (index < categories.length && count < minItems) {
    const category = categories[index]
    index += 1
    const block = await database.categoryBlocks.get(category.id as number)
    if (block && block.sourceId === sourceId && block.generation === generation) {
      if (block.format === 2) {
        const records = await readHeaderChunks(database, block)
        if (records.length > 0) chunks.push({ rows: records })
        count += block.count ?? records.length
      } else {
        if ((block.items ?? []).length > 0) chunks.push({ block })
        count += (block.items ?? []).length
      }
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
  const access = await getCategoryAccess(sourceId, database)
  try {
    for (const block of await blocksOfKind(database, sourceId, generation, kind).toArray()) {
      if (access.excluded.has(block.categoryId)) continue
      const records = block.format === 2 ? await readHeaderChunks(database, block) : blockRecords(block)
      for (const item of records) take(item)
      if (found.year && found.addedAt) throw new FavoritesScanComplete()
    }
    await query(database, sourceId, generation, undefined, kind).each((record) => {
      if (access.isExcludedRecord(record)) return
      take(record)
      if (found.year && found.addedAt) throw new FavoritesScanComplete()
    })
  } catch (error) {
    if (!(error instanceof FavoritesScanComplete)) throw error
  }
  return found
}
