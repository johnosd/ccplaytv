// Medição no PC com a lista REAL (feature 082): quanto o catálogo e o guia ocupam como o app grava hoje, e quanto
// ocupariam enxutos / comprimidos / em pedaços. A taxa de compressão não depende do aparelho, então vale para a TV.
// Também gera amostras sanitizadas (sem host do provedor, sem credencial, sem URL de stream) para a sonda 2 da TV.
// Credenciais: CCPLAY_PROBE_* do .env da raiz, lidas em tempo de execução e NUNCA impressas.
// Uso (da raiz):  node sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/medir-lista-real.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync, deflateRawSync, gunzipSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..', '..', '..')
const env = Object.fromEntries(readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)
  .map((line) => line.match(/^\s*(CCPLAY_PROBE_\w+)\s*=\s*"?(.*?)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const { CCPLAY_PROBE_DNS: dns, CCPLAY_PROBE_USER: user, CCPLAY_PROBE_PASS: pass, CCPLAY_PROBE_EPG: epgUrl } = env
if (!dns || !user || !pass) { console.error('Faltam CCPLAY_PROBE_DNS/USER/PASS no .env da raiz.'); process.exit(2) }
const secrets = [user, pass, new URL(dns).host].filter((value) => value && value.length >= 3)

async function api(action) {
  const url = `${dns.replace(/\/$/, '')}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=${action}`
  const response = await fetch(url).catch(() => null)
  if (!response || !response.ok) throw new Error(`${action}: falhou (${response ? response.status : 'rede'})`)
  return response.json()
}

// Mesmo formato aproximado do BlockItem do app (categoryLoader.toItemRecord + toBlockItem): JSON.stringify ≈ structured clone.
const FIXTURE_HOST = 'img.fixture.test'
function cleanIcon(value) {
  if (typeof value !== 'string' || !value) return undefined
  try { const url = new URL(value); url.host = FIXTURE_HOST; url.username = ''; url.password = ''; url.search = ''; return url.toString() } catch { return undefined }
}
const num = (value) => (value === undefined || value === null || value === '' || Number.isNaN(Number(value)) ? undefined : Number(value))
function mapItem(kind, raw, categories, index) {
  const name = String(raw.name ?? '').trim()
  const categoryId = raw.category_id == null ? '' : String(raw.category_id)
  const base = { id: -(Number(categoryId || 0) * 4294967296 + index), name, originalName: name, group: categories.get(categoryId),
    providerCategoryId: categoryId }
  if (kind === 'movie') return { ...base, providerStreamId: String(raw.stream_id), streamExtension: raw.container_extension ?? 'mp4',
    iconUrl: cleanIcon(raw.stream_icon), year: num(raw.year), addedAt: num(raw.added) ? num(raw.added) * 1000 : undefined, providerRating: num(raw.rating) }
  if (kind === 'series') return { ...base, seriesId: String(raw.series_id), iconUrl: cleanIcon(raw.cover), year: num(raw.year),
    addedAt: num(raw.last_modified) ? num(raw.last_modified) * 1000 : undefined, providerRating: num(raw.rating), providerGenres: raw.genre || undefined,
    providerBackdropUrl: Array.isArray(raw.backdrop_path) ? cleanIcon(raw.backdrop_path[0]) : undefined }
  return { ...base, providerStreamId: String(raw.stream_id), iconUrl: cleanIcon(raw.stream_icon), epgChannelId: raw.epg_channel_id || undefined,
    archiveDays: num(raw.tv_archive_duration) || undefined }
}
function lean(item) {
  const { group, providerCategoryId, originalName, ...rest } = item
  void group; void providerCategoryId
  if (originalName !== item.name) rest.originalName = originalName
  return rest
}
const bytes = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value))
const gz = (value) => gzipSync(typeof value === 'string' ? value : JSON.stringify(value)).length
const dr = (value) => deflateRawSync(typeof value === 'string' ? value : JSON.stringify(value)).length
const chunks = (items, size) => { const out = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out }
const MB = (value) => +(value / 1024 / 1024).toFixed(2)
function assertClean(text, label) { for (const secret of secrets) if (text.includes(secret)) throw new Error(`amostra ${label} contém dado sensível — abortado`) }

