/**
 * Memória (nunca disco) em volta de `categoryBlocks` — feature 039, correções
 * do code review:
 *
 * 1. **Cache curto de blocos lidos.** Abrir um detalhe chama `getChannel` 3–4
 *    vezes (item, metadados, URL de reprodução, episódios), e cada chamada lia o
 *    bloco inteiro da categoria (até 11 mil itens) só para achar um item. Os
 *    últimos blocos lidos ficam aqui, com um índice id → posição. Qualquer
 *    escrita na tabela (por qualquer caminho: `put`, `delete`, faixa) esvazia o
 *    cache — o middleware do Dexie em `db.ts` avisa — e um bloco só entra no
 *    cache se nenhuma escrita estava pendente nem começou durante a leitura,
 *    então nunca guarda um estado que não foi (ou não será) gravado.
 *
 * 2. **Ids de linhas antigas que viraram bloco.** A conversão do formato antigo
 *    (`convertLegacyCategories`) troca o id de cada item (positivo → negativo) e
 *    apaga as linhas. Quem já tinha o id antigo em memória (uma tela aberta, a
 *    pilha de navegação, uma consulta em cache) continua achando o item: a
 *    troca fica registrada aqui, pela vida da sessão — o mesmo tempo de vida de
 *    tudo que poderia guardar o id antigo.
 */

import type { CategoryBlockRecord } from './db'

/** Quantos blocos ficam em memória (a categoria aberta e o detalhe dela, em geral o mesmo). */
const CACHE_MAX = 2
/** Limite global de itens descomprimidos em cache (~14 MiB na TV, medição 082). */
export const DECOMPRESSED_ITEM_CACHE_LIMIT = 30_000
const CACHE_MAX_ITEMS = DECOMPRESSED_ITEM_CACHE_LIMIT

interface Memo {
  epoch: number
  pendingWrites: number
  blocks: Map<number, CategoryBlockRecord>
}

const memos = new WeakMap<object, Memo & { foreignSeen: number }>()

/**
 * Escritas feitas em OUTRO contexto (o Worker da carga por seção grava blocos
 * no mesmo IndexedDB): chegam por `BroadcastChannel` e esvaziam todo cache
 * deste contexto. Só um aviso, nunca dado.
 */
const foreignEpochs = new Map<string, number>()
const channel: BroadcastChannel | undefined =
  typeof BroadcastChannel === 'function' ? new BroadcastChannel('ccplaytv-category-blocks') : undefined
if (channel) {
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as { databaseName?: unknown; moves?: unknown } | undefined
    if (data && typeof data.databaseName === 'string' && Array.isArray(data.moves)) {
      applyMoves(data.databaseName, data.moves as Array<[number, number]>)
      return
    }
    if (data && typeof data.databaseName === 'string') foreignEpochs.set(data.databaseName, (foreignEpochs.get(data.databaseName) ?? 0) + 1)
  }
  // Node (testes): o canal não pode segurar o processo aberto.
  ;(channel as unknown as { unref?: () => void }).unref?.()
}

function memoOf(database: object): Memo {
  let memo = memos.get(database)
  if (!memo) {
    memo = { epoch: 0, pendingWrites: 0, blocks: new Map(), foreignSeen: foreignEpochs.get((database as { name?: string }).name ?? '') ?? 0 }
    memos.set(database, memo)
  }
  const foreignEpoch = foreignEpochs.get((database as { name?: string }).name ?? '') ?? 0
  if (memo.foreignSeen !== foreignEpoch) {
    memo.foreignSeen = foreignEpoch
    memo.epoch += 1
    memo.blocks.clear()
  }
  return memo
}

const transactionsSeen = new WeakSet<object>()

/**
 * Chamado pelo middleware a cada escrita em `categoryBlocks`. Esvazia o cache e
 * o mantém desligado até a transação terminar (gravada ou desfeita).
 */
