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
  /** Linhas do guia no formato antigo, por lista — já contadas aqui; os candidatos não refazem a contagem (085, medido na TV: ~0,7 s). */
  legacyGuideRows?: Record<string, number>
}

/**
 * Linhas do guia no formato antigo. Só existem enquanto a lista não tem o guia novo (`epgStoredBytes` indefinido): a conversão e a publicação do
 * guia novo as apagam. Não consultar a tabela nas outras é o que importa na TV: depois de esvaziada, qualquer consulta a ela leva ~1 s (medido no
 * app real, 085/assessment do orçamento), mesmo vazia.
 */
async function legacyGuideRowCount(database: CatalogDb, source: SourceRecord): Promise<number> {
  if (source.epgStoredBytes !== undefined) return 0
  return database.epgPrograms.where('[sourceId+generation]').between([source.id, -Infinity], [source.id, Infinity]).count()
}

/** Bytes do guia de uma lista: formato novo (`epgStoredBytes`) + linhas do formato antigo ainda gravadas. */
export async function guideStoredBytes(database: CatalogDb, source: SourceRecord): Promise<{ bytes: number; legacyRows: number }> {
  const legacyRows = await legacyGuideRowCount(database, source)
  return { bytes: (source.epgStoredBytes ?? 0) + legacyRows * LEGACY_EPG_ROW_BYTES, legacyRows }
}

/** Preenchido só no build de medição (`makeRoomFor`): tempo de cada etapa da conta e o tamanho do que ela leu. */
export type LedgerProbe = Record<string, number>

/** Conta do catálogo + guia + episódios + metadados, por lista e total. */
export async function catalogLedger(database: CatalogDb, probe?: LedgerProbe): Promise<CatalogLedger> {
  const lap = (key: string, since: number) => { if (probe) probe[key] = (probe[key] ?? 0) + (performance.now() - since) }
  const readStart = performance.now()
  const [categories, manifests, sources, blockKeys] = await Promise.all([
    database.categories.toArray(),
    database.catalogReadManifests.toArray(),
    database.sources.toArray(),
    database.categoryBlocks.toCollection().primaryKeys(),
  ])
  lap('ledgerReadMs', readStart)
  if (probe) Object.assign(probe, { categories: categories.length, manifests: manifests.length, sources: sources.length, blocks: blockKeys.length })
  const withBlock = new Set(blockKeys as number[])
  const projection = new Map(manifests.map((manifest) => [manifest.categoryId, manifest.count]))
  const bySource: Record<string, number> = {}
  const byCategory = new Map<number, number>()
  const add = (sourceId: string, bytes: number) => { bySource[sourceId] = (bySource[sourceId] ?? 0) + bytes }
  for (const category of categories) {
    // Formato antigo sem bloco: só conta se houver linhas da 039 de verdade — a "órfã" (liberada com o banco cheio,
    // carimbada sem itens) não ocupa nada e, contada, faria o orçamento recusar à toa.
    const legacyWithoutBlock = category.storedBytes === undefined && (category.itemsCount ?? 0) > 0 && !withBlock.has(category.id as number)
    const legacyStart = performance.now()
    const hasRows = legacyWithoutBlock && (await database.channels.where('[sourceId+generation+kind+groupOrder]')
      .equals([category.sourceId, category.generation, category.kind, category.order]).count()) > 0
    if (legacyWithoutBlock) { lap('ledgerLegacyMs', legacyStart); if (probe) probe.legacyCategories = (probe.legacyCategories ?? 0) + 1 }
    const bytes = legacyWithoutBlock && !hasRows ? 0 : categoryRecordBytes(category, projection.get(category.id as number) ?? 0)
    byCategory.set(category.id as number, bytes)
    add(category.sourceId, bytes)
  }
  // O guia antigo só é consultado em lista sem o guia novo (`legacyGuideRowCount`); episódios e metadados são contados por lista, em paralelo.
  const legacyGuideRows: Record<string, number> = {}
  const countStart = performance.now()
  const done = (key: string) => <T>(value: T): T => { if (probe) probe[key] = Math.max(probe[key] ?? 0, performance.now() - countStart); return value }
  const counts = await Promise.all(sources.map(async (source) => {
    const generation = source.activeGeneration
    const [epgRows, episodes, metadata] = await Promise.all([
      legacyGuideRowCount(database, source).then(done('ledgerEpgDoneMs')),
      generation === undefined ? 0 : database.channels.where('[sourceId+generation+kind+groupOrder]')
        .between([source.id, generation, 'episode', -Infinity], [source.id, generation, 'episode', Infinity]).count().then(done('ledgerEpisodesDoneMs')),
      database.titleMetadata.where('sourceId').equals(source.id).count().then(done('ledgerMetadataDoneMs')),
    ])
    return { source, epgRows, episodes, metadata }
  }))
  lap('ledgerCountsMs', countStart)
  for (const { source, epgRows, episodes, metadata } of counts) {
    legacyGuideRows[source.id] = epgRows
    if (probe) { probe.epgRows = (probe.epgRows ?? 0) + epgRows; probe.episodes = (probe.episodes ?? 0) + episodes; probe.metadata = (probe.metadata ?? 0) + metadata }
    add(source.id, (source.epgStoredBytes ?? 0) + epgRows * LEGACY_EPG_ROW_BYTES + episodes * LEGACY_ITEM_BYTES + metadata * METADATA_BYTES)
  }
  const total = Object.values(bySource).reduce((sum, value) => sum + value, 0)
  return { total, bySource, byCategory, legacyGuideRows }
}
