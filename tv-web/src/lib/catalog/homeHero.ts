/**
 * Hero do Início (feature 026, US1 — FR-002..FR-006). Decide, só com o que
 * já está no aparelho, qual item o hero mostra e o que a ação primária faz.
 *
 * Nunca toca rede: não chama `ensureSeriesEpisodes` nem nada do provedor —
 * uma série favorita cujos episódios nunca foram lidos abre o detalhe em vez
 * de reproduzir (FR-006). Regras completas em
 * `sdd/specs/026-home-busca-configuracoes-ds-v14/logic/hero-home.md`.
 */

import { isResumable } from '../player/resumePolicy'
import { findSeriesRecord, listEpisodes, resolveStableIds } from './catalogRepository'
import { db, type CatalogDb, type CatalogRecord } from './db'
import { getContinueWatching, getGlobalFavorites, parseStableId, type StableIdParts } from './userStateRepository'

/**
 * O que OK na ação primária do hero faz.
 *
 * `play`: reproduz `itemId` (id local do registro — filme ou EPISÓDIO, nunca
 * a série) por cima do Início. `startAtMs` indefinido = começa do início (o
 * motor decide); `resume` decide o rótulo ("Continuar" × "Assistir").
 *
 * `open-detail`: série sem nenhum episódio conhecido no aparelho — abre o
 * detalhe da série (FR-006), nunca tenta reproduzir.
 */
export type HeroPrimary =
  | { type: 'play'; itemId: string; title: string; startAtMs: number | undefined; resume: boolean }
  | { type: 'open-detail' }

/**
 * `record` é sempre um filme ou uma SÉRIE — um episódio em andamento vira a
 * série-pai (mesma regra de `resolveContinueWatching`, feature 019); o
 * episódio só aparece em `primary.itemId`.
 */
export type HomeHero =
  | { kind: 'continue'; record: CatalogRecord; primary: HeroPrimary }
  | { kind: 'favorite'; record: CatalogRecord; primary: HeroPrimary }
  | { kind: 'welcome' }

/**
 * Todas as identidades de uma vez, uma resolução por tipo (feature 039): um
 * item que não resolve custa uma varredura dos blocos do tipo — feita uma vez,
 * nunca uma por estado de "Continuar assistindo".
 */
async function resolveAll(
  sourceId: string,
  all: StableIdParts[],
  database: CatalogDb,
): Promise<Map<StableIdParts, CatalogRecord>> {
  const byKind = new Map<StableIdParts['kind'], StableIdParts[]>()
  for (const parts of all) {
    const group = byKind.get(parts.kind)
    if (group) group.push(parts)
    else byKind.set(parts.kind, [parts])
  }
  const resolved = new Map<StableIdParts, CatalogRecord>()
  for (const [kind, group] of byKind) {
    for (const [parts, record] of await resolveStableIds(sourceId, kind, group, database)) resolved.set(parts, record)
  }
  return resolved
}

/**
 * Série-pai de um episódio, mesma consulta que `resolveContinueWatching` usa
 * internamente (linhas ou blocos de séries — feature 039).
 */
async function resolveSeriesParent(
  sourceId: string,
  seriesId: string,
  database: CatalogDb,
): Promise<CatalogRecord | undefined> {
  return findSeriesRecord(sourceId, seriesId, database)
}

/**
 * Ordem de exibição de episódios (mesma regra de `groupBySeason`/`sortEpisodes`
 * em `features/series/episodeNavigation.ts` — replicada aqui, nunca importada,
 * porque `lib/` nunca importa de `features/`, `logic/hero-home.md` §1/§3):
 * temporada crescente (ausente por último), episódio crescente (ausente por
 * último), `groupOrder` e por fim `id` como desempate estável.
 */
function compareEpisodeOrder(a: CatalogRecord, b: CatalogRecord): number {
  const seasonA = a.seasonNumber ?? Number.POSITIVE_INFINITY
  const seasonB = b.seasonNumber ?? Number.POSITIVE_INFINITY
  if (seasonA !== seasonB) return seasonA - seasonB
  const episodeA = a.episodeNumber ?? Number.POSITIVE_INFINITY
  const episodeB = b.episodeNumber ?? Number.POSITIVE_INFINITY
  if (episodeA !== episodeB) return episodeA - episodeB
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
  return (a.id ?? 0) - (b.id ?? 0)
}

/** Primeiro episódio conhecido de uma série, só local (nunca `ensureSeriesEpisodes`). */
async function firstKnownEpisode(
  sourceId: string,
  seriesId: string,
  database: CatalogDb,
): Promise<CatalogRecord | undefined> {
  const episodes = await listEpisodes(sourceId, seriesId, database)
  if (episodes.length === 0) return undefined
  return [...episodes].sort(compareEpisodeOrder)[0]
}

function play(record: CatalogRecord, progressSeconds: number | undefined): HeroPrimary {
  const resume = isResumable(progressSeconds)
  return {
    type: 'play',
    itemId: String(record.id ?? ''),
    title: record.name,
    startAtMs: resume ? (progressSeconds as number) * 1000 : undefined,
    resume,
  }
}

/**
 * Cadeia de preferência (FR-002): 1º item de "Continuar assistindo" que
 * resolve no catálogo ativo → senão 1º favorito (filme ou série, mais
 * recente primeiro) que resolve → senão boas-vindas.
 */
export async function loadHomeHero(sourceId: string, database: CatalogDb = db): Promise<HomeHero> {
  const continueStates = (await getContinueWatching(sourceId, database))
    .map((state) => ({ state, parts: parseStableId(state.stableId) }))
    .filter((entry): entry is { state: (typeof entry)['state']; parts: StableIdParts } =>
      entry.parts?.kind === 'movie' || entry.parts?.kind === 'episode',
    )
  const continueResolved = await resolveAll(sourceId, continueStates.map((entry) => entry.parts), database)
  for (const { state, parts } of continueStates) {
    if (parts.kind === 'movie') {
      const movie = continueResolved.get(parts)
      if (movie) return { kind: 'continue', record: movie, primary: play(movie, state.progressSeconds) }
      continue
    }

    if (parts.kind === 'episode') {
      const episode = continueResolved.get(parts)
      if (!episode || !episode.seriesId) continue
      const series = await resolveSeriesParent(sourceId, episode.seriesId, database)
      if (!series) continue
      return { kind: 'continue', record: series, primary: play(episode, state.progressSeconds) }
    }
    // Qualquer outro kind (canal, etc.) nunca vira hero — próximo estado.
  }

  const favoriteParts = (await getGlobalFavorites(database))
    .filter((favorite) => favorite.sourceId === sourceId)
    .map((favorite) => parseStableId(favorite.stableId))
    .filter((parts): parts is StableIdParts => parts?.kind === 'movie' || parts?.kind === 'series')
  const favoritesResolved = await resolveAll(sourceId, favoriteParts, database)
  for (const parts of favoriteParts) {
    const record = favoritesResolved.get(parts)
    if (!record) continue

    if (parts.kind === 'movie') {
      return { kind: 'favorite', record, primary: play(record, undefined) }
    }

    // Série: sem `seriesId` não deveria acontecer (favorito de série sempre
    // tem), mas nunca reproduz sem saber qual série é.
    if (!record.seriesId) return { kind: 'favorite', record, primary: { type: 'open-detail' } }
    const episode = await firstKnownEpisode(sourceId, record.seriesId, database)
    return {
      kind: 'favorite',
      record,
      primary: episode ? play(episode, undefined) : { type: 'open-detail' },
    }
  }

  return { kind: 'welcome' }
}
