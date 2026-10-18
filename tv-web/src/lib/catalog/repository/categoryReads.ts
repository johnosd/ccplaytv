/** Leituras por categoria: janela de canais, bloco ativo, contagem e item por id. Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import Dexie from 'dexie'
import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord, type CategoryBlockRecord, type CategoryRecord } from '../db'
import { blockRecord, blockRecords, blocksOfGeneration, blocksOfKind, categoryIdOfBlockItem } from '../categoryBlocks'
import { blockItemIndex, movedIdOf, readBlock } from '../blockMemo'
import { activeGenerationOf, query } from './shared'
import { getCategoryAccess } from '../categoryAccess'
import { findSeriesRecord } from './series'
import { readBlockChunks } from '../blockChunks'

/** Categorias da geração ativa com um dado `order` (e `kind`, se informado). */
async function categoriesAtOrder(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  groupOrder: number,
  kind?: CatalogItemKind,
): Promise<CategoryRecord[]> {
  if (kind) {
    if (kind === 'episode') return []
    return database.categories
      .where('[sourceId+generation+kind+order]')
      .equals([sourceId, generation, kind, groupOrder])
      .toArray()
  }
  return (await database.categories.where('sourceId').equals(sourceId).toArray()).filter(
    (record) => record.generation === generation && record.order === groupOrder,
  )
}

/**
 * Itens de uma categoria (ou de todas as que têm aquele `order`, sem `kind`):
 * do bloco, se houver; das linhas antigas, senão (feature 039, §5).
 */
async function readCategory(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  groupOrder: number,
  kind?: CatalogItemKind,
): Promise<CatalogRecord[]> {
  const categories = await categoriesAtOrder(database, sourceId, generation, groupOrder, kind)
  const blocks = (await database.categoryBlocks.bulkGet(categories.map((category) => category.id as number))).filter(
    (block): block is NonNullable<typeof block> => !!block && block.generation === generation,
  )
  const fromBlocks = (await Promise.all(blocks.map((block) => block.format === 2 ? readBlockChunks(database, block.categoryId) : blockRecords(block)))).flat()
  // Com `kind` e bloco achado, não há linha antiga daquela categoria (escrever
  // o bloco as apaga) — poupa a segunda leitura no caminho quente.
  if (kind && blocks.length > 0) return fromBlocks
  const rows = await query(database, sourceId, generation, groupOrder, kind).toArray()
  return fromBlocks.length > 0 ? [...fromBlocks, ...rows] : rows
}

/**
 * Uma janela de canais de uma categoria — paginado por contrato (FR-005): a
 * tela pede uma página, nunca o catálogo.
 */
export async function listChannels(
  sourceId: string,
  groupOrder: number,
  offset: number,
  limit: number,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  // Feature 038 (D-006): a renovação preserva ids, então a ordem por id deixa
  // de ser a da fonte — a ordem é `categoryPosition` (ausente = depois, por
  // id, como gravado antes da 024). Ordena antes de fatiar.
  // Feature 066 (FR-014/FR-020): categoria escondida/bloqueada lê vazio, mesmo pedida por um cache velho.
  const access = await getCategoryAccess(sourceId, database)
  const records = (await readCategory(database, sourceId, generation, groupOrder, kind)).filter((record) => !access.isExcludedRecord(record))
  records.sort((a, b) => {
    const pa = a.categoryPosition ?? Number.MAX_SAFE_INTEGER
    const pb = b.categoryPosition ?? Number.MAX_SAFE_INTEGER
    return pa - pb || (a.id ?? 0) - (b.id ?? 0)
  })
  return records.slice(offset, offset + limit)
}

/**
 * O bloco de uma categoria da geração ativa, lido pela chave — o caminho
 * rápido de abrir uma categoria (feature 039, R-009): uma leitura só, sem
 * reidratar cada item num `CatalogRecord`, sem ordenar (o bloco já está na
 * ordem da fonte). `undefined` = a categoria não tem bloco (formato antigo, ou
 * nada no aparelho) — quem chama cai em `listChannels`, que lê as linhas.
 */
