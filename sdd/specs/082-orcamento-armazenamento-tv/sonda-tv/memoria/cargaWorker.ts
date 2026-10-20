// Worker da sonda: carga da seção de filmes com o código REAL do app (assessment leitura-rede-fluxo-tv, 2026-10-19).
// `empacotar.mjs` gera `../app2/cargaWorker.js`. A resposta vem do coletor (`/amostra/vodraw.json`); a credencial do
// banco é fictícia e o `fetchImpl` ignora a URL montada, então nada sai para um provedor. Devolve só números.
import { CatalogDb } from '../../../../../tv-web/src/lib/catalog/db'
import { storeCategories } from '../../../../../tv-web/src/lib/catalog/repository/categories'
import { loadSection } from '../../../../../tv-web/src/lib/catalog/sectionLoader'
import { readJsonArrayStream } from '../../../../../tv-web/src/lib/catalog/jsonArrayStream'
import { mapVodEntry, type LiveCategory } from '../../../../../tv-web/src/lib/catalog/xtreamConnector'
import { listCategories } from '../../../../../tv-web/src/lib/catalog/repository/categories'
import { clearStagedItems, stageSectionItems, stagedItemsOf } from '../../../../../tv-web/src/lib/catalog/repository/staging'
import { toItemRecord } from '../../../../../tv-web/src/lib/catalog/categoryItemRecord'
import { blockWriteTables, commitBlockWrite, prepareBlockWrite } from '../../../../../tv-web/src/lib/catalog/blockWrite'
import { forgetCachedChunks } from '../../../../../tv-web/src/lib/catalog/blockChunks'
import { makeRoomFor } from '../../../../../tv-web/src/lib/catalog/storageBudget'
import type { CatalogRecord } from '../../../../../tv-web/src/lib/catalog/db'

const SOURCE_ID = 'sonda-carga'
const DB_NAME = 'sonda-carga'
const CATEGORIES = 35
const COALESCE_BYTES = 256 * 1024

const scope = self as unknown as { postMessage(message: unknown): void; onmessage: ((event: MessageEvent) => void) | null }
const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10

/** Junta os pedaços da rede em blocos de pelo menos `size` bytes. */
function coalesce(size = COALESCE_BYTES): TransformStream<Uint8Array, Uint8Array> {
  let parts: Uint8Array[] = []
  let length = 0
  const emit = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (length === 0) return
    const out = new Uint8Array(length)
    let offset = 0
    for (const part of parts) { out.set(part, offset); offset += part.length }
    controller.enqueue(out)
    parts = []
    length = 0
  }
  return new TransformStream({
    transform(chunk, controller) { parts.push(chunk); length += chunk.length; if (length >= size) emit(controller) },
    flush(controller) { emit(controller) },
  })
}

const categoryMap = new Map<string, LiveCategory>(Array.from({ length: CATEGORIES }, (_, index) => {
  const id = String(1000 + index)
  return [id, { id, name: `Categoria ${index}`, order: index }]
}))

async function parseCount(body: ReadableStream<Uint8Array>): Promise<{ items: number; chunks: number }> {
  let items = 0
  let chunks = 0
  await readJsonArrayStream(body, (raw) => { if (mapVodEntry(raw, categoryMap, () => undefined)) items += 1 }, undefined, async () => { chunks += 1 })
  return { items, chunks }
}

async function prepare(): Promise<{ database: CatalogDb; ids: number[] }> {
  await CatalogDb.delete(DB_NAME)
  const database = new CatalogDb(DB_NAME)
  await database.open()
  await database.sources.add({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Sonda', connectionState: 'synced',
    providerDns: 'http://sonda.invalid', providerUsername: 'sonda', providerPassword: 'sonda',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 } as never)
  const ids = await storeCategories(Array.from({ length: CATEGORIES }, (_, index) => ({ sourceId: SOURCE_ID, generation: 1,
    kind: 'movie' as const, fetchMode: 'on_demand' as const, providerCategoryId: String(1000 + index), name: `Categoria ${index}`,
    order: index })), database)
  return { database, ids }
}

/**
 * Mesma sequência de `loadSection` (sectionLoader.ts), com as funções reais, cronometrando cada etapa (assessment
 * gravacao-carga-secao-tv). Sem o portão `waitUntilAllowed` (na sonda ninguém navega). `renewCategoryItems` =
 * `writeCompressedBlock` = preparar → orçamento → transação(commit) → esquecer cache, como abaixo.
 */
