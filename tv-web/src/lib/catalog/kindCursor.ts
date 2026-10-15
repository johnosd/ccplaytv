import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord } from './db'
import { blockRecords } from './categoryBlocks'
import { readCategoryWindow } from './categoryWindow'
import { getCategoryAccess } from './categoryAccess'

const KEY_MIN = -1
const KEY_MAX = Number.MAX_SAFE_INTEGER

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

export async function readKindCursorPage(
  sourceId: string,
  kind: Exclude<CatalogItemKind, 'episode'>,
  cursor: KindCursor | undefined,
  limit: number,
  database: CatalogDb = db,
): Promise<KindCursorPage> {
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined || limit <= 0) return { items: [], totalCategories: 0 }
  // Feature 066: "Todos" sem as categorias escondidas/bloqueadas.
  const access = await getCategoryAccess(sourceId, database)
  const categories = (
    await database.categories
      .where('[sourceId+generation+kind+order]')
      .between([sourceId, generation, kind, KEY_MIN], [sourceId, generation, kind, KEY_MAX], true, true)
      .toArray()
  ).filter((category) => !access.excluded.has(category.id as number))
  const cursorIndex = cursor && cursor.sourceId === sourceId && cursor.generation === generation && cursor.kind === kind
    ? categories.findIndex((category) => category.id === cursor.categoryId)
    : -1
  const items: CatalogRecord[] = []
  let index = cursorIndex >= 0 ? cursorIndex : 0
  let offset = cursorIndex >= 0 ? Math.max(0, cursor?.offset ?? 0) : 0
  let next: KindCursor | undefined
  while (index < categories.length && items.length < limit) {
    const category = categories[index]
    const manifest = await database.catalogReadManifests.get(category.id as number)
    const categoryOffset = cursorIndex === index && cursor?.revision !== undefined && cursor.revision !== manifest?.revision ? 0 : offset
    if (manifest?.ready && manifest.generation === generation) {
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
        ? blockRecords(block)
        : await database.channels
            .where('[sourceId+generation+kind+groupOrder]')
            .between([sourceId, generation, kind, category.order], [sourceId, generation, kind, category.order], true, true)
            .toArray()
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
      const followingManifest = await database.catalogReadManifests.get(following.id as number)
      next = { sourceId, generation, kind, categoryId: following.id as number, offset: 0, revision: followingManifest?.revision ?? (following.itemsSignature !== undefined ? `items:${following.itemsSignature}` : undefined) }
    }
  }
  return { items, next, totalCategories: categories.length }
}
