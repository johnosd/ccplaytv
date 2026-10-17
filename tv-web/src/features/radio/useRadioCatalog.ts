import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppLanguage } from '../../lib/i18n/languages'
import type { Translator } from '../../lib/i18n/translate'
import { countryDisplayName } from '../../lib/radio/countryNames'
import { readCachedCountries, readCachedStations, writeCachedCountries, writeCachedStations } from '../../lib/radio/radioCache'
import { RadioDirectoryError, type RadioDirectory, type RadioDirectoryFailure } from '../../lib/radio/radioDirectory'
import { favoriteAsStation, listRadioFavorites } from '../../lib/radio/radioFavorites'
import type { RadioCountry, RadioEntryKey, RadioStation } from '../../lib/radio/radioTypes'
import { tvCountryCode } from '../../lib/radio/tvCountry'
import { readLastRadioCountry, recalledRadioEntry, rememberRadioEntry, writeLastRadioCountry } from './radioSessionMemory'

/**
 * Países, trilha, entrada atual e estações da Rádio (feature 074, `logic/radio-tela.md` §3).
 *
 * Consulta o diretório só ao montar (países + entrada inicial) e em `enter` — nunca por foco (D-007). Cada `enter` abre
 * uma geração nova com o próprio `AbortController`: resposta de geração antiga é descartada (D-008, contrato 3).
 */

export type TrailEntryKind = 'favorites' | 'world' | 'country' | 'retry-countries'

export interface RadioTrailEntry {
  /** Identidade estável na trilha (é o `id` da `SideCategoryNav`). */
  id: string
  kind: TrailEntryKind
  /** Ausente em `retry-countries` (ação, não entrada). */
  key?: RadioEntryKey
  label: string
  count?: number
}

export type StationsStatus = 'loading' | 'ready' | 'error'

export interface RadioStationsState {
  entry: RadioEntryKey
  status: StationsStatus
  stations: RadioStation[]
  /** Mostrado do cache vencido porque a busca falhou (FR-024). */
  stale: boolean
  failure?: RadioDirectoryFailure
}

const BRAZIL = 'BR'

function countryOf(entry: RadioEntryKey): string | null {
  return entry.startsWith('country:') ? entry.slice('country:'.length) : null
}

/** `logic/radio-tela.md` §3.2. */
function initialEntry(): RadioEntryKey {
  const remembered = recalledRadioEntry()
  if (remembered) return remembered
  return `country:${readLastRadioCountry() ?? tvCountryCode() ?? BRAZIL}`
}

function failureOf(error: unknown): RadioDirectoryFailure {
  return error instanceof RadioDirectoryError ? error.kind : 'offline'
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function useRadioCatalog(directory: RadioDirectory, language: AppLanguage, t: Translator) {
  const [countries, setCountries] = useState<RadioCountry[] | null>(null)
  const [countriesFailed, setCountriesFailed] = useState(false)
  const [entered, setEntered] = useState<RadioEntryKey>(initialEntry)
  const [state, setState] = useState<RadioStationsState>(() => ({ entry: entered, status: 'loading', stations: [], stale: false }))
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const tvCountry = useMemo(() => tvCountryCode(), [])

  const loadCountries = useCallback(async () => {
    setCountriesFailed(false)
    const cached = await readCachedCountries()
    if (cached) setCountries(cached.value)
    if (cached?.fresh) return
    try {
      const fresh = await directory.listCountries()
      setCountries(fresh)
      void writeCachedCountries(fresh)
    } catch {
      if (!cached) setCountriesFailed(true)
    }
  }, [directory])

  const enter = useCallback(
    (entry: RadioEntryKey) => {
      generation.current += 1
      const mine = generation.current
      controller.current?.abort()
      const abort = new AbortController()
      controller.current = abort
      setEntered(entry)
      rememberRadioEntry(entry)
      const country = countryOf(entry)
      if (country) writeLastRadioCountry(country)
      setState({ entry, status: 'loading', stations: [], stale: false })
      const apply = (next: RadioStationsState) => {
        if (generation.current === mine) setState(next)
      }

      void (async () => {
        if (entry === 'favorites') {
          const favorites = await listRadioFavorites()
          apply({ entry, status: 'ready', stations: favorites.map(favoriteAsStation), stale: false })
          return
        }
        const cached = await readCachedStations(entry)
        if (generation.current !== mine) return
        if (cached) apply({ entry, status: 'ready', stations: cached.value, stale: false })
        if (cached?.fresh) return
        try {
          const stations = await directory.listStations({ countryCode: country }, abort.signal)
          void writeCachedStations(entry, stations)
          apply({ entry, status: 'ready', stations, stale: false })
        } catch (error) {
          if (isAbort(error)) return
          const failure = failureOf(error)
          apply(
            cached
              ? { entry, status: 'ready', stations: cached.value, stale: true, failure }
              : { entry, status: 'error', stations: [], stale: false, failure },
          )
        }
      })()
    },
    [directory],
  )

  /** Lista de Favoritos relida depois de favoritar/desfavoritar, só se for a entrada atual (sem nova geração). */
  const reloadFavorites = useCallback(async () => {
    if (entered !== 'favorites') return
    const mine = generation.current
    const favorites = await listRadioFavorites()
    if (generation.current === mine) {
      setState({ entry: 'favorites', status: 'ready', stations: favorites.map(favoriteAsStation), stale: false })
    }
  }, [entered])

  useEffect(() => {
    void loadCountries()
    enter(entered)
    return () => {
      generation.current += 1
      controller.current?.abort()
    }
    // Só ao montar: a entrada inicial é decidida uma vez (§3.2).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trail = useMemo<RadioTrailEntry[]>(() => {
    const entries: RadioTrailEntry[] = [
      { id: 'favorites', kind: 'favorites', key: 'favorites', label: t('radio.favorites') },
      { id: 'world', kind: 'world', key: 'world', label: t('radio.world') },
    ]
    const nameOf = (country: RadioCountry) => countryDisplayName(country.code, language, country.directoryName)
    if (countries && countries.length > 0) {
      const first = countries.find((country) => country.code === tvCountry)
      const rest = countries
        .filter((country) => country !== first)
        .sort((a, b) => b.stationCount - a.stationCount || nameOf(a).localeCompare(nameOf(b), language))
      for (const country of first ? [first, ...rest] : rest) {
        entries.push({ id: `country:${country.code}`, kind: 'country', key: `country:${country.code}`, label: nameOf(country), count: country.stationCount })
      }
      return entries
    }
    // Sem lista de países: a entrada inicial continua alcançável, e uma ação recarrega a lista (§3).
    const code = countryOf(entered)
    if (code) entries.push({ id: entered, kind: 'country', key: entered, label: countryDisplayName(code, language) })
    if (countriesFailed) entries.push({ id: 'retry-countries', kind: 'retry-countries', label: t('radio.retryCountries') })
    return entries
  }, [countries, countriesFailed, entered, language, t, tvCountry])

  const totalOf = useCallback(
    (entry: RadioEntryKey): number | undefined => {
      const code = countryOf(entry)
      return code ? countries?.find((country) => country.code === code)?.stationCount : undefined
    },
    [countries],
  )

  return { trail, entered, state, enter, reloadFavorites, retryCountries: loadCountries, totalOf }
}

export type RadioCatalog = ReturnType<typeof useRadioCatalog>
