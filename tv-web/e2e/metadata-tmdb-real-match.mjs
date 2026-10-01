// Roteiro REAL do casamento com o TMDB (feature 032, SC-003) — fora do
// `test:e2e`, como os demais `*-real.mjs`. Usa a lista real e a chave TMDB real
// do `.env` da raiz (`CCPLAY_PROBE_*` e `TMDB_API_KEY`).
//
// O que mede, com o código REAL do app (`lookupTmdb`, importado do dev server):
//   A) onde o TMDB entra "em ação" na sua lista: filmes cujo `get_vod_info` vem
//      sem sinopse — é o único caso em que o app consulta o TMDB (provedor vence);
//   B) precisão do casamento POR TÍTULO + ANO, tendo o `tmdb_id` do próprio
//      provedor como gabarito (o `lookupTmdb` roda SEM o id, como numa fonte
//      M3U): quantos casam, quantos casam CERTO e quantos ERRADO (SC-003: zero);
//   C) séries (sem gabarito): pares "título da lista → nome no TMDB" para
//      conferência visual.
//
// Imprime só agregados e títulos de catálogo — nunca a chave, o endereço, o
// usuário nem a senha (regra da constitution e da memória do projeto).
//
// Pré-requisito: `npm run dev` rodando (http://localhost:5173).
// Uso: `node e2e/metadata-tmdb-real-match.mjs`
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = 'http://localhost:5173'
const MOVIE_SAMPLE = 80
const SERIES_SAMPLE = 30

