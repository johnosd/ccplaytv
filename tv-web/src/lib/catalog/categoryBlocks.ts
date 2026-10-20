/**
 * Catálogo em blocos por categoria (feature 039, `logic/blocos-e-identidade.md`).
 *
 * Os itens (canal, filme, série) de uma categoria passam a viver num único
 * registro — o bloco —, lido e gravado de uma vez. Cada item ganha um id
 * numérico **negativo** que codifica a categoria e a identidade estável do
 * item (nunca posição, nunca URL): ids positivos continuam sendo as linhas
 * antigas de `channels` (formato anterior, lido como reserva e convertido em
 * segundo plano). Episódios não mudam de formato (FR-004).
 *
 * Este módulo não importa `catalogRepository.ts` (que o importa): as funções
 * de escrita rodam dentro de transações abertas lá.
 */

import {
  db,
  type BlockItem,
  type CatalogDb,
  type CatalogItemKind,
  type CatalogRecord,
  type CategoryBlockRecord,
  type CategoryKind,
} from './db'
import { writeCompressedBlock } from './blockWrite'
/** Espaço de ids por categoria: `id = -(categoryId * BLOCK_ID_SPACE + slot)`. */
export const BLOCK_ID_SPACE = 2 ** 32

/**
 * Identidade de um item (feature 038, `logic/atualizacao-sem-esfriar.md` §6):
 * série pelo `seriesId`, item do provedor pelo id dele, M3U pelo nome
 * original. Nunca pela URL nem pela posição.
 */
