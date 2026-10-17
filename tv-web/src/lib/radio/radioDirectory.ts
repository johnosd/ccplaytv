import { isRequestAbortError, requestDeadline } from '../metadata/requestDeadline'
import { parseCountries, parseStations } from './radioParse'
import type { RadioCountry, RadioStation } from './radioTypes'

/**
 * Único ponto de rede do diretório Radio Browser (feature 074, ADR-018 §3; `logic/diretorio.md`).
 *
 * Só sai daqui o código do país, o `uuid` da estação e os parâmetros fixos (FR-026). Nenhum `console.*`, e nenhuma
 * mensagem de erro carrega URL: toda falha vira `RadioDirectoryError` com categoria fixa (FR-027).
 */

/** Quantas estações por país/mundo (spec FR-008). */
export const STATION_LIMIT = 100

export type RadioDirectoryFailure = 'offline' | 'refused' | 'rate_limited' | 'bad_response'

export class RadioDirectoryError extends Error {
  readonly kind: RadioDirectoryFailure

  constructor(kind: RadioDirectoryFailure) {
    // Mensagem fixa por categoria: nunca a do `fetch`, nunca URL (spec FR-027).
    super(`radio:${kind}`)
    this.name = 'RadioDirectoryError'
    this.kind = kind
  }
}

/** `countryCode: null` = "Mais ouvidas no mundo". */
export interface StationQuery {
  countryCode: string | null
}

export interface RadioDirectory {
  listCountries(signal?: AbortSignal): Promise<RadioCountry[]>
  /** Até `STATION_LIMIT` estações não quebradas, das mais ouvidas para as menos, sem duplicar `uuid`. */
  listStations(query: StationQuery, signal?: AbortSignal): Promise<RadioStation[]>
  /** Versão atual das estações (favoritos, FR-023). Estação que saiu do diretório simplesmente não vem. */
  stationsByUuid(uuids: string[], signal?: AbortSignal): Promise<RadioStation[]>
  /** POST `/json/url/{uuid}` depois que a estação começou a tocar (FR-019). Nunca lança, nunca espera. */
  reportClick(uuid: string): void
}

export interface RadioDirectoryOptions {
  /** Injetável para teste. */
  fetchImpl?: typeof fetch
  /** Sorteio da ordem dos espelhos (injetável para teste). */
  random?: () => number
}

const SERVERS_URL = 'https://all.api.radio-browser.info/json/servers'
const FALLBACK_MIRROR = 'https://de1.api.radio-browser.info'
const MAX_PROBES = 4
const SERVERS_TIMEOUT_MS = 5_000
const PROBE_TIMEOUT_MS = 3_000
const DATA_TIMEOUT_MS = 10_000
const HOST_NAME = /^[a-z0-9.-]+$/i
// O navegador pode descartar este cabeçalho (ADR-018 §3, R-002); o serviço o aceita no CORS.
const HEADERS = { Accept: 'application/json', 'User-Agent': 'CCPlayTv' }

function looksLikeMarkup(contentType: string, body: string): boolean {
  const type = contentType.toLowerCase()
  if (type.includes('html') || type.includes('xml')) return true
  return /^\s*</.test(body)
}

