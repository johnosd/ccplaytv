/**
 * Conta própria do armazenamento (feature 082, `logic/orcamento.md` §2). Com o formato comprimido em pedaços
 * (`logic/formato-comprimido.md`), cada gravação conhece os bytes que gravou: a conta soma esses bytes, em vez de
 * estimar por item. O `navigator.storage.estimate()` da TV não cai depois de apagar registros (medido: `clear()` não
 * devolve espaço), então decidir só por ele seria errado.
 *
 * Só lê campos pequenos e `count()` por índice — nunca carrega pedaços, blocos nem linhas do guia.
 */
import type { CatalogDb, CategoryRecord, SourceRecord } from './db'

/** Formato antigo, por item (3,62 MB ÷ 11 347 filmes, medido na TV — R-003). Vale também para a projeção 065 e episódios. */
export const LEGACY_ITEM_BYTES = 320
/** Formato antigo do guia, por linha (14 MB ÷ 20 mil linhas, medido na TV). */
export const LEGACY_EPG_ROW_BYTES = 700
/** Um registro de metadados (TMDB) ou de preparo de seção. */
export const METADATA_BYTES = 512

/** Bytes de uma categoria a partir do registro dela: formato 2 = gravado; antigo = estimado; nada = 0. */
export function categoryRecordBytes(category: CategoryRecord, projectionItems = 0): number {
  if (category.storedBytes !== undefined) return category.storedBytes
  return ((category.itemsCount ?? 0) + projectionItems) * LEGACY_ITEM_BYTES
}

/** Bytes gravados hoje para os itens de uma categoria (pedaços comprimidos + cabeçalho). 0 = nada no aparelho. */
export async function categoryStoredBytes(database: CatalogDb, categoryId: number): Promise<number> {
  const category = await database.categories.get(categoryId)
  if (!category) return 0
  if (category.storedBytes !== undefined) return category.storedBytes
  if (!category.itemsCount) return 0
  const projection = await database.catalogReadManifests.get(categoryId)
  return categoryRecordBytes(category, projection?.count ?? 0)
}

export interface CatalogLedger {
  total: number
  bySource: Record<string, number>
  /** Bytes por categoria (o orçamento usa como tamanho de cada candidato). */
  byCategory: Map<number, number>
}

/** Bytes do guia de uma lista: formato novo (`epgStoredBytes`) + linhas do formato antigo ainda gravadas. */
export async function guideStoredBytes(database: CatalogDb, source: SourceRecord): Promise<{ bytes: number; legacyRows: number }> {
  const legacyRows = await database.epgPrograms.where('[sourceId+generation]').between([source.id, -Infinity], [source.id, Infinity]).count()
  return { bytes: (source.epgStoredBytes ?? 0) + legacyRows * LEGACY_EPG_ROW_BYTES, legacyRows }
}

/** Conta do catálogo + guia + episódios + metadados, por lista e total. */
export async function catalogLedger(database: CatalogDb): Promise<CatalogLedger> {
  const [categories, manifests, sources, blockKeys] = await Promise.all([
    database.categories.toArray(),
    database.catalogReadManifests.toArray(),
    database.sources.toArray(),
    database.categoryBlocks.toCollection().primaryKeys(),
  ])
  const withBlock = new Set(blockKeys as number[])
  const projection = new Map(manifests.map((manifest) => [manifest.categoryId, manifest.count]))
  const bySource: Record<string, number> = {}
  const byCategory = new Map<number, number>()
  const add = (sourceId: string, bytes: number) => { bySource[sourceId] = (bySource[sourceId] ?? 0) + bytes }
  for (const category of categories) {
    // Formato antigo sem bloco: só conta se houver linhas da 039 de verdade — a "órfã" (liberada com o banco cheio,
    // carimbada sem itens) não ocupa nada e, contada, faria o orçamento recusar à toa.
    const legacyWithoutBlock = category.storedBytes === undefined && (category.itemsCount ?? 0) > 0 && !withBlock.has(category.id as number)
    const hasRows = legacyWithoutBlock && (await database.channels.where('[sourceId+generation+kind+groupOrder]')
      .equals([category.sourceId, category.generation, category.kind, category.order]).count()) > 0
    const bytes = legacyWithoutBlock && !hasRows ? 0 : categoryRecordBytes(category, projection.get(category.id as number) ?? 0)
    byCategory.set(category.id as number, bytes)
    add(category.sourceId, bytes)
  }
  for (const source of sources) {
    const generation = source.activeGeneration
    const [epgRows, episodes, metadata] = await Promise.all([
      database.epgPrograms.where('[sourceId+generation]').between([source.id, -Infinity], [source.id, Infinity]).count(),
      generation === undefined ? 0 : database.channels.where('[sourceId+generation+kind+groupOrder]')
        .between([source.id, generation, 'episode', -Infinity], [source.id, generation, 'episode', Infinity]).count(),
      database.titleMetadata.where('sourceId').equals(source.id).count(),
    ])
    add(source.id, (source.epgStoredBytes ?? 0) + epgRows * LEGACY_EPG_ROW_BYTES + episodes * LEGACY_ITEM_BYTES + metadata * METADATA_BYTES)
  }
  const total = Object.values(bySource).reduce((sum, value) => sum + value, 0)
  return { total, bySource, byCategory }
}