export function noteBlockWrite(database: object, transaction: unknown): void {
  const memo = memoOf(database)
  memo.epoch += 1
  memo.blocks.clear()
  const tx = transaction as { addEventListener?: (type: string, listener: () => void) => void } | null
  if (!tx || typeof tx.addEventListener !== 'function' || transactionsSeen.has(tx)) return
  transactionsSeen.add(tx)
  memo.pendingWrites += 1
  let settled = false
  const settle = () => {
    if (settled) return
    settled = true
    memo.pendingWrites -= 1
    memo.epoch += 1
    memo.blocks.clear()
  }
  tx.addEventListener('complete', () => {
    settle()
    channel?.postMessage({ databaseName: (database as { name?: string }).name })
  })
  tx.addEventListener('abort', settle)
  tx.addEventListener('error', settle)
}

/**
 * Lê um bloco pela chave, pelo cache quando possível. O objeto devolvido é
 * compartilhado — quem chama nunca o altera.
 */
export async function readBlock(
  database: { categoryBlocks: { get(key: number): PromiseLike<CategoryBlockRecord | undefined> } },
  categoryId: number,
  inTransaction: boolean,
): Promise<CategoryBlockRecord | undefined> {
  const memo = memoOf(database)
  const cached = memo.blocks.get(categoryId)
  if (cached && !inTransaction) {
    // Mais recente por último (LRU simples).
    memo.blocks.delete(categoryId)
    memo.blocks.set(categoryId, cached)
    return cached
  }
  const epoch = memo.epoch
  const pendingBefore = memo.pendingWrites
  const block = await database.categoryBlocks.get(categoryId)
  // `memoOf` de novo: aplica um aviso de outro contexto que chegou durante a leitura.
  memoOf(database)
  if (block && (block.items ?? []).length <= CACHE_MAX_ITEMS && !inTransaction && pendingBefore === 0 && memo.pendingWrites === 0 && memo.epoch === epoch) {
    memo.blocks.set(categoryId, block)
    const itemCount = () => [...memo.blocks.values()].reduce((total, value) => total + (value.items ?? []).length, 0)
    while (memo.blocks.size > CACHE_MAX || itemCount() > CACHE_MAX_ITEMS) {
      const oldest = memo.blocks.keys().next().value as number
      memo.blocks.delete(oldest)
    }
  }
  return block
}

const indexes = new WeakMap<CategoryBlockRecord, Map<number, number>>()

/** Posição de um item no bloco pelo id, com um índice montado uma vez por bloco lido. */
export function blockItemIndex(block: CategoryBlockRecord, id: number): number {
  let index = indexes.get(block)
  if (!index) {
    index = new Map()
    ;(block.items ?? []).forEach((item, position) => index!.set(item.id, position))
    indexes.set(block, index)
  }
  return index.get(id) ?? -1
}

/** Trocas de id por banco (pelo nome: o Worker e a tela abrem instâncias diferentes do mesmo banco). */
const movedByDatabase = new Map<string, Map<number, number>>()

function applyMoves(databaseName: string, moves: ReadonlyArray<readonly [number, number]>): void {
  let moved = movedByDatabase.get(databaseName)
  if (!moved) {
    moved = new Map()
    movedByDatabase.set(databaseName, moved)
  }
  for (const [from, to] of moves) moved.set(from, to)
}

/**
 * A conversão trocou o id de linhas antigas pelos ids dos itens no bloco. Vale
 * neste contexto e é avisado aos outros (a renovação pode rodar no Worker) —
 * só números, nunca dado do item.
 */
export function noteMovedIds(database: { name: string }, moves: ReadonlyArray<readonly [number, number]>): void {
  if (moves.length === 0) return
  applyMoves(database.name, moves)
  channel?.postMessage({ databaseName: database.name, moves })
}

/** Id do item no bloco para um id de linha antiga já convertida; `undefined` se não houve troca. */
export function movedIdOf(database: { name: string }, id: number): number | undefined {
  return movedByDatabase.get(database.name)?.get(id)
}
