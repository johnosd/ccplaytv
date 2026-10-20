/**
 * Conversão em segundo plano do que já está gravado para o formato comprimido (feature 082, FR-006,
 * `logic/formato-comprimido.md` §7). Roda no `housekeeping` da pré-carga, uma categoria por chamada, depois da conversão
 * da 039 (linhas → bloco): retomável e idempotente — o que já está no formato 2 é pulado.
 *
 * Ordem: primeiro a lista ativa, e nela as categorias com mais itens (mais espaço por conversão); depois as outras
 * listas. Converter não é renovar: ids, `itemsFetchedAt` e `itemsSignature` ficam como estavam.
 */
import { db, type CatalogDb } from './db'
import { blockRecords } from './categoryBlocks'
import { writeCompressedBlock } from './blockWrite'
import { deleteCategoryItems, isOrphanCategory, markCategoryReleased } from './blockChunks'
import { isQuotaError } from './catalogRepository'

/** Categorias que não deu para converter nesta sessão (sem espaço e não refazíveis): não travam a fila. */
const skipped = new Set<string>()

/**
 * Converte UMA categoria cujo bloco ainda tem `items` (formato antigo).
 * @returns `true` se converteu (pode haver mais); `false` = nada a converter.
 */
export async function convertNextBlock(
  activeSourceId: string,
  options: { onConverted?: (sourceId: string, categoryId: number) => void } = {},
  database: CatalogDb = db,
): Promise<boolean> {
  // `storedBytes` só existe no formato 2: candidatas sem ler bloco nenhum.
  const pending = (await database.categories.toArray())
    .filter((category) => category.storedBytes === undefined && (category.itemsCount ?? 0) > 0)
    .sort((a, b) => Number(b.sourceId === activeSourceId) - Number(a.sourceId === activeSourceId)
      || (b.itemsCount ?? 0) - (a.itemsCount ?? 0))
  for (const category of pending) {
    const categoryId = category.id as number
    // Sem bloco (linhas da 039 ainda não convertidas, ou M3U guardado): não é com esta conversão.
    if ((await database.categoryBlocks.where(':id').equals(categoryId).count()) === 0) continue
    const block = await database.categoryBlocks.get(categoryId)
    if (!block || block.format === 2 || skipped.has(`${database.name}:${categoryId}`)) continue
    const target = { sourceId: block.sourceId, generation: block.generation, kind: block.kind, categoryId, groupOrder: block.groupOrder }
    try {
      const { written } = await writeCompressedBlock(target, blockRecords(block), category.itemsFetchedAt ?? 0, database, { convert: true })
      if (written) options.onConverted?.(block.sourceId, categoryId)
    } catch (error) {
      if (!isQuotaError(error)) throw error
      // Banco cheio (a TV de 2026-10-18 passou de 80 MiB no formato antigo): converter precisa gravar antes de apagar e
      // nunca andaria. Primeiro sai o guia em linhas (o mais barato de refazer: a próxima sincronização, e ~10× maior que
      // o comprimido) e a conversão tenta de novo; sem ele, a categoria sob demanda é liberada (volta ao entrar) e a M3U
      // guardada só é pulada.
      if (await releaseLegacyGuides(database)) return true
      if (category.fetchMode === 'on_demand') await deleteCategoryItems(database, categoryId)
      else skipped.add(`${database.name}:${categoryId}`)
      options.onConverted?.(block.sourceId, categoryId)
    }
    return true
  }
  return false
}

/**
 * Conserta as categorias órfãs (carimbadas como obtidas, sem itens — liberadas com o banco cheio): voltam a "nunca
 * obtida", para a conta e a pré-carga verem a verdade. Sem espaço ainda (o apagado não voltou — R-002), `'blocked'`.
 */
export async function repairOrphanCategories(database: CatalogDb = db): Promise<'repaired' | 'blocked' | 'none'> {
  let repaired = false
  // Guia órfão: a fonte aponta para uma geração em linhas que `releaseLegacyGuides` apagou → "ainda não sincronizado".
  for (const source of await database.sources.toArray()) {
    if (source.epgActiveGeneration === undefined || source.epgStoredBytes !== undefined) continue
    if ((await database.epgPrograms.where('[sourceId+generation]').equals([source.id, source.epgActiveGeneration]).count()) > 0) continue
    try {
      await database.sources.update(source.id, { epgActiveGeneration: undefined, epgLastSyncAt: undefined })
      repaired = true
    } catch (error) {
      if (!isQuotaError(error)) throw error
      return 'blocked'
    }
  }
  for (const category of await database.categories.toArray()) {
    if (category.storedBytes !== undefined || !(await isOrphanCategory(database, category))) continue
    try {
      await markCategoryReleased(database, category.id as number)
      repaired = true
    } catch (error) {
      if (!isQuotaError(error)) throw error
      return repaired ? 'repaired' : 'blocked'
    }
  }
  return repaired ? 'repaired' : 'none'
}

/** Há categoria órfã esperando conserto (o espaço apagado ainda não voltou para gravar)? */
export async function hasOrphanCategories(database: CatalogDb = db): Promise<boolean> {
  for (const category of await database.categories.toArray()) {
    if (category.storedBytes === undefined && (await isOrphanCategory(database, category))) return true
  }
  return false
}

/**
 * Apaga as linhas do guia no formato anterior à 082 — só remoção, que passa mesmo acima da cota. As fontes ficam
 * apontando para elas até `repairOrphanCategories` conseguir gravar (guia "ainda não sincronizado").
 * @returns `true` se havia linhas.
 */
export async function releaseLegacyGuides(database: CatalogDb = db): Promise<boolean> {
  if ((await database.epgPrograms.count()) === 0) return false
  await database.epgPrograms.clear()
  return true
}
