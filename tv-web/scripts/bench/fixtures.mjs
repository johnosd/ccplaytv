// Feature 063 (US3, item 35): fontes FICTÍCIAS e determinísticas do benchmark
// de importação — mesma semente, mesmo conteúdo, byte a byte (SC-007). Nunca
// fonte real, nunca credencial. Formato e distribuição:
// `sdd/specs/063-codigo-saudavel-benchmark/logic/benchmark.md` §2.

export const BENCH_FORMATS = /** @type {const} */ (['xtream', 'm3u', 'xmltv'])
export const BENCH_SIZES = /** @type {const} */ ([1_000, 10_000, 100_000])
export const DEFAULT_SEED = 1

/** Instante base fixo (ms): o XMLTV parte dele e a bancada o usa como `now` e janela. */
export const BENCH_CLOCK = Date.UTC(2026, 0, 1, 12, 0, 0)

/** Host que nunca é resolvido: toda URL das fontes fictícias aponta para cá. */
const HOST = '127.0.0.1'
const USER = 'bench'
const PASSWORD = 'bench'

const WORDS = [
  'Aurora', 'Brasa', 'Cinza', 'Delta', 'Eclipse', 'Faro', 'Garoa', 'Horizonte', 'Ilha', 'Jade', 'Kairós', 'Lume',
  'Maré', 'Névoa', 'Oásis', 'Prisma', 'Quasar', 'Raio', 'Sol', 'Trilha', 'Umbra', 'Vento', 'Zênite', 'Âmbar',
]

/**
 * @typedef {'xtream' | 'm3u' | 'xmltv'} BenchFormat
 *
 * @typedef {object} BenchFixture
 * @property {BenchFormat} format
 * @property {number} size    entradas no total (itens Xtream das 3 seções / `#EXTINF` / `<programme>`)
 * @property {number} seed
 * @property {number} clock   instante base (ms) de que o XMLTV parte; a bancada o usa como `now`
 * @property {Record<string, string>} files
 *   corpo de cada resposta, pela chave que o servidor do benchmark serve:
 *   xtream → `auth` e cada `action` (`get_live_categories`, `get_live_streams`, `get_vod_categories`,
 *   `get_vod_streams`, `get_series_categories`, `get_series`); m3u → `playlist.m3u`; xmltv → `epg.xml`.
 * @property {{ categories: number, items: number }} expected
 *   o que a importação tem de produzir (xmltv: `categories` = canais, `items` = programas).
 */

/** PRNG de 32 bits (mulberry32): a única fonte de aleatoriedade das fixtures. */
function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `{ live, vod, series }`: 40% / 40% / o resto (20%), somando exatamente `size`. */
function splitSections(size) {
  const live = Math.round(size * 0.4)
  const vod = Math.round(size * 0.4)
  return { live, vod, series: size - live - vod }
}

const categoryCount = (items) => Math.max(2, Math.round(items / 500))

function titleOf(random, index) {
  return `${WORDS[Math.floor(random() * WORDS.length)]} ${WORDS[Math.floor(random() * WORDS.length)]} ${index}`
}

function xtreamFixture(size, seed) {
  const random = createRandom(seed)
  const sections = splitSections(size)
  const categories = (prefix, firstId, count) =>
    Array.from({ length: count }, (_, i) => ({ category_id: String(firstId + i), category_name: `${prefix} ${i + 1}`, parent_id: 0 }))
  const liveCategories = categories('Canais', 1, categoryCount(sections.live))
  const vodCategories = categories('Filmes', 1000, categoryCount(sections.vod))
  const seriesCategories = categories('Séries', 2000, categoryCount(sections.series))

  const live = Array.from({ length: sections.live }, (_, i) => ({
    num: i + 1,
    name: titleOf(random, i + 1),
    stream_type: 'live',
    stream_id: 10_000 + i,
    category_id: liveCategories[i % liveCategories.length].category_id,
    tv_archive: 0,
  }))
  const vod = Array.from({ length: sections.vod }, (_, i) => ({
    num: i + 1,
    name: titleOf(random, i + 1),
    stream_type: 'movie',
    stream_id: 500_000 + i,
    rating: (5 + Math.floor(random() * 50) / 10).toFixed(1),
    year: String(1980 + Math.floor(random() * 45)),
    added: String(1_700_000_000 + Math.floor(random() * 50_000_000)),
    category_id: vodCategories[i % vodCategories.length].category_id,
    container_extension: 'mp4',
  }))
  const series = Array.from({ length: sections.series }, (_, i) => ({
    num: i + 1,
    name: titleOf(random, i + 1),
    series_id: 900_000 + i,
    rating: (5 + Math.floor(random() * 50) / 10).toFixed(1),
    year: String(1980 + Math.floor(random() * 45)),
    category_id: seriesCategories[i % seriesCategories.length].category_id,
  }))

  const expiresAtSeconds = Math.floor(BENCH_CLOCK / 1000) + 10 * 365 * 24 * 3600
  const auth = {
    user_info: {
      auth: 1,
      status: 'Active',
      exp_date: String(expiresAtSeconds),
      is_trial: '0',
      active_cons: '0',
      max_connections: '1',
      allowed_output_formats: ['ts', 'm3u8'],
    },
    server_info: { url: HOST, timezone: 'UTC' },
  }

  return {
    files: {
      auth: JSON.stringify(auth),
      get_live_categories: JSON.stringify(liveCategories),
      get_live_streams: JSON.stringify(live),
      get_vod_categories: JSON.stringify(vodCategories),
      get_vod_streams: JSON.stringify(vod),
      get_series_categories: JSON.stringify(seriesCategories),
      get_series: JSON.stringify(series),
    },
    expected: { categories: liveCategories.length + vodCategories.length + seriesCategories.length, items: size },
  }
}

