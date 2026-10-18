/**
 * Codec do formato comprimido em pedaços (feature 082, `logic/formato-comprimido.md`).
 *
 * Medido na TV (sonda 2, 2026-10-18): a categoria de 11 347 filmes ocupa 3,62 MB como objetos (a TV não comprime) e
 * 0,61 MB em pedaços gzip de 500; o 1º pedaço abre em 13,8 ms (contra 178 ms do bloco inteiro). Comprimir na thread
 * principal congela até 250 ms — então codificar é trabalho de Worker ou de pedaço em pedaço, cedendo entre eles.
 *
 * Regras: nunca chamar dentro de uma transação Dexie aberta (await fora do IndexedDB encerra a transação); o formato
 * enxuto omite o que o bloco já diz (`group`, `providerCategoryId`), `originalName` igual a `name` e chaves `undefined`.
 *
 * STUB do sdd-plan: o sdd-execute implementa.
 */
import type { BlockItem } from './db'

/** Itens por pedaço (decisão da sonda 2: 1º pedaço ≈ 13 ms; 250 dá 6,6 ms com +1 % de bytes). */
export const BLOCK_CHUNK_ITEMS = 500

export interface EncodedChunk {
  /** Posição do primeiro item do pedaço na categoria. */
  start: number
  count: number
  /** gzip do JSON enxuto dos itens. */
  bytes: Uint8Array
}

export interface BlockShared {
  group?: string
  providerCategoryId?: string
}

type CompactItem = Record<string, unknown>

function shouldYield(): boolean {
  return typeof window !== 'undefined' && typeof WorkerGlobalScope === 'undefined'
}

function yieldToUi(): Promise<void> {
  if (!shouldYield()) return Promise.resolve()
  const schedulerApi = (globalThis as typeof globalThis & { scheduler?: { postTask?: (fn: () => void, options?: unknown) => Promise<void> } }).scheduler
  if (schedulerApi?.postTask) return schedulerApi.postTask(() => undefined, { priority: 'background' })
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function compact(item: BlockItem, shared: BlockShared): CompactItem {
  const result: CompactItem = {}
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined || (key === 'group' && value === shared.group) || (key === 'providerCategoryId' && value === shared.providerCategoryId)) continue
    if (key === 'originalName' && value === item.name) continue
    result[key] = value
  }
  return result
}

function expand(item: CompactItem, shared: BlockShared): BlockItem {
  const result = { ...item } as BlockItem
  if (result.originalName === undefined) result.originalName = result.name
  if (result.group === undefined && shared.group !== undefined) result.group = shared.group
  if (result.providerCategoryId === undefined && shared.providerCategoryId !== undefined) result.providerCategoryId = shared.providerCategoryId
  return result
}

export async function encodeBlockChunks(items: readonly BlockItem[], shared: BlockShared): Promise<EncodedChunk[]> {
  const chunks: EncodedChunk[] = []
  for (let start = 0; start < items.length; start += BLOCK_CHUNK_ITEMS) {
    const part = items.slice(start, start + BLOCK_CHUNK_ITEMS).map((item) => compact(item, shared))
    chunks.push({ start, count: part.length, bytes: await gzip(JSON.stringify(part)) })
    await yieldToUi()
  }
  return chunks
}

export async function decodeBlockChunk(chunk: Pick<EncodedChunk, 'bytes'>, shared: BlockShared): Promise<BlockItem[]> {
  const compactItems = JSON.parse(await gunzip(chunk.bytes)) as CompactItem[]
  return compactItems.map((item) => expand(item, shared))
}

export async function encodeIdentityIndex(items: readonly BlockItem[]): Promise<Uint8Array> {
  return gzip(JSON.stringify({
    ids: items.map((item) => item.id),
    keys: items.map((item) => item.providerStreamId ?? item.seriesId ?? item.originalName),
    episodesFetchedAt: items.map((item) => item.episodesFetchedAt ?? null),
  }))
}

export async function decodeIdentityIndex(bytes: Uint8Array): Promise<{ ids: number[]; keys: string[]; episodesFetchedAt: (number | null)[] }> {
  return JSON.parse(await gunzip(bytes)) as { ids: number[]; keys: string[]; episodesFetchedAt: (number | null)[] }
}
