/**
 * Gravação do formato comprimido em pedaços (feature 082, `logic/formato-comprimido.md` §4), em duas fases:
 *
 * 1. **fora da transação** (`prepareBlockWrite`): lê o cabeçalho e o índice de identidade antigos (ou o bloco/linhas do
 *    formato anterior), calcula os ids com a mesma regra da 038/039 e codifica pedaços e índice;
 * 2. **dentro de uma transação `rw`** (`commitBlockWrite`, só banco): confere a `revision`, troca pedaços e cabeçalho,
 *    apaga as linhas antigas e a projeção 065 da categoria e carimba a categoria.
 *
 * Se outra gravação da mesma categoria passou entre as fases, a 2ª refaz a fase 1 (até 2 vezes). É o único caminho que
 * grava itens de categoria: nunca há bloco com `items` novo, nem projeção 065 nova (D-004).
 */
import type { BlockItem, CatalogDb, CatalogRecord, CategoryBlockRecord, CategoryRecord } from './db'
import { blockItemId, identityKey, itemsSignature, legacyRowsOf, type BlockTarget } from './categoryBlocks'
import { encodeBlockChunks, encodeIdentityIndex, sharedOf } from './blockCodec'
import { categoryChunks, IDENTITY_CHUNK, type CategoryChunkRecord } from './chunkTables'
import { pickCandidates, writeCandidates, type ShowcaseCandidates } from './showcaseCandidates'
import { forgetCachedChunks, readHeaderChunks, readIdentityIndex } from './blockChunks'
import { noteMovedIds } from './blockMemo'
import { invalidateCategoryReadModel } from './readProjection'

/** Bytes do cabeçalho e da linha da categoria na conta própria (medição da 082: ~200 B de JSON cada). */
const HEADER_BYTES = 256

export interface PreparedBlock {
  target: BlockTarget
  /** Estado do cabeçalho lido na fase 1 (`revision`, `'legacy'` ou `'none'`): a fase 2 confere. */
  expected: string
  header: CategoryBlockRecord
  rows: CategoryChunkRecord[]
  legacyIds: number[]
  moves: Array<[number, number]>
  signature: string
  storedBytes: number
  /**
   * Feature 086 (FR-003): os candidatos das fileiras desta categoria, escolhidos **aqui**, onde os itens já estão em
   * mãos. Guardamos os candidatos (~60 itens) e **nunca** o bloco inteiro (~1 300): retê-lo custou 8× na carga de
   * séries na TV (R-014). `undefined` para `channel`, que não tem fileiras calculadas.
   */
  candidates?: ShowcaseCandidates
}

export interface BlockWriteOptions {
  /** Conversão de formato: regrava mesmo com assinatura igual e mantém `itemsFetchedAt`/`itemsSignature`. */
  convert?: boolean
  /** Chamado com os bytes codificados antes da transação; `false` = não há espaço (orçamento, `makeRoomFor`). */
  room?: (needBytes: number) => Promise<boolean>
  /**
   * Feature 086 (FR-003): recebe os candidatos em vez de gravá-los aqui. Quem carrega uma seção inteira junta os de
   * todas as categorias e grava **uma vez**, no fim — uma transação por categoria custou 34 transações extras numa
   * carga de filmes (R-014). Sem isto, a gravação acontece na hora, que é o certo para uma categoria só.
   */
  collectCandidates?: (candidates: ShowcaseCandidates) => void
  /**
   * Feature 086 (T080): recebe o tempo de cada etapa da gravação (`prevId`, `assign`, `shared`, `chunks`, `identity`,
   * `pick`, `tx`). Só para medir — sem ela, nada é cronometrado.
   */
  onStage?: (stage: string, ms: number) => void
}

export class BlockRevisionConflict extends Error {}

/** Tabelas que `commitBlockWrite` toca — quem abre a transação inclui todas. */
export function blockWriteTables(database: CatalogDb) {
  return [database.channels, database.categories, database.categoryBlocks, database.catalogReadManifests,
    database.catalogReadChunks, categoryChunks(database)]
}

function headerState(block: CategoryBlockRecord | undefined): string {
  if (!block) return 'none'
  return block.revision ?? 'legacy'
}

interface Previous { id?: number; legacyId?: number; episodesFetchedAt?: number }

