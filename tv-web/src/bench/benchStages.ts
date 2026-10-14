/**
 * Modo `stages` da bancada (feature 063, US3): cada etapa da importação medida
 * isolada, compondo SÓ funções públicas do app — nenhuma linha do pipeline muda
 * (D-007). Obtenção → leitura → classificação → gravação; o caminho que o app de
 * fato percorre fica em `benchReal.ts` e nunca é somado a este (R-005).
 */
import type { CatalogRecord, CategoryKind } from '../lib/catalog/db'
import {
  allocateGeneration,
  countChannels,
  listCategories,
  publishGeneration,
  renewCategoryItems,
  storeCategories,
  type CatalogCategory,
} from '../lib/catalog/catalogRepository'
import { toItemRecord } from '../lib/catalog/categoryLoader'
import { parseM3uText } from '../lib/catalog/m3uParser'
import { createSource, deleteSource } from '../lib/catalog/sourceRepository'
import {
  classifyWithGroupOrder,
  mapLiveEntry,
  mapSeriesEntry,
  mapVodEntry,
  playerApiUrl,
  type LiveCategory,
  type MappedChannel,
} from '../lib/catalog/xtreamConnector'
import { writeEpgPrograms } from '../lib/epg/epgRepository'
import { parseXmltv } from '../lib/epg/xmltvParser'
import type { EpgProgramInput } from '../lib/epg/types'
import { timed, failureOf, roundMs, type BenchModeResult, type BenchRunOptions, type StageTracker } from './benchTypes'

export const BENCH_USER = 'bench'
export const BENCH_PASSWORD = 'bench'

/** Fontes criadas por esta página; `cleanupBenchSources` as remove entre as combinações (TV). */
export const createdSources: string[] = []

const SECTIONS: Array<{ kind: CategoryKind; categories: string; streams: string }> = [
  { kind: 'channel', categories: 'get_live_categories', streams: 'get_live_streams' },
  { kind: 'movie', categories: 'get_vod_categories', streams: 'get_vod_streams' },
  { kind: 'series', categories: 'get_series_categories', streams: 'get_series' },
]

const noUrl = (): undefined => undefined
const HOUR_MS = 3_600_000

async function textOf(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('resposta recusada')
  return response.text()
}

/** Grava uma geração nova com as categorias dadas e os itens de cada uma, e a publica. */
async function storeGeneration(
  sourceId: string,
  groups: Array<{ kind: CategoryKind; fetchMode: 'on_demand' | 'eager'; providerCategoryId?: string; name: string; order: number; items: MappedChannel[] }>,
): Promise<void> {
  const generation = await allocateGeneration(sourceId)
  const ids = await storeCategories(
    groups.map((group) => ({
      sourceId,
      generation,
      kind: group.kind,
      fetchMode: group.fetchMode,
      providerCategoryId: group.providerCategoryId,
      name: group.name,
      order: group.order,
    })),
  )
  for (const [index, group] of groups.entries()) {
    const category: CatalogCategory = {
      id: ids[index],
      kind: group.kind,
      name: group.name,
      order: group.order,
      count: 0,
      fetchMode: group.fetchMode,
      providerCategoryId: group.providerCategoryId,
    }
    const records: CatalogRecord[] = group.items.map((item) => toItemRecord(item, sourceId, generation, category))
    await renewCategoryItems({ sourceId, generation, kind: group.kind, categoryId: category.id, groupOrder: group.order }, records, Date.now())
  }
  await publishGeneration(sourceId, generation)
}

async function countsOfCatalog(sourceId: string) {
  return { categories: (await listCategories(sourceId)).length, items: await countChannels(sourceId) }
}

async function xtreamStages(options: BenchRunOptions, tracker: StageTracker): Promise<BenchModeResult> {
  const url = (action: string) => playerApiUrl(options.fixturesUrl, BENCH_USER, BENCH_PASSWORD, { action })
  const fetched = await timed(tracker, 'fetch', () =>
    Promise.all(SECTIONS.flatMap((section) => [textOf(url(section.categories)), textOf(url(section.streams))])),
  )
  const parsed = await timed(tracker, 'parse', () => fetched.value.map((text) => JSON.parse(text) as Array<Record<string, unknown>>))
  const classified = await timed(tracker, 'classify', () =>
    SECTIONS.map((section, index) => {
      const categories: LiveCategory[] = parsed.value[index * 2].map((raw, order) => ({
        id: String(raw.category_id),
        name: String(raw.category_name ?? ''),
        order,
      }))
      const byId = new Map(categories.map((category) => [category.id, category]))
      const mapper =
        section.kind === 'channel'
          ? (raw: Record<string, unknown>) => mapLiveEntry(raw, byId, noUrl)
          : section.kind === 'movie'
            ? (raw: Record<string, unknown>) => mapVodEntry(raw, byId, noUrl)
            : (raw: Record<string, unknown>) => mapSeriesEntry(raw, byId)
      const items = parsed.value[index * 2 + 1].map(mapper).filter((item): item is MappedChannel => item !== undefined)
      return { section, categories, items }
    }),
  )
  const stored = await timed(tracker, 'store', async () => {
    const sourceId = await createSource({
      type: 'provider_credentials',
      displayName: 'bench',
      providerDns: options.fixturesUrl,
      providerUsername: BENCH_USER,
      providerPassword: BENCH_PASSWORD,
    })
    createdSources.push(sourceId)
    await storeGeneration(
      sourceId,
      classified.value.flatMap(({ section, categories, items }) =>
        categories.map((category) => ({
          kind: section.kind,
          fetchMode: 'on_demand' as const,
          providerCategoryId: category.id,
          name: category.name,
          order: category.order,
          items: items.filter((item) => item.providerCategoryId === category.id),
        })),
      ),
    )
    return countsOfCatalog(sourceId)
  })
  return finish(fetched.ms, parsed.ms, classified.ms, stored.ms, stored.value)
}

