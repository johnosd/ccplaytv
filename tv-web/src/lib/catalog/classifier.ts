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
  /** Capa declarada pela fonte (feature 015, D-002 do plan.md) — nunca para `kind: 'channel'` (FR-009). */
  iconUrl?: string
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
  // Feature 015 (D-001/FR-002/FR-008): nunca para canal (FR-009) — só
  // episódio (pra a série sintética herdar, D-003 de m3uSeriesGrouping.ts)
  // e filme/série capturam.
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
      iconUrl: byGroup === 'channel' ? undefined : iconUrl,
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
