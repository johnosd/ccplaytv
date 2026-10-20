/**
 * Codec do formato comprimido em pedaços (feature 082, `logic/formato-comprimido.md` §3).
 *
 * Medido na TV (sonda 2, 2026-10-18): a categoria de 11 347 filmes ocupa 3,62 MB como objetos (a TV não comprime) e
 * 0,61 MB em pedaços gzip de 500; o 1º pedaço abre em 13,8 ms (contra 178 ms do bloco inteiro). Comprimir na thread
 * principal congela até 250 ms — então codificar é trabalho de Worker ou de pedaço em pedaço, cedendo entre eles.
 *
 * Regras: nunca chamar dentro de uma transação Dexie aberta (await fora do IndexedDB encerra a transação); o formato
 * enxuto omite o que o bloco já diz (`shared`), `originalName` igual a `name` e chaves `undefined`, e a decodificação
 * devolve o mesmo objeto de antes.
 */
import type { BlockItem, BlockShared } from './blockTypes'

export type { BlockShared } from './blockTypes'

/** Itens por pedaço (decisão da sonda 2: 1º pedaço ≈ 13 ms; 250 dá 6,6 ms com +1 % de bytes). */
export const BLOCK_CHUNK_ITEMS = 500

/** Versão do índice de identidade: a 2 guarda a chave de `identityKey` (`categoryBlocks.ts`). */
export const IDENTITY_INDEX_VERSION = 2

export interface EncodedChunk {
  /** Posição do primeiro item do pedaço na categoria. */
  start: number
  count: number
  /** gzip do JSON enxuto dos itens. */
  bytes: Uint8Array
}

export interface IdentityIndex {
  v?: number
  ids: number[]
  keys: string[]
  episodesFetchedAt: (number | null)[]
}

type CompactItem = Record<string, unknown>

function shouldYield(): boolean {
  return typeof window !== 'undefined' && typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope === 'undefined'
}

/** Cede a vez à interface entre pedaços (`scheduler.yield` não existe na TV); dentro de Worker, não precisa. */
export function yieldToUi(): Promise<void> {
  if (!shouldYield()) return Promise.resolve()
  const schedulerApi = (globalThis as { scheduler?: { postTask?: (fn: () => void, options?: unknown) => Promise<void> } }).scheduler
  if (schedulerApi?.postTask) return schedulerApi.postTask(() => undefined, { priority: 'background' })
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * gzip de um texto. Lê a saída antes de escrever: no Chromium o `writer` pode ficar preso pelo backpressure se a
 * leitura só começar depois do `close()`. Não usa `Blob.stream()`, ausente no jsdom dos testes.
 */
export async function gzipText(text: string): Promise<Uint8Array> {
  const compressor = new CompressionStream('gzip')
  const writer = compressor.writable.getWriter()
  const output = new Response(compressor.readable).arrayBuffer()
  await writer.write(new TextEncoder().encode(text))
  await writer.close()
  return new Uint8Array(await output)
}

export async function gunzipText(bytes: Uint8Array): Promise<string> {
  const decompressor = new DecompressionStream('gzip')
  const writer = decompressor.writable.getWriter()
  const output = new Response(decompressor.readable).text()
  await writer.write(new Uint8Array(bytes))
  await writer.close()
  return output
}

/** O que todos os itens têm igual (só então sai de cada item); valor misto fica em cada item. */
export function sharedOf(items: readonly BlockItem[]): BlockShared {
  const shared: BlockShared = {}
  if (items.length === 0) return shared
  const group = items[0].group
  if (group !== undefined && items.every((item) => item.group === group)) shared.group = group
  const providerCategoryId = items[0].providerCategoryId
  if (providerCategoryId !== undefined && items.every((item) => item.providerCategoryId === providerCategoryId)) {
    shared.providerCategoryId = providerCategoryId
  }
  return shared
}

function compact(item: BlockItem, shared: BlockShared): CompactItem {
  const result: CompactItem = {}
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined) continue
    if (key === 'group' && shared.group !== undefined) continue
    if (key === 'providerCategoryId' && shared.providerCategoryId !== undefined) continue
    if (key === 'originalName' && value === item.name) continue
    result[key] = value
  }
  return result
}

function expand(item: CompactItem, shared: BlockShared): BlockItem {
  const result = { ...item } as BlockItem
  if (result.originalName === undefined) result.originalName = result.name
  // Só preenche o ausente: vale também para pedaços gravados antes de `sharedOf` exigir valor igual em todos.
  if (result.group === undefined && shared.group !== undefined) result.group = shared.group
  if (result.providerCategoryId === undefined && shared.providerCategoryId !== undefined) result.providerCategoryId = shared.providerCategoryId
  return result
}

export async function encodeBlockChunks(items: readonly BlockItem[], shared: BlockShared): Promise<EncodedChunk[]> {
  const chunks: EncodedChunk[] = []
  for (let start = 0; start < items.length; start += BLOCK_CHUNK_ITEMS) {
    const part = items.slice(start, start + BLOCK_CHUNK_ITEMS).map((item) => compact(item, shared))
    chunks.push({ start, count: part.length, bytes: await gzipText(JSON.stringify(part)) })
    await yieldToUi()
  }
  return chunks
}

export async function decodeBlockChunk(chunk: Pick<EncodedChunk, 'bytes'>, shared: BlockShared): Promise<BlockItem[]> {
  const compactItems = JSON.parse(await gunzipText(chunk.bytes)) as CompactItem[]
  return compactItems.map((item) => expand(item, shared))
}

/** Índice de identidade (ids, chaves e carimbos de episódios, na ordem da fonte): reaproveitar ids sem ler os pedaços. */
export async function encodeIdentityIndex(items: readonly BlockItem[], keyOf: (item: BlockItem) => string): Promise<Uint8Array> {
  const index: IdentityIndex = {
    v: IDENTITY_INDEX_VERSION,
    ids: items.map((item) => item.id),
    keys: items.map(keyOf),
    episodesFetchedAt: items.map((item) => item.episodesFetchedAt ?? null),
  }
  return gzipText(JSON.stringify(index))
}

export async function decodeIdentityIndex(bytes: Uint8Array): Promise<IdentityIndex> {
  return JSON.parse(await gunzipText(bytes)) as IdentityIndex
}
