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
import { noteMovedIds } from './blockMemo'

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
  return block.items.map((item, index) => blockRecord(block, item, index))
}

/** Linhas antigas (não episódio) de uma categoria — o formato anterior à 039. */
export function legacyRowsOf(database: CatalogDb, target: Pick<BlockTarget, 'sourceId' | 'generation' | 'kind' | 'groupOrder'>) {
  return database.channels
    .where('[sourceId+generation+kind+groupOrder]')
    .equals([target.sourceId, target.generation, target.kind, target.groupOrder])
}

/** Campos que o bloco guarda por item (tira o que o bloco já diz). */
function toBlockItem(record: CatalogRecord, id: number, episodesFetchedAt: number | undefined): BlockItem {
  const {
    id: _id,
    sourceId: _sourceId,
    generation: _generation,
    kind: _kind,
    groupOrder: _groupOrder,
    categoryId: _categoryId,
    categoryPosition: _categoryPosition,
    ...fields
  } = record
  void _id
  void _sourceId
  void _generation
  void _kind
  void _groupOrder
  void _categoryId
  void _categoryPosition
  return { ...fields, id, episodesFetchedAt }
}

/**
 * Grava (ou renova) o bloco de uma categoria — `logic/blocos-e-identidade.md`
 * §4. Roda DENTRO de uma transação `rw` que inclui `categoryBlocks`,
 * `categories` e `channels`. Item que continua na fonte reaproveita o id que
 * tinha (casando por identidade, em ordem); `episodesFetchedAt` é mantido;
 * lista idêntica só carimba o instante. Apaga as linhas antigas da categoria
 * na mesma transação (uma categoria é ou bloco ou linhas, nunca os dois).
 *
 * @returns `true` se o bloco foi (re)escrito.
 */
export async function writeBlockWithin(
  target: BlockTarget,
  items: CatalogRecord[],
  now: number,
  database: CatalogDb,
): Promise<boolean> {
  const category = await database.categories.get(target.categoryId)
  // A categoria saiu numa atualização enquanto a busca voava: não grava órfãos.
  if (!category) return false

  const signature = itemsSignature(items)
  const old = await database.categoryBlocks.get(target.categoryId)
  if (old && category.itemsSignature === signature && old.items.length === items.length) {
    await database.categories.update(target.categoryId, { itemsFetchedAt: now })
    return false
  }
  const legacy = old ? [] : await legacyRowsOf(database, target).sortBy('id')

  // Anteriores por identidade, em ordem: nomes repetidos (M3U) casam em ordem.
  type Previous = { id?: number; legacyId?: number; episodesFetchedAt?: number }
  const previous = new Map<string, Previous[]>()
  const push = (key: string, value: Previous) => {
    const queue = previous.get(key)
    if (queue) queue.push(value)
    else previous.set(key, [value])
  }
  if (old) {
    for (const item of old.items) push(identityKey({ ...item, kind: old.kind }), { id: item.id, episodesFetchedAt: item.episodesFetchedAt })
  }
  for (const row of legacy) push(identityKey(row), { legacyId: row.id, episodesFetchedAt: row.episodesFetchedAt })

  // 1ª passada: reserva os ids reaproveitados (um item novo nunca "rouba" o
  // slot de um que continua). 2ª: ids novos para quem entrou.
  const taken = new Set<number>()
  const matched = items.map((item) => {
    const prev = previous.get(identityKey({ ...item, kind: target.kind }))?.shift()
    if (prev?.id !== undefined && prev.id < 0) taken.add(prev.id)
    return prev
  })
  // Carimbos de episódios gravados na categoria (`storeSeriesEpisodes`, para
  // não regravar o bloco a cada série aberta) entram nos itens agora, que o
  // bloco é regravado de qualquer jeito — e o mapa da categoria é esvaziado.
  const stamps = category.seriesEpisodesFetchedAt
  const blockItems = items.map((item, index) => {
    const prev = matched[index]
    let id = prev?.id !== undefined && prev.id < 0 ? prev.id : undefined
    if (id === undefined) {
      id = blockItemId(target.categoryId, identityKey({ ...item, kind: target.kind }), taken)
      taken.add(id)
    }
    let fetchedAt = prev?.episodesFetchedAt ?? item.episodesFetchedAt
    const stamp = item.seriesId ? stamps?.[item.seriesId] : undefined
    if (stamp !== undefined && (fetchedAt === undefined || stamp > fetchedAt)) fetchedAt = stamp
    return toBlockItem(item, id, fetchedAt)
  })

  await database.categoryBlocks.put({
    categoryId: target.categoryId,
    sourceId: target.sourceId,
    generation: target.generation,
    kind: target.kind,
    groupOrder: target.groupOrder,
    items: blockItems,
  })
  if (legacy.length > 0) {
    await database.channels.bulkDelete(legacy.map((row) => row.id as number))
    // O id antigo continua levando ao item (tela aberta, pilha de navegação,
    // consulta em cache): `getChannel` consulta esta troca quando a linha some.
    const moves: Array<[number, number]> = []
    matched.forEach((prev, index) => {
      if (prev?.legacyId !== undefined) moves.push([prev.legacyId, blockItems[index].id])
    })
    noteMovedIds(database, moves)
  }
  await database.categories.update(target.categoryId, {
    itemsFetchedAt: now,
    itemsCount: items.length,
    itemsSignature: signature,
    seriesEpisodesFetchedAt: undefined,
  })
  return true
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

    const done = await database.transaction('rw', database.channels, database.categories, database.categoryBlocks, async () => {
      const current = await database.categories.get(categoryId)
      if (!current || (await database.categoryBlocks.where(':id').equals(categoryId).count()) > 0) return false
      const rows = await legacyRowsOf(database, target).toArray()
      if (rows.length === 0) return false
      // Mesma ordem que a leitura de linhas usava (`listChannels`).
      rows.sort((a, b) => {
        const pa = a.categoryPosition ?? Number.MAX_SAFE_INTEGER
        const pb = b.categoryPosition ?? Number.MAX_SAFE_INTEGER
        return pa - pb || (a.id ?? 0) - (b.id ?? 0)
      })
      await writeBlockWithin(target, rows, current.itemsFetchedAt ?? 0, database)
      // Converter não é renovar: o instante da última obtenção fica como estava.
      await database.categories.update(categoryId, { itemsFetchedAt: current.itemsFetchedAt })
      return true
    })
    if (done) options.onConverted?.(categoryId)
    converted += 1
  }
  return false
}
