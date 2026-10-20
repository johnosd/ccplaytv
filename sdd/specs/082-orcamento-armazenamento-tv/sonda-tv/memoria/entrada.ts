// Leitores REAIS do app empacotados para a sonda (assessment orcamento-memoria-app-tv, 2026-10-19).
// `empacotar.mjs` gera `../app2/appReal.js` (IIFE) a partir deste arquivo. Nada aqui entra no pacote do CCPlayTV.
import { CatalogDb, type CatalogItemKind, type CatalogRecord } from '../../../../../tv-web/src/lib/catalog/db'
import { storeCategories } from '../../../../../tv-web/src/lib/catalog/repository/categories'
import { writeCompressedBlock } from '../../../../../tv-web/src/lib/catalog/blockWrite'
import { loadSearchIndex } from '../../../../../tv-web/src/lib/catalog/catalogSearch'
import { loadGlobalSearchIndex, searchGlobal } from '../../../../../tv-web/src/lib/catalog/globalSearch'
import { readKindCursorPage, type KindCursor } from '../../../../../tv-web/src/lib/catalog/repository/kindReads'
import { normalizeForSearch } from '../../../../../tv-web/src/lib/catalog/adultCategory'
import { sortVodItems, sortVodItemsInSlices, type VodSortOption } from '../../../../../tv-web/src/features/vod/vodSort'
import { loadAggregatedItems } from '../../../../../tv-web/src/features/catalog/aggregatedIndex'
import type { CatalogItemOut } from '../../../../../tv-web/src/features/catalog/catalogApi'

const SOURCE_ID = 'sonda'
// `catalogApi.ts:1554` (não exportado).
const ALL_PAGE_MIN_ITEMS = 240

type SampleItem = Record<string, unknown> & { name: string; originalName?: string }

/** Réplica literal de `itemOut` (`features/catalog/catalogApi.ts:290`, não exportada): mesmos campos, mesma ordem. */
function itemOut(record: CatalogRecord, kind: CatalogItemKind): CatalogItemOut {
  return {
    id: String(record.id ?? ''),
    kind,
    name: record.name,
    original_group: record.group ?? null,
    published: true,
    playable: kind === 'series' ? false : record.hasPlayback ?? (Boolean(record.directUrl) || Boolean(record.providerStreamId)),
    source_id: record.sourceId,
    provider_stream_id: record.providerStreamId ?? null,
    original_name: record.originalName,
    series_id: record.seriesId ?? null,
    icon_url: record.iconUrl ?? null,
    category_id: record.categoryId ?? null,
    category_position: record.categoryPosition ?? null,
    source_number: null,
    year: record.year ?? null,
    added_at: record.addedAt ?? null,
    provider_rating: record.providerRating ?? null,
    provider_genres: record.providerGenres ?? null,
    provider_backdrop_url: record.providerBackdropUrl ?? null,
    epg_channel_id: record.epgChannelId ?? null,
    archive_days: record.archiveDays ?? null,
  } as CatalogItemOut
}

/**
 * Semeia um banco próprio com `counts` itens por tipo, em categorias de `perCategory`, pelo gravador real da 082
 * (pedaços comprimidos). Os itens repetem a amostra sanitizada com um sufixo no nome (cópias não compartilham string).
 */