/** Identidades da gravação anterior, em ordem (nomes repetidos do M3U casam em ordem). */
async function previousIdentities(database: CatalogDb, target: BlockTarget, old: CategoryBlockRecord | undefined) {
  const previous = new Map<string, Previous[]>()
  const push = (key: string, value: Previous) => {
    const queue = previous.get(key)
    if (queue) queue.push(value)
    else previous.set(key, [value])
  }
  let legacy: CatalogRecord[] = []
  if (old?.format === 2) {
    const index = await readIdentityIndex(database, old)
    if (index?.v === 2) {
      index.keys.forEach((key, position) => push(key, { id: index.ids[position], episodesFetchedAt: index.episodesFetchedAt[position] ?? undefined }))
    } else {
      for (const item of await readHeaderChunks(database, old)) push(identityKey(item), { id: item.id, episodesFetchedAt: item.episodesFetchedAt })
    }
  } else if (old) {
    for (const item of old.items ?? []) push(identityKey({ ...item, kind: old.kind }), { id: item.id, episodesFetchedAt: item.episodesFetchedAt })
  } else {
    legacy = await legacyRowsOf(database, target).sortBy('id')
    for (const row of legacy) push(identityKey(row), { legacyId: row.id, episodesFetchedAt: row.episodesFetchedAt })
  }
  return { previous, legacy }
}

/** Ids dos itens (mesma regra de antes da 082): quem continua reaproveita o id; quem entrou ganha `blockItemId`. */
function assignBlockItems(target: BlockTarget, items: readonly CatalogRecord[], previous: Map<string, Previous[]>,
  stamps: CategoryRecord['seriesEpisodesFetchedAt']) {
  // 1ª passada: reserva os ids reaproveitados (um item novo nunca "rouba" o slot de um que continua). 2ª: ids novos.
  const taken = new Set<number>()
  const matched = items.map((item) => {
    const prev = previous.get(identityKey({ ...item, kind: target.kind }))?.shift()
    if (prev?.id !== undefined && prev.id < 0) taken.add(prev.id)
    return prev
  })
  const moves: Array<[number, number]> = []
  const blockItems = items.map((item, index): BlockItem => {
    const prev = matched[index]
    let id = prev?.id !== undefined && prev.id < 0 ? prev.id : undefined
    if (id === undefined) {
      id = blockItemId(target.categoryId, identityKey({ ...item, kind: target.kind }), taken)
      taken.add(id)
    }
    if (prev?.legacyId !== undefined) moves.push([prev.legacyId, id])
    // Carimbo de episódios gravado na categoria (`storeSeriesEpisodes`) entra no item agora, que ele é regravado.
    let fetchedAt = prev?.episodesFetchedAt ?? item.episodesFetchedAt
    const stamp = item.seriesId ? stamps?.[item.seriesId] : undefined
    if (stamp !== undefined && (fetchedAt === undefined || stamp > fetchedAt)) fetchedAt = stamp
    const { id: _id, sourceId: _s, generation: _g, kind: _k, groupOrder: _o, categoryId: _c, categoryPosition: _p, ...fields } = item
    void _id; void _s; void _g; void _k; void _o; void _c; void _p
    return { ...fields, id, episodesFetchedAt: fetchedAt }
  })
  return { blockItems, moves }
}

/**
 * Fase 1 (fora de transação; pode descomprimir e comprimir). `'unchanged'` = mesma assinatura e contagem (só carimbar);
 * `'missing'` = a categoria saiu enquanto a busca voava (não grava órfãos).
 */
export async function prepareBlockWrite(target: BlockTarget, items: readonly CatalogRecord[], database: CatalogDb,
  options: BlockWriteOptions = {}): Promise<PreparedBlock | 'unchanged' | 'missing'> {
  const category = await database.categories.get(target.categoryId)
  if (!category) return 'missing'
  const signature = itemsSignature(items as CatalogRecord[])
  const old = await database.categoryBlocks.get(target.categoryId)
  const oldCount = old ? (old.format === 2 ? (old.count ?? 0) : (old.items ?? []).length) : undefined
  if (!options.convert && old && category.itemsSignature === signature && oldCount === items.length) return 'unchanged'

  // Medição por etapa (feature 086, T080): o `encodeMs` da carga por seção cobre tudo isto de uma vez, e na TV ele
  // saltou de 1 262 para ~8 300 ms em filmes sem que se soubesse qual etapa cresceu. Só números, e só quando pedido.
  const stage = options.onStage
  const timed = async <T>(name: string, run: () => T | Promise<T>): Promise<T> => {
    if (!stage) return run()
    const at = performance.now()
    try { return await run() } finally { stage(name, performance.now() - at) }
  }

  const { previous, legacy } = await timed('prevId', () => previousIdentities(database, target, old))
  const { blockItems, moves } = await timed('assign', () => assignBlockItems(target, items, previous, category.seriesEpisodesFetchedAt))
  const shared = await timed('shared', () => sharedOf(blockItems))
  const encoded = await timed('chunks', () => encodeBlockChunks(blockItems, shared))
  const identity = await timed('identity', () => encodeIdentityIndex(blockItems, (item) => identityKey({ ...item, kind: target.kind })))
  const revision = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const storedBytes = encoded.reduce((sum, chunk) => sum + chunk.bytes.byteLength, identity.byteLength + HEADER_BYTES)
  const owner = { categoryId: target.categoryId, sourceId: target.sourceId, generation: target.generation, revision }
  const rows: CategoryChunkRecord[] = [
    { ...owner, chunk: IDENTITY_CHUNK, start: 0, count: blockItems.length, bytes: identity },
    ...encoded.map((chunk, index) => ({ ...owner, chunk: index, start: chunk.start, count: chunk.count, bytes: chunk.bytes, shared })),
  ]
  const header: CategoryBlockRecord = { ...target, format: 2, shared, count: blockItems.length, chunkCount: encoded.length,
    storedBytes, revision }
  // Feature 086 (FR-003/R-013): escolhidos com os itens que já estão em mãos, sem nenhuma leitura extra. `now` do
  // parâmetro é o carimbo de obtenção da categoria; a régua de ano de "Bem avaliados" compara com o ano CORRENTE,
  // então aqui vai `Date.now()` (`logic/selecoes-guardadas.md` §3).
  const rowKind: 'movie' | 'series' | undefined =
    target.kind === 'movie' ? 'movie' : target.kind === 'series' ? 'series' : undefined
  const candidates = rowKind === undefined
    ? undefined
    : await timed('pick', () => pickCandidates({ ...target, kind: rowKind, order: category.order }, blockItems, Date.now()))
  return { target, expected: headerState(old), header, rows, legacyIds: legacy.map((row) => row.id as number), moves,
    signature, storedBytes, candidates }
}