export function createRadioDirectory(options: RadioDirectoryOptions = {}): RadioDirectory {
  const fetchImpl = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  const random = options.random ?? Math.random
  let mirror: Promise<string> | null = null

  /** GET com prazo, categorias fixas e JSON validado como texto (FR-025). */
  async function getJson(url: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<unknown> {
    try {
      return await requestDeadline(
        async (deadlineSignal) => {
          const response = await fetchImpl(url, { headers: HEADERS, signal: deadlineSignal })
          if (response.status === 401 || response.status === 403) throw new RadioDirectoryError('refused')
          if (response.status === 429) throw new RadioDirectoryError('rate_limited')
          if (!response.ok) throw new RadioDirectoryError('offline')
          const body = await response.text()
          if (looksLikeMarkup(response.headers.get('Content-Type') ?? '', body)) throw new RadioDirectoryError('bad_response')
          try {
            return JSON.parse(body.replace(/^﻿/, '')) as unknown
          } catch {
            throw new RadioDirectoryError('bad_response')
          }
        },
        { signal, timeoutMs },
      )
    } catch (error) {
      if (error instanceof RadioDirectoryError) throw error
      if (isRequestAbortError(error) && signal?.aborted) throw error
      throw new RadioDirectoryError('offline')
    }
  }

  async function probe(base: string): Promise<boolean> {
    try {
      const stats = await getJson(`${base}/json/stats`, undefined, PROBE_TIMEOUT_MS)
      return stats !== null && typeof stats === 'object' && !Array.isArray(stats)
    } catch {
      return false
    }
  }

  async function discover(): Promise<string> {
    try {
      const servers = await getJson(SERVERS_URL, undefined, SERVERS_TIMEOUT_MS)
      if (Array.isArray(servers)) {
        const names = [...new Set(
          servers
            .map((server) => (server && typeof server === 'object' ? (server as { name?: unknown }).name : undefined))
            .filter((name): name is string => typeof name === 'string' && HOST_NAME.test(name)),
        )]
        // Fisher-Yates: a ordem aleatória espalha a carga entre os espelhos, como o serviço pede.
        for (let i = names.length - 1; i > 0; i -= 1) {
          const j = Math.floor(random() * (i + 1))
          ;[names[i], names[j]] = [names[j], names[i]]
        }
        for (const name of names.slice(0, MAX_PROBES)) {
          const base = `https://${name}`
          if (await probe(base)) return base
        }
      }
    } catch {
      // Sem lista de espelhos: cai no de1, como o próprio serviço documenta.
    }
    return FALLBACK_MIRROR
  }

  function resolveMirror(): Promise<string> {
    mirror ??= discover()
    return mirror
  }

  /** Requisição pelo espelho; falha de rede descarta o espelho e tenta de novo uma vez (`logic/diretorio.md` §2). */
  async function viaMirror(path: string, signal: AbortSignal | undefined): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const base = await resolveMirror()
      try {
        return await getJson(`${base}${path}`, signal, DATA_TIMEOUT_MS)
      } catch (error) {
        if (attempt > 0 || !(error instanceof RadioDirectoryError) || error.kind !== 'offline') throw error
        mirror = null
      }
    }
  }

  async function arrayVia(path: string, signal: AbortSignal | undefined): Promise<unknown[]> {
    const data = await viaMirror(path, signal)
    if (!Array.isArray(data)) throw new RadioDirectoryError('bad_response')
    return data
  }

  return {
    async listCountries(signal) {
      return parseCountries(await arrayVia('/json/countries', signal))
    },

    async listStations(query, signal) {
      const params = new URLSearchParams()
      if (query.countryCode) params.set('countrycode', query.countryCode)
      params.set('hidebroken', 'true')
      params.set('order', 'clickcount')
      params.set('reverse', 'true')
      params.set('limit', String(STATION_LIMIT))
      return parseStations(await arrayVia(`/json/stations/search?${params.toString()}`, signal), STATION_LIMIT)
    },

    async stationsByUuid(uuids, signal) {
      const wanted = uuids.filter(Boolean)
      if (wanted.length === 0) return []
      const params = new URLSearchParams({ uuids: wanted.join(',') })
      return parseStations(await arrayVia(`/json/stations/byuuid?${params.toString()}`, signal), wanted.length)
    },

    reportClick(uuid) {
      if (!uuid) return
      void resolveMirror()
        .then((base) => fetchImpl(`${base}/json/url/${encodeURIComponent(uuid)}`, { method: 'POST', headers: HEADERS }))
        .catch(() => {
          // Contagem de cliques é cortesia ao diretório: falhar não afeta a reprodução (FR-019).
        })
    },
  }
}