const result = { at: new Date().toISOString(), kinds: {}, epg: null }
const samples = {}
for (const [kind, action, catAction] of [['channel', 'get_live_streams', 'get_live_categories'], ['movie', 'get_vod_streams', 'get_vod_categories'], ['series', 'get_series', 'get_series_categories']]) {
  const [raw, cats] = await Promise.all([api(action), api(catAction)])
  const categories = new Map(cats.map((c) => [String(c.category_id), String(c.category_name ?? '')]))
  const byCategory = new Map()
  raw.forEach((entry, index) => {
    const item = mapItem(kind, entry, categories, index)
    if (!item.name) return
    const list = byCategory.get(item.providerCategoryId) ?? []
    list.push(item); byCategory.set(item.providerCategoryId, list)
  })
  const groups = [...byCategory.values()]
  const sum = (fn) => groups.reduce((total, items) => total + fn(items), 0)
  const r = { rawJsonMB: MB(bytes(raw)), items: groups.reduce((t, g) => t + g.length, 0), categories: groups.length,
    largestCategory: Math.max(...groups.map((g) => g.length)),
    blocksJsonMB: MB(sum((g) => bytes(g))), leanJsonMB: MB(sum((g) => bytes(g.map(lean)))),
    // Projeção da 065: 2ª cópia (com campos repetidos por item) só das categorias com ≥ 1000 itens.
    projectionCopyMB: MB(sum((g) => (g.length >= 1000 ? bytes(g.map((item) => ({ ...item, sourceId: 'x'.repeat(36), generation: 1, kind, categoryId: 1, groupOrder: 1, categoryPosition: 1, hasPlayback: true }))) : 0))),
    gzipBlocksMB: MB(sum((g) => gz(g))), gzipLeanMB: MB(sum((g) => gz(g.map(lean)))), deflateRawLeanMB: MB(sum((g) => dr(g.map(lean)))),
    gzipLeanChunksMB: {} }
  for (const size of [250, 500, 1000, 2000]) r.gzipLeanChunksMB[size] = MB(sum((g) => chunks(g.map(lean), size).reduce((t, c) => t + gz(c), 0)))
  r.ratioLeanGzip = +(r.blocksJsonMB / r.gzipLeanMB).toFixed(1)
  result.kinds[kind] = r
  const largest = groups.reduce((a, b) => (b.length > a.length ? b : a))
  samples[kind] = largest.map((item) => ({ ...item, group: 'Categoria', name: item.name, originalName: item.originalName }))
  console.log(`${kind}: ${r.items} itens em ${r.categories} categorias | blocos ${r.blocksJsonMB} MB | enxuto ${r.leanJsonMB} MB | gzip ${r.gzipLeanMB} MB (${r.ratioLeanGzip}x) | projeção ${r.projectionCopyMB} MB`)
}

{
  let response = epgUrl ? await fetch(epgUrl).catch(() => null) : null
  if (!response || !response.ok) {
    // Reserva: o endereço XMLTV padrão do próprio painel.
    response = await fetch(`${dns.replace(/\/$/, '')}/xmltv.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`).catch(() => null)
  }
  if (response && response.ok) {
    let buffer = Buffer.from(await response.arrayBuffer())
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = gunzipSync(buffer)
    const xml = buffer.toString('utf8')
    const parseTime = (value) => { const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/.exec(value ?? ''); if (!m) return NaN
      const offset = m[7] ? (Number(m[7].slice(0, 3)) * 60 + Math.sign(Number(m[7].slice(0, 3)) || 1) * Number(m[7].slice(3))) * 60000 : 0
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offset }
    const programs = []
    for (const m of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g)) {
      const attrs = m[1]; const body = m[2]
      const channelKey = /channel="([^"]*)"/.exec(attrs)?.[1]; const start = parseTime(/start="([^"]*)"/.exec(attrs)?.[1]); const end = parseTime(/stop="([^"]*)"/.exec(attrs)?.[1])
      const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(body)?.[1]?.trim(); const description = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(body)?.[1]?.trim()
      if (channelKey && title && Number.isFinite(start) && Number.isFinite(end)) programs.push({ sourceId: 'x'.repeat(36), generation: 1, channelKey, start, end, title, ...(description ? { description } : {}) })
    }
    const now = Date.now()
    const inWindow = programs.filter((p) => p.end >= now - 12 * 3600e3 && p.start <= now + 48 * 3600e3)
    const byChannel = new Map(); for (const p of inWindow) { const l = byChannel.get(p.channelKey) ?? []; l.push(p); byChannel.set(p.channelKey, l) }
    const leanProgram = ({ channelKey, start, end, title, description }) => ({ s: start, e: end, t: title, ...(description ? { d: description } : {}) })
    result.epg = { xmlMB: MB(buffer.length), programs: programs.length, inWindow: inWindow.length, channels: byChannel.size,
      rowsJsonMB: MB(bytes(inWindow)), withoutDescriptionJsonMB: MB(bytes(inWindow.map(({ description, ...p }) => (void description, p)))),
      gzipPerChannelLeanMB: MB([...byChannel.values()].reduce((t, l) => t + gz(l.map(leanProgram)), 0)) }
    samples.epg = [...byChannel.values()].slice(0, 60).flat().map((p) => ({ ...p, sourceId: 'x'.repeat(36) }))
    console.log(`guia: ${result.epg.programs} programas (${result.epg.inWindow} na janela), linhas ${result.epg.rowsJsonMB} MB | gzip por canal ${result.epg.gzipPerChannelLeanMB} MB`)
  } else console.log('guia: falhou baixar (sem detalhes, para não expor o endereço)')
}

const totalNow = Object.values(result.kinds).reduce((t, k) => t + k.blocksJsonMB + k.projectionCopyMB, 0) + (result.epg?.rowsJsonMB ?? 0)
const totalGzip = Object.values(result.kinds).reduce((t, k) => t + k.gzipLeanChunksMB[500], 0) + (result.epg?.gzipPerChannelLeanMB ?? 0)
result.summary = { estimatedNowMB: +totalNow.toFixed(1), estimatedLeanGzipChunks500MB: +totalGzip.toFixed(1) }
console.log(`TOTAL estimado hoje (blocos + projeção + guia): ${result.summary.estimatedNowMB} MB | enxuto+gzip em pedaços de 500: ${result.summary.estimatedLeanGzipChunks500MB} MB`)

const day = new Date().toISOString().slice(0, 10)
writeFileSync(resolve(here, '..', 'evidencias', `medicao-lista-real-pc-${day}.json`), JSON.stringify(result, null, 2))
const sampleDir = resolve(here, '.amostras'); mkdirSync(sampleDir, { recursive: true })
for (const [name, items] of Object.entries(samples)) { const text = JSON.stringify(items); assertClean(text, name); writeFileSync(resolve(sampleDir, `${name}.json`), text) }
console.log('Amostras sanitizadas em sonda-tv/.amostras/ (fora do git).')
