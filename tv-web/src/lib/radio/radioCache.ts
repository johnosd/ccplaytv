import { radioDb, type RadioDb } from './radioDb'
import type { RadioCountry, RadioEntryKey, RadioStation } from './radioTypes'

/**
 * Cache local do diretório (feature 074, FR-024, D-009; `data-model.md` §3). Vencido não é apagado: é o que a tela
 * mostra, com aviso, quando a rede ou o diretório falham. Nenhuma função aqui lança — armazenamento indisponível é
 * "sem cache".
 */

export const COUNTRIES_FRESH_MS = 7 * 24 * 60 * 60 * 1000
export const STATIONS_FRESH_MS = 6 * 60 * 60 * 1000

export interface Cached<T> {
  value: T
  fetchedAt: number
  fresh: boolean
}

type StationEntry = Exclude<RadioEntryKey, 'favorites'>

function stationsKey(entry: StationEntry): `stations:${string}` {
  return `stations:${entry}`
}

export async function readCachedCountries(now = Date.now(), database: RadioDb = radioDb): Promise<Cached<RadioCountry[]> | null> {
  try {
    const row = await database.directoryCache.get('countries')
    if (!row?.countries) return null
    return { value: row.countries, fetchedAt: row.fetchedAt, fresh: now - row.fetchedAt < COUNTRIES_FRESH_MS }
  } catch {
    return null
  }
}

export async function writeCachedCountries(countries: RadioCountry[], now = Date.now(), database: RadioDb = radioDb): Promise<void> {
  try {
    await database.directoryCache.put({ key: 'countries', fetchedAt: now, countries })
  } catch {
    // Sem armazenamento: a próxima abertura busca de novo.
  }
}

export async function readCachedStations(
  entry: StationEntry,
  now = Date.now(),
  database: RadioDb = radioDb,
): Promise<Cached<RadioStation[]> | null> {
  try {
    const row = await database.directoryCache.get(stationsKey(entry))
    if (!row?.stations) return null
    return { value: row.stations, fetchedAt: row.fetchedAt, fresh: now - row.fetchedAt < STATIONS_FRESH_MS }
  } catch {
    return null
  }
}

export async function writeCachedStations(
  entry: StationEntry,
  stations: RadioStation[],
  now = Date.now(),
  database: RadioDb = radioDb,
): Promise<void> {
  try {
    await database.directoryCache.put({ key: stationsKey(entry), fetchedAt: now, stations })
  } catch {
    // Idem.
  }
}
