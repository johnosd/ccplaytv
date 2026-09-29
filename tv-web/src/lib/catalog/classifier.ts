/**
 * Porta de `api/app/services/classifier.py`.
 *
 * Classificação heurística sem inventar dado: quando a evidência não
 * basta, o item vira `unclassified` — nunca um tipo adivinhado
 * (constitution, "IA e Classificação Nunca Inventam Dados").
 *
 * Função pura sobre entradas já interpretadas. Nesta feature só canais
 * chegam a ser gravados (D-006), mas a classificação continua
 * distinguindo os outros tipos: é assim que se sabe o que foi
 * **descartado de propósito**, e é isso que permite dizer "não é o
 * catálogo completo" com número real em vez de suposição.
 */

import type { ParsedEntry } from './m3uParser'

import type { CatalogItemKind } from './db'

export interface ClassifiedEntry {
  kind: CatalogItemKind
  name: string
  originalName: string
  group?: string
  url?: string
  seriesKey?: string
  seriesName?: string
  seriesId?: string
  seasonNumber?: number
  episodeNumber?: number
  streamExtension?: string
  providerStreamId?: string
  providerCategoryId?: string
  /**
   * Capa/logo declarada pela fonte. Feature 015 (D-002 do plan.md): filme,
   * série e episódio. Feature 024 (R-003, spec Clarifications): também
   * canal — inverte a exclusão original da 015, que era de escopo, não
   * técnica (logo de canal é o mesmo dado, `tvg-logo`, com os mesmos
   * riscos já resolvidos por `normalizeIconUrl`).
   */
  iconUrl?: string
  /**
   * Ano declarado pela fonte em campo próprio (feature 025, FR-049/FR-050) —
   * filme e série do provedor. Nunca inferido do título. `undefined` =
   * ausente, ilegível ou fora de faixa plausível (`logic/metadados-vod.md`).
   */
  year?: number
  /**
   * Instante (epoch ms) em que a fonte declara ter incluído o item (feature
   * 025) — `added` do provedor, só para filme. `last_modified` nunca vira
   * isto (é atualização, não inclusão).
   */
  addedAt?: number
  /** Duração declarada pela fonte, em segundos (feature 025) — só episódio do provedor. */
  durationSeconds?: number
  /**
   * Id de EPG declarado pela fonte (feature 030): `epg_channel_id` (Xtream)
   * ou `tvg-id` (M3U). Só faz sentido em `kind: 'channel'`; quem grava
   * descarta nos demais tipos.
   */
  epgChannelId?: string
}

/**
 * Valida a **forma** de uma URL de capa — fonte única desta checagem
 * (feature 015, D-001b do plan.md), chamada tanto daqui (M3U, `tvg-logo`)
 * quanto de `xtreamConnector.ts` (`stream_icon`/`cover`), pra não
 * triplicar a mesma validação em cada captura. Ausente, vazia, ou que
 * `new URL(...)` rejeite vira `undefined` — nunca chega a `CatalogRecord`
 * como string inválida (FR-008). Nunca lança.
 */
export function normalizeIconUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  try {
    new URL(trimmed)
    return trimmed
  } catch {
    return undefined
  }
}

/**
 * Id de EPG declarado pela fonte para um canal (feature 030, FR-006):
 * `epg_channel_id` (Xtream) ou `tvg-id` (M3U). String com `trim()` não vazia,
 * senão ausente — nunca derivado do nome (FR-008). Não é URL: sem validação
 * de forma além de não ser vazio.
 */
export function normalizeEpgChannelId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

const YEAR_DATE_PATTERN =/^(\d{4})(-\d{2}(-\d{2})?)?$/

/**
 * Ano de 4 dígitos entre 1888 (primeiro filme conhecido) e o ano corrente
 * mais 1 (lançamento anunciado). Aceita número, `"2019"` ou uma data
 * `"2019-06-01"`/`"2019"` — nunca procura um ano dentro de texto livre
 * (feature 025, FR-050, `logic/metadados-vod.md` §1).
 */
export function normalizeYear(raw: unknown, now: number = Date.now()): number | undefined {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined
  const text = String(raw).trim()
  const match = YEAR_DATE_PATTERN.exec(text)
  if (!match) return undefined
  const year = Number(match[1])
  const maxYear = new Date(now).getUTCFullYear() + 1
  if (year < 1888 || year > maxYear) return undefined
  return year
}

