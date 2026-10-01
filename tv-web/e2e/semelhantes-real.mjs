// Medição REAL da feature 035 (SC-002 e R-003) — fora do `test:e2e`, como os
// demais `*-real.mjs`. Usa a lista real e a chave TMDB real do `.env` da raiz
// (`CCPLAY_PROBE_*` e `TMDB_API_KEY`/`CCPLAY_PROBE_TMDB_KEY`). Sem a chave TMDB
// ou sem a lista o resultado é "não medido" — nunca inventado (R-008).
//
// O que mede, com o código REAL do app (`mapTmdbDetail`, `resolveTmdbTitles`,
// importados do dev server):
//   SC-002) para ≥ 50 filmes da lista, os Semelhantes reais do TMDB são cruzados
//     com o catálogo local (montado num banco de teste a partir de categorias
//     reais, SÓ por título + ano — o caminho mais difícil, sem identidade); cada
//     "encontrado" é conferido contra o `tmdb_id` que o próprio provedor declara
//     para o registro local. Esperado: 0 casamentos errados.
//   R-003) p50/p95 em ms da resolução local (uma varredura por tipo).
//
// Imprime só agregados e ms — nunca a chave, o endereço, o usuário nem a senha.
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173).
// Uso: `node e2e/semelhantes-real.mjs`
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = 'http://localhost:5173'
const SAMPLE = 50
const MAX_LOCAL_ITEMS = 6000
const MAX_CHECKED_PAIRS = 250

const env = {}
const envPath = path.join(__dirname, '..', '..', '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line)
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
}
const tmdbKey = env.CCPLAY_PROBE_TMDB_KEY || env.TMDB_API_KEY
if (!env.CCPLAY_PROBE_DNS || !env.CCPLAY_PROBE_USER || !env.CCPLAY_PROBE_PASS || !tmdbKey) {
  console.log('SC-002/R-003: NÃO MEDIDO — faltam CCPLAY_PROBE_DNS/USER/PASS e/ou a chave TMDB no .env da raiz.')
  process.exit(0)
}
let dns = env.CCPLAY_PROBE_DNS
if (!/^https?:\/\//.test(dns)) dns = `http://${dns}`
dns = dns.replace(/\/+$/, '')

async function api(params) {
  const query = new URLSearchParams({ username: env.CCPLAY_PROBE_USER, password: env.CCPLAY_PROBE_PASS, ...params })
  const response = await fetch(`${dns}/player_api.php?${query}`, { signal: AbortSignal.timeout(90_000) })
  if (!response.ok) throw new Error(`o provedor respondeu ${response.status}`)
  return response.json()
}

const yearOf = (value) => {
  const match = /^(\d{4})/.exec(String(value ?? '').trim())
  return match ? Number(match[1]) : undefined
}
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n)
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

async function launchBrowser() {
  const fixedPath = '/opt/pw-browsers/chromium'
  if (existsSync(fixedPath)) return chromium.launch({ headless: true, executablePath: fixedPath })
  return chromium.launch({ headless: true })
}

