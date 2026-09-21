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

export type CatalogItemKind = 'channel' | 'movie' | 'series' | 'episode' | 'unclassified'

export interface ClassifiedEntry {
  kind: CatalogItemKind
  name: string
  originalName: string
  group?: string
  /**
   * Ausente só quando vem do conector de provedor e a conta não declara
   * nenhum formato permitido — sem URL inventada.
   */
  url?: string
  seriesKey?: string
  seriesName?: string
  seasonNumber?: number
  episodeNumber?: number
  /** Identidade declarada pelo provedor; ausente para entradas vindas de M3U. */
  providerStreamId?: string
  providerCategoryId?: string
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