export function identityKey(record: Pick<CatalogRecord, 'kind' | 'seriesId' | 'providerStreamId' | 'originalName'>): string {
  if (record.kind === 'series' && record.seriesId) return `s:${record.seriesId}`
  if (record.providerStreamId) return `p:${record.providerStreamId}`
  return `n:${record.originalName}`
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Assinatura dos campos que a listagem traz, na ordem da fonte. Fica só no
 * aparelho — nunca vai para log nem tela (contém a URL de reprodução do M3U,
 * que muda quando o token muda).
 */
export function itemsSignature(items: CatalogRecord[]): string {
  const text = JSON.stringify(
    items.map((item) => {
      const fields: unknown[] = [
        identityKey(item),
        item.name,
        item.iconUrl ?? null,
        item.year ?? null,
        item.addedAt ?? null,
        item.epgChannelId ?? null,
        item.streamExtension ?? null,
        item.directUrl ?? null,
        item.group ?? null,
      ]
      // Feature 044 (D-006): só entram quando existem — um item sem eles gera o
      // mesmo vetor de antes, para uma lista antiga não regravar todos os blocos.
      // Só o hash sai daqui; o valor do header nunca é guardado nem logado.
      if (item.playbackHeaders || item.radio || item.declaredChannelNumber !== undefined) {
        fields.push(
          item.playbackHeaders?.userAgent ?? null,
          item.playbackHeaders?.referer ?? null,
          item.radio ?? null,
          item.declaredChannelNumber ?? null,
        )
      }
      // Feature 055 (D-005): campos da listagem só entram quando algum existe, DEPOIS dos da 044 e nesta ordem — um
      // item sem eles gera o mesmo vetor de antes (lista antiga não regrava à toa) e, sem estarem aqui, uma lista
      // já importada nunca gravaria a nota do painel (assinatura idêntica ⇒ `writeBlockWithin` não regrava).
      if (item.providerRating !== undefined || item.providerGenres !== undefined || item.providerBackdropUrl !== undefined) {
        fields.push(item.providerRating ?? null, item.providerGenres ?? null, item.providerBackdropUrl ?? null)
      }
      // Feature 058 (`data-model.md` §1): mesma regra — só quando existe, DEPOIS dos da 055. Uma lista sem arquivo
      // gera o vetor de antes; uma com arquivo regrava o bloco uma vez (senão nunca gravaria os dias).
      if (item.archiveDays !== undefined) fields.push(item.archiveDays)
      return fields
    }),
  )
  return `${items.length}:${fnv1a32(text).toString(16)}`
}

/**
 * Id de um item de bloco. `slot` vem de um hash 32 bits da identidade; se já
 * estiver ocupado por outro item do mesmo bloco (`taken`), avança até achar
 * um livre — determinístico pela ordem da fonte.
 */
export function blockItemId(categoryId: number, identity: string, taken: ReadonlySet<number>): number {
  let slot = fnv1a32(identity)
  for (;;) {
    const id = -(categoryId * BLOCK_ID_SPACE + slot)
    if (!taken.has(id)) return id
    slot = (slot + 1) % BLOCK_ID_SPACE
  }
}

/** A categoria dona de um id de item de bloco; `undefined` para id de linha antiga (≥ 0). */
export function categoryIdOfBlockItem(id: number): number | undefined {
  if (!Number.isFinite(id) || id >= 0) return undefined
  return Math.floor(-id / BLOCK_ID_SPACE)
}

/** Alvo de uma escrita de bloco (mesmo formato de `CategoryItemsTarget`). */
export interface BlockTarget {
  sourceId: string
  generation: number
  kind: CategoryKind
  categoryId: number
  groupOrder: number
}

/** Reidrata um item do bloco num `CatalogRecord` completo. */
export function blockRecord(block: CategoryBlockRecord, item: BlockItem, index: number): CatalogRecord {
  return {
    ...item,
    sourceId: block.sourceId,
    generation: block.generation,
    kind: block.kind,
    groupOrder: block.groupOrder,
    categoryId: block.categoryId,
    categoryPosition: index,
  }
}

/** Todos os itens de um bloco, na ordem da fonte. */
export function blockRecords(block: CategoryBlockRecord): CatalogRecord[] {
  return (block.items ?? []).map((item, index) => blockRecord(block, item, index))
}

/** Linhas antigas (não episódio) de uma categoria — o formato anterior à 039. */
export function legacyRowsOf(database: CatalogDb, target: Pick<BlockTarget, 'sourceId' | 'generation' | 'kind' | 'groupOrder'>) {
  return database.channels
    .where('[sourceId+generation+kind+groupOrder]')
    .equals([target.sourceId, target.generation, target.kind, target.groupOrder])
}

/** Faixa de chave de todos os blocos de uma fonte (qualquer geração e tipo). */
export function blocksOfSource(database: CatalogDb, sourceId: string) {
  return database.categoryBlocks
    .where('[sourceId+generation+kind]')
    .between([sourceId, GENERATION_MIN, KIND_MIN], [sourceId, GENERATION_MAX, KIND_MAX], true, true)
}

/** Faixa de chave dos blocos de uma geração (qualquer tipo) — pelo índice, sem ler os outros. */
export function blocksOfGeneration(database: CatalogDb, sourceId: string, generation: number) {
  return database.categoryBlocks
    .where('[sourceId+generation+kind]')
    .between([sourceId, generation, KIND_MIN], [sourceId, generation, KIND_MAX], true, true)
}

/**
 * Chaves dos blocos de uma fonte em gerações DIFERENTES de `generation`: duas
 * faixas pelo índice (antes e depois dela). Um filtro `.and()` obrigaria a ler
 * cada bloco — de todas as gerações, inclusive a nova — só para decidir.
 */
export async function blockKeysOutsideGeneration(
  database: CatalogDb,
  sourceId: string,
  generation: number,
): Promise<number[]> {
  const index = database.categoryBlocks.where('[sourceId+generation+kind]')
  const [before, after] = await Promise.all([
    index.between([sourceId, GENERATION_MIN, KIND_MIN], [sourceId, generation, KIND_MIN], true, false).primaryKeys(),
    index.between([sourceId, generation, KIND_MAX], [sourceId, GENERATION_MAX, KIND_MAX], false, true).primaryKeys(),
  ])
  return [...before, ...after]
}

/** Faixa de `generation` (mesma de `catalogRepository`) e de `kind` (texto) no índice dos blocos. */
export const GENERATION_MIN = -1
export const GENERATION_MAX = Number.MAX_SAFE_INTEGER
export const KIND_MIN = ''
export const KIND_MAX = '￿'

/** Blocos de um tipo numa geração (tipo sem categoria — episódio, não classificado — não tem bloco). */
export function blocksOfKind(database: CatalogDb, sourceId: string, generation: number, kind: CatalogItemKind) {
  return database.categoryBlocks.where('[sourceId+generation+kind]').equals([sourceId, generation, kind])
}

/**
 * Converte, em partes, as categorias da geração ativa que ainda guardam itens
 * no formato antigo (uma linha por item) para blocos (FR-008 a FR-012):
 * grava o bloco com os mesmos itens, na mesma ordem, e apaga as linhas daquela
 * categoria na mesma transação. Idempotente e retomável. Preserva
 * `itemsFetchedAt` (converter não é renovar).
 *
 * @returns `true` se ainda sobrou categoria a converter.
 */
export async function convertLegacyCategories(
  sourceId: string,
  options: {
    maxCategories?: number
    /**
     * Avisado por categoria convertida: os ids dos itens mudaram (R-003), então
     * quem guarda a lista em memória precisa relê-la.
     */
    onConverted?: (categoryId: number) => void
  } = {},
  database: CatalogDb = db,
): Promise<boolean> {
  const maxCategories = options.maxCategories ?? 1
  const generation = (await database.sources.get(sourceId))?.activeGeneration
  if (generation === undefined) return false

  const categories = (await database.categories.where('sourceId').equals(sourceId).toArray())
    .filter((category) => category.generation === generation)
    .sort((a, b) => (a.id as number) - (b.id as number))

  // Só as chaves (nunca os blocos inteiros): esta checagem roda a cada parte da
  // limpeza em segundo plano, mesmo quando já não há nada a converter.
  const withBlock = new Set(await blocksOfSource(database, sourceId).primaryKeys())

  let converted = 0
  for (const category of categories) {
    const categoryId = category.id as number
    const target: BlockTarget = {
      sourceId,
      generation,
      kind: category.kind,
      categoryId,
      groupOrder: category.order,
    }
    // Já em bloco, ou sem nada no formato antigo: nada a converter aqui.
    if (withBlock.has(categoryId)) continue
    if (!(await legacyRowsOf(database, target).first())) continue
    // Sobrou pelo menos uma depois do limite desta parte.
    if (converted >= maxCategories) return true
    // Fora de transação: a gravação comprimida tem duas fases (feature 082, `blockWrite.ts`).
    const rows = await legacyRowsOf(database, target).toArray()
    // Mesma ordem que a leitura de linhas usava (`listChannels`).
    rows.sort((a, b) => {
      const pa = a.categoryPosition ?? Number.MAX_SAFE_INTEGER
      const pb = b.categoryPosition ?? Number.MAX_SAFE_INTEGER
      return pa - pb || (a.id ?? 0) - (b.id ?? 0)
    })
    // Converter não é renovar: o instante da última obtenção fica como estava (`convert`).
    const { written } = await writeCompressedBlock(target, rows, category.itemsFetchedAt ?? 0, database, { convert: true })
    if (written) options.onConverted?.(categoryId)
    converted += 1
  }
  return false
}