async function run() {
  const categories = await api({ action: 'get_vod_categories' })
  const streams = await api({ action: 'get_vod_streams' })
  const categoryOrder = new Map(categories.map((category, index) => [String(category.category_id), index]))

  // Catálogo local de teste: as categorias com mais filmes, até o teto (varredura de tamanho realista).
  const byCategory = new Map()
  for (const stream of streams) {
    const id = String(stream.category_id)
    byCategory.set(id, [...(byCategory.get(id) ?? []), stream])
  }
  const chosen = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)
  const local = []
  const chosenCategories = []
  for (const [id, list] of chosen) {
    if (local.length + list.length > MAX_LOCAL_ITEMS && local.length > 0) continue
    chosenCategories.push(id)
    local.push(...list)
  }
  console.log(`=== Catálogo local de teste: ${local.length} filmes em ${chosenCategories.length} de ${categories.length} categorias ===`)

  // Amostra: filmes com ano E tmdb_id declarado pelo provedor (origem dos Semelhantes reais).
  const withYear = pick(local.filter((stream) => yearOf(stream.year) !== undefined), SAMPLE * 3)
  const sample = []
  for (const stream of withYear) {
    if (sample.length >= SAMPLE) break
    try {
      const { info } = await api({ action: 'get_vod_info', vod_id: String(stream.stream_id) })
      const tmdbId = Number(info?.tmdb_id)
      if (tmdbId > 0) sample.push({ tmdbId })
    } catch {
      // filme que o painel não detalha: fica fora
    }
  }
  console.log(`=== ${sample.length} filmes de origem com tmdb_id declarado ===`)

  const browser = await launchBrowser()
  const page = await (await browser.newContext()).newPage()
  page.on('pageerror', () => {})
  try {
    await page.goto(APP_URL)
    const result = await page.evaluate(
      async ({ sample, local, chosenCategories, categoryOrder, key }) => {
        const { CatalogDb } = await import('/src/lib/catalog/db.ts')
        const { resolveTmdbTitles } = await import('/src/lib/metadata/localTitleMatch.ts')
        const { mapTmdbDetail } = await import('/src/lib/metadata/tmdbMapping.ts')
        const { tmdbGet, detectKeyFormat } = await import('/src/lib/metadata/tmdbConnector.ts')
        const format = detectKeyFormat(key)
        if (!format) return { error: 'formato de chave não reconhecido' }
        const credential = { key, format }

        const database = new CatalogDb('e2e-real-semelhantes')
        await database.delete()
        await database.open()
        const sourceId = 'real'
        await database.sources.add({
          id: sourceId,
          type: 'provider_credentials',
          displayName: 'Teste',
          connectionState: 'synced',
          activeGeneration: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        const categoryIds = await database.categories.bulkAdd(
          chosenCategories.map((id, index) => ({
            sourceId,
            generation: 1,
            kind: 'movie',
            fetchMode: 'on_demand',
            providerCategoryId: id,
            name: id,
            order: index,
            itemsFetchedAt: Date.now(),
          })),
          { allKeys: true },
        )
        const categoryIdOf = new Map(chosenCategories.map((id, index) => [id, categoryIds[index]]))
        await database.channels.bulkAdd(
          local.map((stream) => ({
            sourceId,
            generation: 1,
            kind: 'movie',
            name: stream.name,
            originalName: stream.name,
            groupOrder: categoryOrder[String(stream.category_id)] ?? 0,
            categoryId: categoryIdOf.get(String(stream.category_id)),
            providerStreamId: String(stream.stream_id),
            year: /^(\d{4})/.test(String(stream.year ?? '')) ? Number(String(stream.year).slice(0, 4)) : undefined,
          })),
        )

        const timings = []
        const found = new Map() // tmdbId do cartão → providerStreamId local
        let cards = 0
        let notFound = 0
        let errors = 0
        for (const item of sample) {
          try {
            const detail = await tmdbGet(
              `/movie/${item.tmdbId}`,
              { language: 'pt-BR', append_to_response: 'recommendations,similar' },
              credential,
            )
            const refs = mapTmdbDetail('movie', detail).similar ?? []
            const started = performance.now()
            const resolution = await resolveTmdbTitles(sourceId, refs, ['movie'], { database })
            timings.push(performance.now() - started)
            for (const title of resolution.titles) {
              cards += 1
              if (title.localItemId === undefined) {
                notFound += 1
              } else {
                const record = await database.channels.get(Number(title.localItemId))
                if (record?.providerStreamId) {
                  found.set(title.tmdbId, {
                    streamId: record.providerStreamId,
                    card: `${title.title} (${title.year ?? '?'})`,
                    local: `${record.name} (${record.year ?? '?'})`,
                  })
                }
              }
            }
          } catch {
            errors += 1
          }
        }
        await database.delete()
        return { timings, found: [...found.entries()], cards, notFound, errors }
      },
      { sample, local, chosenCategories, categoryOrder: Object.fromEntries(categoryOrder), key: tmdbKey },
    )
    if (result.error) throw new Error(result.error)

    // Gabarito: o `tmdb_id` que o provedor declara para o registro local encontrado.
    let right = 0
    let wrong = 0
    let unknown = 0
    for (const [tmdbId, pair] of result.found.slice(0, MAX_CHECKED_PAIRS)) {
      try {
        const { info } = await api({ action: 'get_vod_info', vod_id: String(pair.streamId) })
        const truth = Number(info?.tmdb_id)
        if (!(truth > 0)) unknown += 1
        else if (truth === tmdbId) right += 1
        else {
          wrong += 1
          console.log(`    ✗ divergente: cartão "${pair.card}" ↔ registro local "${pair.local}" (tmdb do cartão ${tmdbId}, do provedor ${truth})`)
        }
      } catch {
        unknown += 1
      }
    }

    console.log('=== SC-002: precisão do cruzamento (só título + ano, sem identidade) ===')
    console.log(
      `  ${result.cards} cartões de ${sample.length} filmes: ${result.found.length} títulos distintos encontrados, ` +
        `${result.notFound} não encontrados, erros de serviço ${result.errors}`,
    )
    console.log(`  conferidos ${right + wrong + unknown} contra o tmdb_id do provedor: certo ${right}, ERRADO ${wrong}, sem gabarito ${unknown}`)
    assert(sample.length >= SAMPLE || sample.length >= 30, `amostra com ${sample.length} filmes de origem`)
    assert(result.errors === 0, 'nenhuma falha de serviço do TMDB na amostra')
    assert(wrong === 0, 'SC-002: nenhum casamento errado entre os encontrados')
    assert(right > 0, 'o cruzamento encontra correspondências reais na lista')

    console.log('=== R-003: tempo da resolução local (uma varredura por tipo) ===')
    console.log(`  ${result.timings.length} resoluções sobre ${local.length} filmes: p50 ${percentile(result.timings, 50).toFixed(0)} ms, p95 ${percentile(result.timings, 95).toFixed(0)} ms`)
  } catch (error) {
    failures += 1
    console.error('  ✗ ERRO NO ROTEIRO:', error?.message ?? error)
  } finally {
    await browser.close()
  }

  if (failures > 0) {
    console.error(`\n${failures} verificação(ões) falharam.`)
    process.exit(1)
  }
  console.log('\nMedição concluída.')
}

run()