async function seed(name: string, samples: Record<CatalogItemKind, SampleItem[]>, counts: Record<string, number>,
  perCategory: Record<string, number>, onProgress?: (text: string) => void): Promise<CatalogDb> {
  const database = new CatalogDb(name)
  await database.open()
  await database.sources.add({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Sonda', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 } as never)
  let order = 0
  for (const kind of ['channel', 'movie', 'series'] as CatalogItemKind[]) {
    const total = counts[kind] ?? 0
    const sample = samples[kind]
    const categories = Math.ceil(total / perCategory[kind])
    const ids = await storeCategories(Array.from({ length: categories }, (_, index) => ({ sourceId: SOURCE_ID, generation: 1,
      kind: kind as never, fetchMode: 'on_demand' as const, name: `${kind} ${index}`, order: order + index })), database)
    let made = 0
    for (let c = 0; c < categories; c += 1) {
      const size = Math.min(perCategory[kind], total - made)
      const groupOrder = order + c
      const items: CatalogRecord[] = []
      for (let i = 0; i < size; i += 1) {
        const n = made + i
        const base = sample[n % sample.length]
        const copy = Math.floor(n / sample.length)
        const { id: _id, providerCategoryId: _p, ...rest } = base
        const itemName = copy === 0 ? base.name : `${base.name} ${copy}`
        items.push({ ...(rest as object), sourceId: SOURCE_ID, generation: 1, kind, groupOrder, categoryId: ids[c],
          group: `${kind} ${c}`, name: itemName, originalName: copy === 0 ? (base.originalName ?? base.name) : itemName,
          ...(kind !== 'series' && !base.providerStreamId ? { providerStreamId: String(n) } : {}),
          ...(kind !== 'series' && copy > 0 ? { providerStreamId: `${String(base.providerStreamId ?? n)}-${copy}` } : {}),
          ...(kind === 'series' && copy > 0 ? { seriesId: `${String(base.seriesId ?? n)}-${copy}` } : {}),
        } as CatalogRecord)
      }
      await writeCompressedBlock({ sourceId: SOURCE_ID, generation: 1, kind: kind as never, categoryId: ids[c], groupOrder }, items, 10, database)
      made += size
      onProgress?.(`${kind}: ${made}/${total}`)
    }
    order += categories
  }
  return database
}

/** Busca global: os três índices, como `loadGlobalSearchIndex` monta na tela de busca. */
async function globalSearch(database: CatalogDb) {
  return loadGlobalSearchIndex(SOURCE_ID, database)
}

/** Caminho ANTIGO de "Todos" (assessment ajustes-cpu-tv): índice inteiro + `map` + `sortVodItems`, tudo numa tarefa só. */
async function allByNameSync(database: CatalogDb, kind: 'movie' | 'series') {
  const index = await loadSearchIndex(SOURCE_ID, kind, database)
  const items = index.entries.map((entry) => itemOut(entry.record, kind))
  const sorted = sortVodItems(items, 'az')
  return { index, items, sorted }
}

/** "Todos" ordenado (feature 084): `loadAggregatedItems` (índice e conversão em fatias) + `sortVodItemsInSlices`. */
async function allByName(database: CatalogDb, kind: 'movie' | 'series', option: VodSortOption = 'az') {
  const { items } = await loadAggregatedItems(SOURCE_ID, kind, (record) => itemOut(record, kind), { database })
  const sorted = await sortVodItemsInSlices(items, option)
  return { items, sorted }
}

/** "Todos" na ordem da fonte descendo até o fim: todas as páginas acumuladas, como o `useInfiniteQuery` sem `maxPages`. */
async function allSourceToEnd(database: CatalogDb, kind: 'movie' | 'series') {
  const pages: CatalogItemOut[][] = []
  let cursor: KindCursor | undefined
  for (;;) {
    const page = await readKindCursorPage(SOURCE_ID, kind, cursor, ALL_PAGE_MIN_ITEMS, database)
    pages.push(page.items.map((record) => itemOut(record, kind)))
    if (page.next === undefined) break
    cursor = page.next
  }
  return { pages, flat: pages.flat() }
}

/** Contagem de objetos alcançáveis (objetos, arrays e strings distintas) — mesma unidade aproximada da sonda de heap. */
function countObjects(root: unknown): { objects: number; strings: number } {
  const seen = new Set<object>()
  const strings = new Set<string>()
  const stack: unknown[] = [root]
  while (stack.length) {
    const value = stack.pop()
    if (typeof value === 'string') { strings.add(value); continue }
    if (!value || typeof value !== 'object' || seen.has(value as object)) continue
    seen.add(value as object)
    if (Array.isArray(value)) { for (const item of value) stack.push(item); continue }
    for (const key of Object.keys(value as object)) stack.push((value as Record<string, unknown>)[key])
    // `LazySearchIndexEntry.record` é campo próprio; o getter não é seguido.
  }
  return { objects: seen.size, strings: strings.size }
}

async function dropDatabase(database: CatalogDb) {
  database.close()
  await database.delete()
}

;(window as unknown as { APPREAL: unknown }).APPREAL = {
  seed, globalSearch, searchGlobal, allByName, allByNameSync, allSourceToEnd, countObjects, dropDatabase, normalizeForSearch,
  collatorPtBase: new Intl.Collator('pt-BR', { sensitivity: 'base' }),
}