/** Fase 2: roda **dentro** de uma transação `rw` com `blockWriteTables`. Só banco — nada de compressão aqui. */
export async function commitBlockWrite(prepared: PreparedBlock, now: number, database: CatalogDb, options: BlockWriteOptions = {}): Promise<boolean> {
  const id = prepared.target.categoryId
  if (headerState(await database.categoryBlocks.get(id)) !== prepared.expected) throw new BlockRevisionConflict()
  const category = await database.categories.get(id)
  if (!category) return false
  const chunks = categoryChunks(database)
  await chunks.where('[categoryId+chunk]').between([id, IDENTITY_CHUNK], [id, Number.MAX_SAFE_INTEGER], true, true).delete()
  await chunks.bulkPut(prepared.rows)
  await database.categoryBlocks.put(prepared.header)
  if (prepared.legacyIds.length > 0) {
    await database.channels.bulkDelete(prepared.legacyIds)
    // O id antigo continua levando ao item (tela aberta, pilha, cache): `getChannel` consulta esta troca.
    noteMovedIds(database, prepared.moves)
  }
  await database.categories.update(id, {
    itemsFetchedAt: options.convert ? category.itemsFetchedAt : now,
    itemsCount: prepared.header.count,
    itemsSignature: options.convert ? (category.itemsSignature ?? prepared.signature) : prepared.signature,
    seriesEpisodesFetchedAt: undefined,
    storedBytes: prepared.storedBytes,
  })
  // A projeção 065 é uma 2ª cópia: os pedaços já dão a janela (D-004).
  await invalidateCategoryReadModel(id, database)
  return true
}

/**
 * Grava (ou renova) os itens de uma categoria no formato comprimido, em transação própria. `storageFull` = o orçamento
 * (`options.room`) recusou; nada foi gravado.
 */
export async function writeCompressedBlock(target: BlockTarget, items: readonly CatalogRecord[], now: number, database: CatalogDb,
  options: BlockWriteOptions = {}): Promise<{ written: boolean; storageFull?: boolean }> {
  for (let attempt = 0; ; attempt += 1) {
    const prepared = await prepareBlockWrite(target, items, database, options)
    if (prepared === 'missing') return { written: false }
    if (prepared === 'unchanged') {
      await database.categories.update(target.categoryId, { itemsFetchedAt: now })
      return { written: false }
    }
    if (options.room && !(await options.room(prepared.storedBytes))) return { written: false, storageFull: true }
    try {
      const txAt = performance.now()
      const written = await database.transaction('rw', blockWriteTables(database), () => commitBlockWrite(prepared, now, database, options))
      options.onStage?.('tx', performance.now() - txAt)
      forgetCachedChunks(database, target.categoryId)
      // Feature 086 (FR-003): os candidatos já saíram da codificação (`prepareBlockWrite`). Quem carrega uma seção
      // junta e grava uma vez no fim; sem coletor, grava aqui mesmo. Falha aqui nunca derruba a gravação do catálogo.
      if (written && prepared.candidates) {
        if (options.collectCandidates) options.collectCandidates(prepared.candidates)
        else await writeCandidates(prepared.candidates, database).catch(() => undefined)
      }
      return { written }
    } catch (error) {
      if (error instanceof BlockRevisionConflict && attempt < 2) continue
      throw error
    }
  }
}
