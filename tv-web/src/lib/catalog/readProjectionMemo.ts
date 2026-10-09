import type { CatalogDb, CatalogReadItem } from './db'

/** Limite de retenção da janela derivada no contexto ativo. */
export const READ_PROJECTION_MEMO_MAX_CHUNKS = 8
export const READ_PROJECTION_MEMO_CHUNK_SIZE = 240

export interface ReadProjectionMemoContext {
  sourceId: string
  generation: number
  categoryId: number
  revision: string
}

interface MemoState {
  context?: ReadProjectionMemoContext
  chunks: Map<number, CatalogReadItem[]>
}

// O WeakMap separa bancos abertos e evita que um banco descartado fique vivo
// por causa de uma referência global ao seu conteúdo de projeção.
const states = new WeakMap<object, MemoState>()

function sameContext(left: ReadProjectionMemoContext | undefined, right: ReadProjectionMemoContext): boolean {
  return Boolean(
    left &&
      left.sourceId === right.sourceId &&
      left.generation === right.generation &&
      left.categoryId === right.categoryId &&
      left.revision === right.revision,
  )
}

function stateFor(database: CatalogDb, context: ReadProjectionMemoContext): MemoState {
  let state = states.get(database)
  if (!state) {
    state = { chunks: new Map() }
    states.set(database, state)
  }
  // Uma troca de fonte, geração, categoria ou revisão abandona imediatamente
  // as páginas anteriores. Assim, o cache nunca vira um segundo catálogo.
  if (!sameContext(state.context, context)) {
    state.context = { ...context }
    state.chunks.clear()
  }
  return state
}

/** Retorna um chunk apenas quando ele pertence ao contexto ainda vigente. */
export function getReadProjectionMemoChunk(
  database: CatalogDb,
  context: ReadProjectionMemoContext,
  chunk: number,
): CatalogReadItem[] | undefined {
  const state = states.get(database)
  if (!state || !sameContext(state.context, context)) return undefined
  const items = state.chunks.get(chunk)
  if (!items) return undefined
  // Map insertion order funciona como LRU sem outra estrutura de retenção.
  state.chunks.delete(chunk)
  state.chunks.set(chunk, items)
  return items
}

/** Guarda um chunk, mantendo no máximo oito páginas de 240 itens. */
export function setReadProjectionMemoChunk(
  database: CatalogDb,
  context: ReadProjectionMemoContext,
  chunk: number,
  items: CatalogReadItem[],
): void {
  if (!Number.isInteger(chunk) || chunk < 0) return
  const state = stateFor(database, context)
  state.chunks.delete(chunk)
  state.chunks.set(chunk, items)
  while (state.chunks.size > READ_PROJECTION_MEMO_MAX_CHUNKS) {
    const oldest = state.chunks.keys().next().value
    if (oldest === undefined) break
    state.chunks.delete(oldest)
  }
}

/** Invalida o banco; contexto opcional evita limpar uma revisão substituta. */
export function invalidateReadProjectionMemo(
  database: CatalogDb,
  context?: ReadProjectionMemoContext,
): void {
  const state = states.get(database)
  if (!state) return
  if (context && !sameContext(state.context, context)) return
  states.delete(database)
}

/** Diagnóstico leve para conferir o limite sem expor os itens. */
export function readProjectionMemoChunkCount(database: CatalogDb): number {
  return states.get(database)?.chunks.size ?? 0
}