function m3uFixture(size, seed) {
  const random = createRandom(seed)
  const sections = splitSections(size)
  const lines = ['#EXTM3U']
  const groups = { live: categoryCount(sections.live), vod: categoryCount(sections.vod), series: categoryCount(sections.series) }

  const entry = (name, group, url) => {
    lines.push(`#EXTINF:-1 tvg-id="" tvg-name="${name}" tvg-logo="" group-title="${group}",${name}`)
    lines.push(url)
  }
  for (let i = 0; i < sections.live; i += 1) {
    entry(titleOf(random, i + 1), `Canais ${(i % groups.live) + 1}`, `http://${HOST}/live/${USER}/${PASSWORD}/${10_000 + i}.ts`)
  }
  for (let i = 0; i < sections.vod; i += 1) {
    entry(titleOf(random, i + 1), `Filmes ${(i % groups.vod) + 1}`, `http://${HOST}/movie/${USER}/${PASSWORD}/${500_000 + i}.mp4`)
  }
  for (let i = 0; i < sections.series; i += 1) {
    entry(`${titleOf(random, i + 1)} S01E01`, `Séries ${(i % groups.series) + 1}`, `http://${HOST}/series/${USER}/${PASSWORD}/${900_000 + i}.mkv`)
  }
  return {
    files: { 'playlist.m3u': `${lines.join('\n')}\n` },
    expected: { categories: groups.live + groups.vod + groups.series, items: size },
  }
}

const pad = (value) => String(value).padStart(2, '0')

/** `YYYYMMDDhhmmss +0000`, sempre UTC e sem `Date` do relógio. */
function xmltvTime(epochMs) {
  const d = new Date(epochMs)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`
}

const PROGRAMME_MS = 10 * 60_000

function xmltvFixture(size, seed) {
  const random = createRandom(seed)
  const channels = Math.max(2, Math.round(size / 200))
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="ccplay-bench">']
  for (let c = 0; c < channels; c += 1) {
    out.push(`<channel id="bench.${c}"><display-name>Canal ${c + 1}</display-name></channel>`)
  }
  for (let i = 0; i < size; i += 1) {
    const channel = i % channels
    const start = BENCH_CLOCK + Math.floor(i / channels) * PROGRAMME_MS
    out.push(
      `<programme start="${xmltvTime(start)}" stop="${xmltvTime(start + PROGRAMME_MS)}" channel="bench.${channel}">` +
        `<title>${titleOf(random, i + 1)}</title><desc>Programa fictício ${i + 1}</desc></programme>`,
    )
  }
  out.push('</tv>')
  return { files: { 'epg.xml': `${out.join('\n')}\n` }, expected: { categories: channels, items: size } }
}

/**
 * @param {{ format: BenchFormat, size: number, seed?: number }} options
 * @returns {BenchFixture}
 */
export function generateFixture({ format, size, seed = DEFAULT_SEED }) {
  if (!BENCH_FORMATS.includes(format)) throw new Error(`Formato desconhecido: ${format}`)
  if (!Number.isInteger(size) || size < 1) throw new Error(`Tamanho inválido: ${size}`)
  const build = { xtream: xtreamFixture, m3u: m3uFixture, xmltv: xmltvFixture }[format]
  return { format, size, seed, clock: BENCH_CLOCK, ...build(size, seed) }
}