const env = {}
for (const line of readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line)
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
}
if (!env.CCPLAY_PROBE_DNS || !env.CCPLAY_PROBE_USER || !env.CCPLAY_PROBE_PASS || !env.TMDB_API_KEY) {
  console.error('Faltam CCPLAY_PROBE_DNS/USER/PASS e/ou TMDB_API_KEY no .env da raiz.')
  process.exit(2)
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

const filled = (value) => typeof value === 'string' && value.trim() !== '' && value.trim() !== '0'
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n)
const pct = (part, total) => (total === 0 ? '0%' : `${((part / total) * 100).toFixed(0)}%`)
const yearOf = (value) => {
  const match = /^(\d{4})/.exec(String(value ?? '').trim())
  return match ? Number(match[1]) : undefined
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
  const categories = new Map((await api({ action: 'get_vod_categories' })).map((c) => [String(c.category_id), c.category_name]))
  const vod = await api({ action: 'get_vod_streams' })

  console.log('=== A) Onde o TMDB entra em ação na sua lista (filmes sem sinopse no provedor) ===')
  const candidates = pick(vod, 400)
  const gaps = []
  for (const movie of candidates) {
    if (gaps.length >= 8) break
    try {
      const { info } = await api({ action: 'get_vod_info', vod_id: String(movie.stream_id) })
      const noPlot = !info || Array.isArray(info) || !(filled(info.plot) || filled(info.description))
      if (noPlot) gaps.push({ title: movie.name, category: categories.get(String(movie.category_id)) ?? '(sem categoria)', year: yearOf(movie.year), tmdbId: Number(info?.tmdb_id) || undefined })
    } catch {
      // filme que o painel não detalha: fica fora
    }
  }
  console.log(`  ${gaps.length} filmes SEM sinopse no provedor (de ${candidates.length} olhados) — abra um destes no dev com a chave configurada:`)
  for (const gap of gaps) console.log(`    • "${gap.title}" — categoria "${gap.category}"${gap.year ? ` (${gap.year})` : ''}${gap.tmdbId ? ' — tem tmdb_id' : ' — sem tmdb_id'}`)
  assert(gaps.length > 0, 'a lista tem filmes que dependem do TMDB para ter sinopse')

  // Gabarito: filmes com ano na listagem E `tmdb_id` no detalhe do provedor.
  console.log('=== B) Precisão do casamento por título + ano (gabarito = tmdb_id do provedor) ===')
  const withYear = pick(
    vod.filter((movie) => yearOf(movie.year) !== undefined),
    MOVIE_SAMPLE * 2,
  )
  const movies = []
  for (const movie of withYear) {
    if (movies.length >= MOVIE_SAMPLE) break
    try {
      const { info } = await api({ action: 'get_vod_info', vod_id: String(movie.stream_id) })
      const truth = Number(info?.tmdb_id)
      if (truth > 0) movies.push({ title: movie.name, year: yearOf(movie.year), truth })
    } catch {
      // ignorado
    }
  }
  const series = pick(
    (await api({ action: 'get_series' })).filter((item) => yearOf(item.year ?? item.releaseDate ?? item.release_date) !== undefined),
    SERIES_SAMPLE,
  ).map((item) => ({ title: item.name, year: yearOf(item.year ?? item.releaseDate ?? item.release_date) }))

  const browser = await launchBrowser()
  const page = await (await browser.newContext()).newPage()
  page.on('pageerror', () => {})
  try {
    await page.goto(APP_URL)
    const result = await page.evaluate(
      async ({ movies, series, key }) => {
        const { lookupTmdb } = await import('/src/lib/metadata/tmdbLookup.ts')
        const { tmdbGet, detectKeyFormat } = await import('/src/lib/metadata/tmdbConnector.ts')
        const format = detectKeyFormat(key)
        if (!format) return { error: 'formato de chave não reconhecido' }
        const credential = { key, format }
        const record = (kind, item) => ({
          sourceId: 'real',
          generation: 1,
          kind,
          name: item.title,
          originalName: item.title,
          groupOrder: 0,
          year: item.year,
        })
        const outMovies = []
        for (const item of movies) {
          try {
            const outcome = await lookupTmdb({ record: record('movie', item), providerTmdbId: undefined, credential })
            outMovies.push({ title: item.title, status: outcome.status, tmdbId: outcome.tmdbId, truth: item.truth })
          } catch (error) {
            outMovies.push({ title: item.title, status: 'erro', kind: error?.kind ?? 'desconhecido', truth: item.truth })
          }
        }
        const outSeries = []
        for (const item of series) {
          try {
            const outcome = await lookupTmdb({ record: record('series', item), providerTmdbId: undefined, credential })
            let matchedName
            if (outcome.status === 'matched') {
              const detail = await tmdbGet(`/tv/${outcome.tmdbId}`, { language: 'pt-BR' }, credential)
              matchedName = `${detail.name ?? '?'} (${String(detail.first_air_date ?? '').slice(0, 4) || '?'})`
            }
            outSeries.push({ title: item.title, year: item.year, status: outcome.status, matchedName })
          } catch (error) {
            outSeries.push({ title: item.title, year: item.year, status: 'erro', kind: error?.kind ?? 'desconhecido' })
          }
        }
        return { outMovies, outSeries }
      },
      { movies, series, key: env.TMDB_API_KEY },
    )

    if (result.error) throw new Error(result.error)
    const { outMovies, outSeries } = result
    const matched = outMovies.filter((m) => m.status === 'matched')
    const correct = matched.filter((m) => m.tmdbId === m.truth)
    const wrong = matched.filter((m) => m.tmdbId !== m.truth)
    const noMatch = outMovies.filter((m) => m.status === 'no_match')
    const errors = outMovies.filter((m) => m.status === 'erro')
    console.log(
      `  ${outMovies.length} filmes: casaram ${matched.length} (${pct(matched.length, outMovies.length)}), ` +
        `certo ${correct.length}, ERRADO ${wrong.length}, sem correspondência ${noMatch.length}, erro de serviço ${errors.length}`,
    )
    for (const item of wrong) console.log(`    ✗ errado: "${item.title}" → tmdb ${item.tmdbId} (gabarito ${item.truth})`)
    assert(errors.length === 0, 'nenhuma falha de serviço do TMDB na amostra (chave aceita, sem 401/429/rede)')
    assert(wrong.length === 0, 'SC-003: nenhum filme casou com a obra ERRADA (o casamento prefere não enriquecer a errar)')
    assert(matched.length > 0, 'o casamento por título + ano acha correspondência para parte dos filmes')

    console.log('=== C) Séries (sem gabarito) — título da lista → nome no TMDB, para conferência visual ===')
    const seriesMatched = outSeries.filter((s) => s.status === 'matched')
    console.log(`  ${outSeries.length} séries: casaram ${seriesMatched.length} (${pct(seriesMatched.length, outSeries.length)}), sem correspondência ${outSeries.filter((s) => s.status === 'no_match').length}, erro ${outSeries.filter((s) => s.status === 'erro').length}`)
    for (const item of seriesMatched) console.log(`    "${item.title}" (${item.year}) → ${item.matchedName}`)
    assert(outSeries.every((s) => s.status !== 'erro'), 'nenhuma falha de serviço do TMDB nas séries')
  } finally {
    await browser.close()
  }
}

run()
  .catch((error) => {
    failures += 1
    console.error('  ✗ ERRO NO ROTEIRO:', error instanceof Error ? error.message : 'falha desconhecida')
  })
  .finally(() => {
    if (failures > 0) {
      console.error(`\n${failures} verificação(ões) falharam.`)
      process.exit(1)
    }
    console.log('\nTodas as verificações passaram.')
  })