async function sectionStages(url: string): Promise<Record<string, unknown>> {
  const { database, ids } = await prepare()
  const t: Record<string, number> = { lerInterpretar: 0, descarregarPreparo: 0, lerPreparo: 0, prepararComprimir: 0, orcamento: 0,
    transacao: 0, limparPreparo: 0 }
  const lap = async <T>(key: string, fn: () => Promise<T>): Promise<T> => { const t0 = performance.now(); try { return await fn() } finally { t[key] += performance.now() - t0 } }
  const total0 = performance.now()
  const categories = (await listCategories(SOURCE_ID, 'movie', database)).filter((category) => ids.includes(category.id))
  const byProviderId = new Map(categories.map((category) => [category.providerCategoryId as string, category]))
  const groups = new Map<number, CatalogRecord[]>(categories.map((category) => [category.id, []]))
  const staged = new Set<number>()
  let buffered = 0
  const flush = async () => {
    const parts: Array<{ sourceId: string; categoryId: number; items: CatalogRecord[] }> = []
    for (const [categoryId, items] of groups) {
      if (items.length === 0) continue
      parts.push({ sourceId: SOURCE_ID, categoryId, items }); staged.add(categoryId); groups.set(categoryId, [])
    }
    buffered = 0
    await stageSectionItems(parts, database)
  }
  const readStart = performance.now()
  let flushTime = 0
  await readJsonArrayStream((await fetch(url, { cache: 'no-store' })).body!, (raw) => {
    const category = byProviderId.get(String(raw.category_id))
    if (!category) return
    const item = mapVodEntry(raw, categoryMap, () => undefined)
    if (!item) return
    groups.get(category.id)?.push(toItemRecord(item, SOURCE_ID, 1, category))
    buffered += 1
  }, undefined, async () => {
    if (buffered < 20_000) return
    const f0 = performance.now(); await flush(); flushTime += performance.now() - f0
  })
  t.descarregarPreparo = flushTime
  t.lerInterpretar = performance.now() - readStart - flushTime
  const perCategory: number[] = []
  for (const category of categories) {
    const c0 = performance.now()
    const rest = groups.get(category.id) ?? []
    const items = staged.has(category.id) ? [...(await lap('lerPreparo', () => stagedItemsOf(SOURCE_ID, category.id, database))), ...rest] : rest
    const target = { sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, categoryId: category.id, groupOrder: category.order }
    const prepared = await lap('prepararComprimir', () => prepareBlockWrite(target, items, database))
    if (prepared !== 'missing' && prepared !== 'unchanged') {
      await lap('orcamento', () => makeRoomFor(SOURCE_ID, prepared.storedBytes, { database, mode: 'prefetch', protectCategoryId: category.id }))
      await lap('transacao', () => database.transaction('rw', blockWriteTables(database), () => commitBlockWrite(prepared, Date.now(), database)))
      forgetCachedChunks(database, category.id)
    }
    groups.delete(category.id)
    if (staged.has(category.id)) await lap('limparPreparo', () => clearStagedItems(SOURCE_ID, category.id, database))
    perCategory.push(performance.now() - c0)
  }
  const out: Record<string, unknown> = { ms: Math.round(performance.now() - total0), categorias: categories.length,
    piorCategoriaMs: Math.round(Math.max(...perCategory)), preparoUsado: staged.size }
  for (const key of Object.keys(t)) out[key] = Math.round(t[key])
  // Quanto do orçamento é a estimativa do navegador (chamada uma vez por categoria dentro de `makeRoomFor`).
  const e0 = performance.now()
  for (let index = 0; index < categories.length; index += 1) await navigator.storage.estimate()
  out.estimativa35xMs = Math.round(performance.now() - e0)
  database.close()
  await CatalogDb.delete(DB_NAME)
  return out
}

async function variant(name: string, url: string): Promise<Record<string, unknown>> {
  if (name === 'secaoEtapas') return sectionStages(url)
  const t0 = performance.now()
  if (name === 'download') {
    const bytes = (await (await fetch(url, { cache: 'no-store' })).arrayBuffer()).byteLength
    return { ms: ms(t0), bytes }
  }
  if (name === 'fluxoPuro') {
    const reader = (await fetch(url, { cache: 'no-store' })).body!.getReader()
    let chunks = 0
    for (;;) { const part = await reader.read(); if (part.done) break; chunks += 1 }
    return { ms: ms(t0), chunks }
  }
  // O tempo é lido depois do `await` (num literal `{ ms: ms(t0), ...(await …) }` ele seria lido antes).
  if (name === 'fluxoInterpretar') {
    const counted = await parseCount((await fetch(url, { cache: 'no-store' })).body!)
    return { ms: ms(t0), ...counted }
  }
  if (name === 'juntadoInterpretar') {
    const counted = await parseCount((await fetch(url, { cache: 'no-store' })).body!.pipeThrough(coalesce()))
    return { ms: ms(t0), ...counted }
  }
  if (name === 'inteiroInterpretar') {
    const buffer = await (await fetch(url, { cache: 'no-store' })).arrayBuffer()
    const counted = await parseCount(new Blob([buffer]).stream())
    return { ms: ms(t0), ...counted }
  }
  // Carga real da seção (lê, prepara e grava as 35 categorias comprimidas), como hoje ou com os pedaços juntados.
  const { database, ids } = await prepare()
  const prepMs = ms(t0)
  const t1 = performance.now()
  const joined = name === 'secaoJuntada'
  const result = await loadSection(SOURCE_ID, 'movie', ids, {
    database,
    fetchImpl: (async () => {
      const response = await fetch(url, { cache: 'no-store' })
      return joined ? new Response(response.body!.pipeThrough(coalesce()), { status: 200 }) : response
    }) as typeof fetch,
  })
  const total = ms(t1)
  const counted = await database.categories.where('sourceId').equals(SOURCE_ID).toArray()
  const items = counted.reduce((sum, category) => sum + ((category as { itemsCount?: number }).itemsCount ?? 0), 0)
  database.close()
  await CatalogDb.delete(DB_NAME)
  return { ms: total, prepararMs: prepMs, outcome: result.outcome, categorias: result.written.length, items }
}

scope.onmessage = async (event: MessageEvent) => {
  const { op, name, url } = event.data as { op: string; name: string; url: string }
  try {
    if (op === 'variante') scope.postMessage({ ok: true, result: await variant(name, url) })
  } catch (error) {
    scope.postMessage({ ok: false, error: { name: (error as Error)?.name ?? 'Error', message: String((error as Error)?.message ?? error).slice(0, 160) } })
  }
}