async function m3uStages(options: BenchRunOptions, tracker: StageTracker): Promise<BenchModeResult> {
  const fetched = await timed(tracker, 'fetch', () => textOf(`${options.fixturesUrl}/playlist.m3u`))
  const parsed = await timed(tracker, 'parse', () => parseM3uText(fetched.value))
  const groupOrders = new Map<string, number>()
  const classified = await timed(tracker, 'classify', () => parsed.value.entries.map((entry) => classifyWithGroupOrder(entry, groupOrders)))
  const stored = await timed(tracker, 'store', async () => {
    const sourceId = await createSource({ type: 'm3u_url', displayName: 'bench', m3uUrl: `${options.fixturesUrl}/playlist.m3u` })
    createdSources.push(sourceId)
    const byOrder = new Map<number, MappedChannel[]>()
    for (const item of classified.value) {
      const list = byOrder.get(item.groupOrder)
      if (list) list.push(item)
      else byOrder.set(item.groupOrder, [item])
    }
    await storeGeneration(
      sourceId,
      [...byOrder.entries()].map(([order, items]) => ({
        kind: items[0].kind === 'movie' || items[0].kind === 'series' ? items[0].kind : ('channel' as const),
        fetchMode: 'eager' as const,
        name: items[0].group ?? '',
        order,
        items,
      })),
    )
    return countsOfCatalog(sourceId)
  })
  return finish(fetched.ms, parsed.ms, classified.ms, stored.ms, stored.value)
}

async function xmltvStages(options: BenchRunOptions, tracker: StageTracker): Promise<BenchModeResult> {
  const fetched = await timed(tracker, 'fetch', () => textOf(`${options.fixturesUrl}/epg.xml`))
  const parsed = await timed(tracker, 'parse', async () => {
    const window = { from: options.clock - 12 * HOUR_MS, to: options.clock + 48 * HOUR_MS }
    const programs: EpgProgramInput[] = []
    const chunks = (async function* () {
      for (let at = 0; at < fetched.value.length; at += 65_536) yield fetched.value.slice(at, at + 65_536)
    })()
    for await (const program of parseXmltv(chunks, window)) programs.push(program)
    return programs
  })
  const stored = await timed(tracker, 'store', async () => {
    const sourceId = await createSource({ type: 'm3u_url', displayName: 'bench', m3uUrl: `${options.fixturesUrl}/playlist.m3u` })
    createdSources.push(sourceId)
    const { programCount } = await writeEpgPrograms(sourceId, parsed.value)
    return { categories: new Set(parsed.value.map((program) => program.channelKey)).size, items: programCount }
  })
  return finish(fetched.ms, parsed.ms, null, stored.ms, stored.value)
}

function finish(fetchMs: number, parseMs: number, classifyMs: number | null, storeMs: number, counts: { categories: number; items: number }): BenchModeResult {
  return {
    mode: 'stages',
    status: 'ok',
    stages: { fetchMs, parseMs, classifyMs, storeMs, totalMs: roundMs(fetchMs + parseMs + (classifyMs ?? 0) + storeMs) },
    counts,
  }
}

export async function runStages(options: BenchRunOptions): Promise<BenchModeResult> {
  const tracker: StageTracker = { stage: 'setup' }
  try {
    if (options.format === 'xtream') return await xtreamStages(options, tracker)
    if (options.format === 'm3u') return await m3uStages(options, tracker)
    return await xmltvStages(options, tracker)
  } catch (error) {
    return failureOf('stages', tracker, error)
  }
}

/** Remove as fontes criadas (e o catálogo delas) — a rodada na TV limpa entre uma combinação e outra. */
export async function cleanupBenchSources(): Promise<void> {
  for (const id of createdSources.splice(0)) await deleteSource(id)
}