export async function getActiveCategoryBlock(
  sourceId: string,
  categoryId: number,
  database: CatalogDb = db,
): Promise<CategoryBlockRecord | undefined> {
  const [generation, block, access] = await Promise.all([
    activeGenerationOf(sourceId, database),
    readBlock(database, categoryId, Dexie.currentTransaction != null),
    getCategoryAccess(sourceId, database),
  ])
  if (!block || block.sourceId !== sourceId || block.generation !== generation || access.excluded.has(categoryId)) return undefined
  if (block.format === 2) {
    const records = await readBlockChunks(database, categoryId)
    return { ...block, items: records.map(({ sourceId: _source, generation: _generation, kind: _kind, groupOrder: _order, categoryId: _category, categoryPosition: _position, ...item }) => item as NonNullable<CategoryBlockRecord['items']>[number]) }
  }
  return block
}

/**
 * Quantos canais há na geração ativa. Serve para decidir estado vazio —
 * nunca para prometer que o catálogo da fonte veio inteiro.
 */
export async function countChannels(
  sourceId: string,
  groupOrder?: number,
  kind?: CatalogItemKind,
  database: CatalogDb = db,
): Promise<number> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return 0
  if (groupOrder !== undefined) {
    return (await readCategory(database, sourceId, generation, groupOrder, kind)).length
  }
  // Tipo (ou geração) inteiro: blocos + linhas — nunca a mesma categoria nos dois.
  const blocks =
    kind === 'episode'
      ? []
      : kind
        ? await blocksOfKind(database, sourceId, generation, kind).toArray()
        : await blocksOfGeneration(database, sourceId, generation).toArray()
  const inBlocks = blocks.reduce((total, block) => total + (block.format === 2 ? (block.count ?? 0) : (block.items ?? []).length), 0)
  return inBlocks + (await query(database, sourceId, generation, undefined, kind).count())
}

/**
 * Um item pelo id local. Id negativo = item de bloco (feature 039,
 * `categoryIdOfBlockItem`); só é devolvido se o bloco for da geração ativa.
 * Id positivo = linha (formato antigo, ou episódio); se a linha já foi
 * convertida em bloco nesta sessão, o id antigo leva ao item no bloco
 * (`blockMemo.ts`) — uma tela aberta com o id antigo continua funcionando.
 *
 * O bloco vem do cache curto de `blockMemo.ts`: abrir um detalhe pede o mesmo
 * item 3–4 vezes (item, metadados, URL, episódios), e só a primeira lê o bloco.
 */
export async function getChannel(
  id: number,
  database: CatalogDb = db,
): Promise<CatalogRecord | undefined> {
  const categoryId = categoryIdOfBlockItem(id)
  if (categoryId === undefined) {
    const row = await database.channels.get(id)
    // Feature 066 (FR-020): um id guardado (continuar assistindo, zapping, retomar depois do segundo plano) não abre
    // item de categoria excluída. Episódio não tem categoria: vale a da série — série que não resolve, episódio também.
    if (row) {
      const access = await getCategoryAccess(row.sourceId, database)
      if (access.isExcludedRecord(row)) return undefined
      if (row.kind === 'episode' && row.seriesId && access.excluded.size > 0 && !(await findSeriesRecord(row.sourceId, row.seriesId, database))) return undefined
      return row
    }
    const moved = movedIdOf(database, id)
    return moved === undefined ? undefined : getChannel(moved, database)
  }
  const block = await readBlock(database, categoryId, Dexie.currentTransaction != null)
  if (!block) return undefined
  if ((await activeGenerationOf(block.sourceId, database)) !== block.generation) return undefined
  if ((await getCategoryAccess(block.sourceId, database)).excluded.has(categoryId)) return undefined
  if (block.format === 2) {
    const record = (await readBlockChunks(database, categoryId)).find((item) => item.id === id)
    if (record?.kind === 'series' && record.seriesId) {
      const stamp = (await database.categories.get(categoryId))?.seriesEpisodesFetchedAt?.[record.seriesId]
      if (stamp !== undefined && (record.episodesFetchedAt === undefined || stamp > record.episodesFetchedAt)) record.episodesFetchedAt = stamp
    }
    return record
  }
  const index = blockItemIndex(block, id)
  if (index < 0) return undefined
  const record = blockRecord(block, (block.items ?? [])[index], index)
  // Série: o carimbo dos episódios vive na categoria (`storeSeriesEpisodes`);
  // o do item é de antes desta correção — vale o mais recente.
  if (record.kind === 'series' && record.seriesId) {
    const stamp = (await database.categories.get(categoryId))?.seriesEpisodesFetchedAt?.[record.seriesId]
    if (stamp !== undefined && (record.episodesFetchedAt === undefined || stamp > record.episodesFetchedAt)) {
      record.episodesFetchedAt = stamp
    }
  }
  return record
}