const MIN_ADDED_AT_MS = new Date('2000-01-01T00:00:00Z').getTime()
const DIGITS_PATTERN = /^\d+$/

/**
 * Epoch em segundos (número ou string só de dígitos) convertido para epoch
 * em ms. Entre 2000-01-01 e agora + 1 dia — fora dessa faixa, texto,
 * negativo ou `"0"` viram ausência (feature 025, `logic/metadados-vod.md` §1).
 */
export function normalizeAddedAt(raw: unknown, now: number = Date.now()): number | undefined {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined
  const text = String(raw).trim()
  if (!DIGITS_PATTERN.test(text)) return undefined
  const seconds = Number(text)
  if (!Number.isFinite(seconds)) return undefined
  const ms = seconds * 1000
  const maxMs = now + 24 * 60 * 60 * 1000
  if (ms < MIN_ADDED_AT_MS || ms > maxMs) return undefined
  return ms
}

const MAX_DURATION_SECONDS = 24 * 60 * 60

/**
 * Segundos inteiros positivos e menores que 24h. Aceita número ou string de
 * dígitos — a conversão de `"HH:MM:SS"` acontece antes de chegar aqui
 * (feature 025, `logic/metadados-vod.md` §1).
 */
export function normalizeDurationSeconds(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined
  const text = String(raw).trim()
  if (!DIGITS_PATTERN.test(text)) return undefined
  const seconds = Number(text)
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= MAX_DURATION_SECONDS) return undefined
  return seconds
}

const EPISODE_PATTERN = /^(?<base>.*?)[\s._-]*S(?<season>\d{1,2})\s*E(?<episode>\d{1,3})\b.*$/i

const MOVIE_KEYWORDS = ['filme', 'filmes', 'movie', 'movies', 'vod']
const SERIES_KEYWORDS = ['série', 'séries', 'serie', 'series', 'seriado']
const CHANNEL_KEYWORDS = ['canal', 'canais', 'channel', 'channels', 'ao vivo', 'live', 'tv']

function groupKeywordKind(group: string | undefined): CatalogItemKind | undefined {
  if (!group) return undefined
  const lowered = group.toLowerCase()
  if (MOVIE_KEYWORDS.some((keyword) => lowered.includes(keyword))) return 'movie'
  if (SERIES_KEYWORDS.some((keyword) => lowered.includes(keyword))) return 'series'
  if (CHANNEL_KEYWORDS.some((keyword) => lowered.includes(keyword))) return 'channel'
  return undefined
}

export function classifyEntry(entry: ParsedEntry): ClassifiedEntry {
  // Feature 015 (D-001/FR-002/FR-008): episódio (pra a série sintética
  // herdar, D-003 de m3uSeriesGrouping.ts), filme e série capturam.
  // Feature 024 (R-003): canal também captura, desde aqui.
  const iconUrl = normalizeIconUrl(entry.attributes['tvg-logo'])

  const episodeMatch = EPISODE_PATTERN.exec(entry.name.trim())
  if (episodeMatch?.groups) {
    const base = episodeMatch.groups.base.replace(/[\s\-._]+$/, '').trim() || entry.name
    return {
      kind: 'episode',
      name: entry.name,
      originalName: entry.name,
      group: entry.group,
      url: entry.url,
      seriesKey: base.toLowerCase(),
      seriesName: base,
      seasonNumber: Number(episodeMatch.groups.season),
      episodeNumber: Number(episodeMatch.groups.episode),
      iconUrl,
    }
  }

  const byGroup = groupKeywordKind(entry.group)
  if (byGroup !== undefined) {
    return {
      kind: byGroup,
      name: entry.name,
      originalName: entry.name,
      group: entry.group,
      url: entry.url,
      iconUrl,
      // Feature 030: só canal carrega o id de EPG (o Modo limitado pode
      // refinar o tipo pela URL depois, ver `refineFromUrl` — quem grava
      // filtra por `kind === 'channel'`).
      epgChannelId: normalizeEpgChannelId(entry.attributes['tvg-id']),
    }
  }

  // Evidência insuficiente — sem hierarquia nem tipo inventado.
  return {
    kind: 'unclassified',
    name: entry.name,
    originalName: entry.name,
    group: entry.group,
    url: entry.url,
  }
}
