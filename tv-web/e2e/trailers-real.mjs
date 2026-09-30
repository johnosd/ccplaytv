// Medição REAL da feature 033 (SC-005) — fora de `test:e2e`, como os demais
// `*-real.mjs`: lê a lista real do `.env` da raiz (`CCPLAY_PROBE_DNS/USER/PASS`
// e, se existir, `CCPLAY_PROBE_TMDB_KEY`) e mede de onde vem o trailer dos
// títulos: do provedor (`youtube_trailer`), do TMDB (`videos`), de ambos ou
// de nenhum.
//
// Imprime SÓ contagens: nunca o endereço, o usuário, a senha, a chave, nem um id
// de vídeo (regra da constitution e da memória do projeto).
//
// Uso: `node e2e/trailers-real.mjs` (não precisa do `npm run dev`).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MOVIE_SAMPLE = 60
const SERIES_SAMPLE = 60
const ID = /^[A-Za-z0-9_-]{11}$/

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
const tmdbKey = env.CCPLAY_PROBE_TMDB_KEY

async function api(params) {
  const query = new URLSearchParams({ username: env.CCPLAY_PROBE_USER, password: env.CCPLAY_PROBE_PASS, ...params })
  const response = await fetch(`${dns}/player_api.php?${query}`, { signal: AbortSignal.timeout(90_000) })
  if (!response.ok) throw new Error(`o provedor respondeu ${response.status}`)
  return response.json()
}

/** Só o id de 11 caracteres vale — mesma regra do app (`isYoutubeVideoId`). */
const providerHasTrailer = (value) => typeof value === 'string' && ID.test(value.trim())

async function tmdbHasTrailer(kind, tmdbId) {
  const query = new URLSearchParams({ append_to_response: 'videos', include_video_language: 'pt,en,null', language: 'pt-BR' })
  const isV4 = tmdbKey.length > 40
  if (!isV4) query.set('api_key', tmdbKey)
  const response = await fetch(`https://api.themoviedb.org/3/${kind}/${tmdbId}?${query}`, {
    headers: isV4 ? { Authorization: `Bearer ${tmdbKey}` } : {},
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) return null
  const detail = await response.json()
  const results = Array.isArray(detail?.videos?.results) ? detail.videos.results : []
  return results.some((v) => v?.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser') && ID.test(String(v.key)))
}

const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n)
const fmt = (part, total) => `${part}/${total} (${total === 0 ? 0 : Math.round((part / total) * 100)}%)`

function report(label, stats) {
  console.log(
    `  ${label}: provedor ${fmt(stats.provider, stats.total)}` +
      (tmdbKey
        ? `, TMDB ${fmt(stats.tmdb, stats.tmdbChecked)} dos ${stats.tmdbChecked} verificados, ` +
          `ambos ${stats.both}, algum ${fmt(stats.any, stats.total)}, nenhum ${stats.total - stats.any}`
        : ' (sem CCPLAY_PROBE_TMDB_KEY: TMDB não medido)'),
  )
}

async function run() {
  console.log('=== Séries (get_series_info.info, amostra) ===')
  const series = pick(await api({ action: 'get_series' }), SERIES_SAMPLE)
  const s = { total: 0, provider: 0, tmdb: 0, tmdbChecked: 0, both: 0, any: 0 }
  for (const item of series) {
    let provider = false
    try {
      const detail = await api({ action: 'get_series_info', series_id: String(item.series_id) })
      provider = providerHasTrailer(detail?.info?.youtube_trailer)
    } catch {
      // série que o painel não detalha: conta como sem trailer do provedor
    }
    let tmdb = false
    const tmdbId = Number(item.tmdb ?? item.tmdb_id)
    if (tmdbKey && tmdbId > 0) {
      const found = await tmdbHasTrailer('tv', tmdbId).catch(() => null)
      if (found !== null) {
        s.tmdbChecked += 1
        tmdb = found
      }
    }
    s.total += 1
    if (provider) s.provider += 1
    if (tmdb) s.tmdb += 1
    if (provider && tmdb) s.both += 1
    if (provider || tmdb) s.any += 1
  }
  report(`amostra de ${s.total} séries`, s)

  console.log('=== Filmes (get_vod_info, amostra) ===')
  const movies = pick(await api({ action: 'get_vod_streams' }), MOVIE_SAMPLE)
  const m = { total: 0, provider: 0, tmdb: 0, tmdbChecked: 0, both: 0, any: 0 }
  for (const movie of movies) {
    let provider = false
    let tmdbId = 0
    try {
      const { info } = await api({ action: 'get_vod_info', vod_id: String(movie.stream_id) })
      provider = providerHasTrailer(info?.youtube_trailer)
      tmdbId = Number(info?.tmdb_id)
    } catch {
      // filme que o painel não detalha
    }
    let tmdb = false
    if (tmdbKey && tmdbId > 0) {
      const found = await tmdbHasTrailer('movie', tmdbId).catch(() => null)
      if (found !== null) {
        m.tmdbChecked += 1
        tmdb = found
      }
    }
    m.total += 1
    if (provider) m.provider += 1
    if (tmdb) m.tmdb += 1
    if (provider && tmdb) m.both += 1
    if (provider || tmdb) m.any += 1
  }
  report(`amostra de ${m.total} filmes`, m)
}

run().catch((error) => {
  console.error('  ✗ ERRO NO ROTEIRO:', error instanceof Error ? error.message : 'falha desconhecida')
  process.exit(1)
})
