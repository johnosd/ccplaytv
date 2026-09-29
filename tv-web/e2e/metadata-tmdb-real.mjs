// Roteiro REAL da feature 032 (SC-001) — kept fora de `test:e2e`, como os
// `*-real.mjs` das features 030/031: lê a lista real do `.env` da raiz
// (`CCPLAY_PROBE_DNS/USER/PASS`), amostra filmes e séries e mede quantos têm
// sinopse E backdrop no que o provedor entrega — a mesma leitura que o detalhe faz
// (`get_vod_info` para filme; a listagem/`get_series_info` para série).
//
// Imprime SÓ contagens e percentuais: nunca o endereço, o usuário, a senha nem
// o texto de uma sinopse (regra da constitution e da memória do projeto).
//
// Uso: `node e2e/metadata-tmdb-real.mjs` (não precisa do `npm run dev`).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SAMPLE = 60
const MIN_SERIES = 0.85 // SC-001
const MIN_MOVIES = 0.8

function loadEnv() {
  const env = {}
  for (const line of readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line)
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()
let dns = env.CCPLAY_PROBE_DNS
if (!dns || !env.CCPLAY_PROBE_USER || !env.CCPLAY_PROBE_PASS) {
  console.error('Faltam CCPLAY_PROBE_DNS/USER/PASS no .env da raiz.')
  process.exit(2)
}
if (!/^https?:\/\//.test(dns)) dns = `http://${dns}`
dns = dns.replace(/\/+$/, '')

async function api(params) {
  const query = new URLSearchParams({ username: env.CCPLAY_PROBE_USER, password: env.CCPLAY_PROBE_PASS, ...params })
  const response = await fetch(`${dns}/player_api.php?${query}`, { signal: AbortSignal.timeout(90_000) })
  if (!response.ok) throw new Error(`o provedor respondeu ${response.status}`)
  return response.json()
}

const filled = (value) => typeof value === 'string' && value.trim() !== '' && value.trim() !== '0'
const hasUrl = (value) => {
  const candidates = Array.isArray(value) ? value : [value]
  return candidates.some((candidate) => {
    try {
      return typeof candidate === 'string' && Boolean(new URL(candidate))
    } catch {
      return false
    }
  })
}
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n)
const pct = (part, total) => (total === 0 ? 0 : part / total)
const fmt = (value) => `${(value * 100).toFixed(0)}%`

let failures = 0
function assert(condition, message) {
  if (!condition) {
    failures += 1
    console.error(`  ✗ FALHOU: ${message}`)
  } else {
    console.log(`  ✓ ${message}`)
  }
}

async function run() {
  console.log('=== SC-001: filmes (get_vod_info) ===')
  const vod = await api({ action: 'get_vod_streams' })
  const movies = pick(vod, SAMPLE)
  const movieStats = { total: 0, synopsis: 0, backdrop: 0, both: 0, genre: 0, tmdbId: 0 }
  for (const movie of movies) {
    try {
      const { info } = await api({ action: 'get_vod_info', vod_id: String(movie.stream_id) })
      if (!info || Array.isArray(info)) {
        movieStats.total += 1
        continue
      }
      const synopsis = filled(info.plot) || filled(info.description)
      const backdrop = hasUrl(info.backdrop_path)
      movieStats.total += 1
      if (synopsis) movieStats.synopsis += 1
      if (backdrop) movieStats.backdrop += 1
      if (synopsis && backdrop) movieStats.both += 1
      if (filled(info.genre)) movieStats.genre += 1
      if (Number(info.tmdb_id) > 0) movieStats.tmdbId += 1
    } catch {
      movieStats.total += 1
    }
  }
  console.log(
    `  amostra ${movieStats.total} de ${vod.length} filmes — sinopse ${fmt(pct(movieStats.synopsis, movieStats.total))}, ` +
      `backdrop ${fmt(pct(movieStats.backdrop, movieStats.total))}, ambos ${fmt(pct(movieStats.both, movieStats.total))}, ` +
      `gênero ${fmt(pct(movieStats.genre, movieStats.total))}, tmdb_id ${fmt(pct(movieStats.tmdbId, movieStats.total))}`,
  )
  assert(pct(movieStats.both, movieStats.total) >= MIN_MOVIES, `≥ ${fmt(MIN_MOVIES)} dos filmes têm sinopse e backdrop (SC-001)`)

  console.log('=== SC-001: séries (listagem get_series, TODAS — já vem inteira, sem amostragem) ===')
  const series = await api({ action: 'get_series' })
  const seriesStats = { total: series.length, synopsis: 0, backdrop: 0, both: 0, cast: 0 }
  for (const item of series) {
    const synopsis = filled(item.plot)
    const backdrop = hasUrl(item.backdrop_path)
    if (synopsis) seriesStats.synopsis += 1
    if (backdrop) seriesStats.backdrop += 1
    if (synopsis && backdrop) seriesStats.both += 1
    if (filled(item.cast)) seriesStats.cast += 1
  }
  console.log(
    `  ${seriesStats.total} séries — sinopse ${fmt(pct(seriesStats.synopsis, seriesStats.total))}, ` +
      `backdrop ${fmt(pct(seriesStats.backdrop, seriesStats.total))}, ambos ${fmt(pct(seriesStats.both, seriesStats.total))}, ` +
      `elenco ${fmt(pct(seriesStats.cast, seriesStats.total))}`,
  )
  assert(pct(seriesStats.both, seriesStats.total) >= MIN_SERIES, `≥ ${fmt(MIN_SERIES)} das séries têm sinopse e backdrop (SC-001)`)

  console.log('=== Sinopse por episódio (FR-028): quantos episódios de uma série de amostra a trazem ===')
  let episodes = 0
  let withPlot = 0
  for (const item of pick(series, 8)) {
    try {
      const detail = await api({ action: 'get_series_info', series_id: String(item.series_id) })
      for (const list of Object.values(detail.episodes ?? {})) {
        for (const episode of Array.isArray(list) ? list : []) {
          episodes += 1
          if (filled(episode?.info?.plot) || filled(episode?.info?.description)) withPlot += 1
        }
      }
    } catch {
      // série que o painel não detalha: fica fora da contagem
    }
  }
  console.log(`  ${episodes} episódios lidos em 8 séries — ${withPlot} com sinopse (${fmt(pct(withPlot, episodes))})`)
  assert(episodes > 0, 'a amostra de séries devolveu episódios')
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
