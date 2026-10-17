import { radioStationId, type RadioCountry, type RadioStation } from './radioTypes'

/**
 * Validação e normalização das respostas do Radio Browser (feature 074, `logic/diretorio.md` §5). Dado de provedor é
 * não confiável: nada aqui confia em tipo, tamanho ou esquema de URL.
 */

const MAX_URL_LENGTH = 4096
const MAX_NAME_LENGTH = 120
const MAX_TAGS = 5
const MAX_CODEC_LENGTH = 16
const COUNTRY_CODE = /^[A-Z]{2}$/

/** URL http(s) pública, sem usuário/senha, sem caractere de controle nem barra invertida. `undefined` se não servir. */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const candidate = value.trim()
  // eslint-disable-next-line no-control-regex -- é exatamente isso que se recusa
  if (!candidate || candidate.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f\\]/.test(candidate)) return undefined
  try {
    const parsed = new URL(candidate)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) return undefined
    if (parsed.username || parsed.password) return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

function countryCodeOf(value: unknown): string {
  if (typeof value !== 'string') return ''
  const code = value.trim().toUpperCase()
  return COUNTRY_CODE.test(code) ? code : ''
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Um país do `/json/countries`, ou `null` se inválido. */
export function parseCountry(raw: unknown): RadioCountry | null {
  const entry = record(raw)
  if (!entry) return null
  const code = countryCodeOf(entry.iso_3166_1 ?? entry.countrycode)
  const stationCount = Number(entry.stationcount)
  if (!code || !Number.isInteger(stationCount) || stationCount <= 0) return null
  return { code, directoryName: text(entry.name, MAX_NAME_LENGTH) || code, stationCount }
}

/** Uma estação, ou `null` se faltar identidade, URL utilizável ou nome. */
export function parseStation(raw: unknown): RadioStation | null {
  const entry = record(raw)
  if (!entry) return null
  const uuid = text(entry.stationuuid, 64)
  const streamUrl = safeHttpUrl(entry.url_resolved)
  const name = text(entry.name, MAX_NAME_LENGTH)
  if (!uuid || !streamUrl || !name) return null

  const tags =
    typeof entry.tags === 'string'
      ? entry.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, MAX_TAGS)
      : []
  const bitrate = Number(entry.bitrate)
  const popularity = Number(entry.clickcount)
  const codec = text(entry.codec, MAX_CODEC_LENGTH)
  const artUrl = safeHttpUrl(entry.favicon)

  return {
    id: radioStationId(uuid),
    uuid,
    name,
    streamUrl,
    ...(artUrl ? { artUrl } : {}),
    countryCode: countryCodeOf(entry.countrycode),
    tags,
    ...(codec ? { codec } : {}),
    ...(Number.isInteger(bitrate) && bitrate > 0 ? { bitrate } : {}),
    hls: entry.hls === 1 || entry.hls === true || entry.hls === '1',
    popularity: Number.isFinite(popularity) ? popularity : 0,
  }
}

/** Lista de estações válidas, sem `uuid` repetido (fica o primeiro), na ordem do diretório, cortada em `limit`. */
export function parseStations(raw: unknown[], limit: number): RadioStation[] {
  const seen = new Set<string>()
  const stations: RadioStation[] = []
  for (const item of raw) {
    const station = parseStation(item)
    if (!station || seen.has(station.uuid)) continue
    seen.add(station.uuid)
    stations.push(station)
    if (stations.length >= limit) break
  }
  return stations
}

export function parseCountries(raw: unknown[]): RadioCountry[] {
  const seen = new Set<string>()
  const countries: RadioCountry[] = []
  for (const item of raw) {
    const country = parseCountry(item)
    if (!country || seen.has(country.code)) continue
    seen.add(country.code)
    countries.push(country)
  }
  return countries
}
