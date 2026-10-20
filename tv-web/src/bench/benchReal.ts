/**
 * Modo `real` da bancada (feature 063, US3): o caminho que o app percorre —
 * cadastro da fonte, importação, carga das seções/categorias ou sincronização do
 * EPG — medido do início ao fim, com uso e quota de armazenamento lidos antes e
 * depois (FR-019, FR-020). Só compõe funções públicas; o resultado fica separado
 * do `stages` e os dois nunca são somados (D-007, R-005).
 *
 * `counts.items` aqui é o que a pessoa vê: canais + filmes + séries (episódio de
 * M3U vira série, não item), que é o que `expected.items` descreve.
 */
import { db, type CategoryKind } from '../lib/catalog/db'
import { countChannels, listCategories } from '../lib/catalog/catalogRepository'
import { ensureCategory } from '../lib/catalog/categoryLoader'
import { startImport } from '../lib/catalog/importPipeline'
import { loadSection } from '../lib/catalog/sectionLoader'
import { createSource } from '../lib/catalog/sourceRepository'
import { setEpgManualUrl } from '../lib/epg/epgRepository'
import { syncEpg } from '../lib/epg/epgSync'
import { epgChunks } from '../lib/catalog/chunkTables'
import { BENCH_PASSWORD, BENCH_USER, createdSources } from './benchStages'
import { failureOf, msSince, readStorage, type BenchCounts, type BenchModeResult, type BenchRunOptions, type StageTracker } from './benchTypes'

const KINDS: CategoryKind[] = ['channel', 'movie', 'series']

/** Um erro só com o nome — o que sobrevive no resultado (nunca a mensagem). */
function named(name: string): Error {
  const error = new Error('falha do benchmark')
  error.name = name
  return error
}

async function importAndFinish(sourceId: string, tracker: StageTracker): Promise<void> {
  tracker.stage = 'import'
  const run = await (await startImport(sourceId)).completion
  if (run.status !== 'completed') throw named(run.errorKind ?? run.status)
}

async function visibleCounts(sourceId: string): Promise<BenchCounts> {
  let items = 0
  for (const kind of KINDS) items += await countChannels(sourceId, undefined, kind)
  return { categories: (await listCategories(sourceId)).length, items }
}

async function realXtream(options: BenchRunOptions, tracker: StageTracker): Promise<{ sourceId: string; totalMs: number }> {
  const startedAt = performance.now()
  const sourceId = await createSource({
    type: 'provider_credentials',
    displayName: 'bench',
    providerDns: options.fixturesUrl,
    providerUsername: BENCH_USER,
    providerPassword: BENCH_PASSWORD,
  })
  createdSources.push(sourceId)
  await importAndFinish(sourceId, tracker)
  for (const kind of KINDS) {
    tracker.stage = `load-${kind}`
    const categories = await listCategories(sourceId, kind)
    const loaded = await loadSection(sourceId, kind, categories.map((category) => category.id))
    if (loaded.outcome !== 'done') throw named(loaded.outcome)
  }
  return { sourceId, totalMs: msSince(startedAt) }
}

async function realM3u(options: BenchRunOptions, tracker: StageTracker): Promise<{ sourceId: string; totalMs: number }> {
  const startedAt = performance.now()
  const sourceId = await createSource({ type: 'm3u_url', displayName: 'bench', m3uUrl: `${options.fixturesUrl}/playlist.m3u` })
  createdSources.push(sourceId)
  await importAndFinish(sourceId, tracker)
  tracker.stage = 'ensure-category'
  for (const category of await listCategories(sourceId)) {
    const ensured = await ensureCategory(sourceId, category)
    if (ensured.outcome !== 'fetched' && ensured.outcome !== 'fresh') throw named(ensured.outcome)
  }
  return { sourceId, totalMs: msSince(startedAt) }
}

async function realXmltv(options: BenchRunOptions, tracker: StageTracker): Promise<{ sourceId: string; totalMs: number }> {
  const startedAt = performance.now()
  const sourceId = await createSource({ type: 'm3u_url', displayName: 'bench', m3uUrl: `${options.fixturesUrl}/playlist.m3u` })
  createdSources.push(sourceId)
  tracker.stage = 'epg-sync'
  await setEpgManualUrl(sourceId, `${options.fixturesUrl}/epg.xml`)
  const synced = await syncEpg(sourceId, { now: () => options.clock })
  if (synced.outcome !== 'synced') throw named(synced.errorKind ?? synced.outcome)
  return { sourceId, totalMs: msSince(startedAt) }
}

async function epgCounts(sourceId: string): Promise<BenchCounts> {
  // Feature 082: o guia é um registro comprimido por canal (`epgChunks`), com a contagem de programas.
  const chunks = await epgChunks(db).where('[sourceId+generation]').between([sourceId, -Infinity], [sourceId, Infinity]).toArray()
  return { categories: new Set(chunks.map((chunk) => chunk.channelKey)).size, items: chunks.reduce((sum, chunk) => sum + chunk.count, 0) }
}

export async function runReal(options: BenchRunOptions): Promise<BenchModeResult> {
  const tracker: StageTracker = { stage: 'setup' }
  try {
    const before = await readStorage()
    const run =
      options.format === 'xtream'
        ? await realXtream(options, tracker)
        : options.format === 'm3u'
          ? await realM3u(options, tracker)
          : await realXmltv(options, tracker)
    tracker.stage = 'count'
    const counts = options.format === 'xmltv' ? await epgCounts(run.sourceId) : await visibleCounts(run.sourceId)
    const after = await readStorage()
    return { mode: 'real', status: 'ok', realPath: { status: 'ok', totalMs: run.totalMs }, counts, storage: { before, after } }
  } catch (error) {
    return failureOf('real', tracker, error)
  }
}
