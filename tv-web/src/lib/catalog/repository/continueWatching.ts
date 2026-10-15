/** Resolução de "Continuar assistindo" em registros do catálogo. Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogItemKind, type CatalogRecord, type UserStateRecord } from '../db'
import { parseStableId, type StableIdParts } from '../userStateRepository'
import { activeGenerationOf } from './shared'
import { findSeriesManyIn } from './series'
import { resolveStableIdsIn } from './stableIds'
import { getAdultScope } from '../categoryAccess'

/**
 * Resolve os `UserStateRecord`s de "Continuar assistindo" (feature 019,
 * D-009/D-011/R-002) de volta a registros do catálogo, na MESMA ordem de
 * entrada (já vem de `getContinueWatching`, mais recente primeiro).
 * Reaproveita o núcleo de `resolveFavorites` por kind — um episódio sempre
 * tem `providerStreamId` próprio do provedor (feature 012), então cai no
 * mesmo caminho de resolução por índice que filme/canal já usam.
 *
 * Um episódio nunca é devolvido como episódio: é trocado pelo registro da
 * SÉRIE-pai (mesmo `seriesId`, kind:'series') — abrir um item de "Continuar
 * assistindo" precisa levar ao MESMO lugar que abrir esse item pela
 * navegação normal já leva (D-011), e a navegação normal nunca abre um
 * episódio isolado, sempre a série (que então mostra o progresso de cada
 * episódio, já resolvido por `SeriesDetailScreen`). Item sem correspondência
 * (fonte removida, categoria reimportada) é omitido silenciosamente, nunca
 * lança.
 */
export async function resolveContinueWatching(
  sourceId: string,
  states: UserStateRecord[],
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  return (await resolveContinueEntries(sourceId, states, database)).map((entry) => entry.record)
}

/**
 * Um item de "Continuar assistindo" resolvido: o registro (filme ou série-pai), o estado do usuário que o trouxe e, quando
 * veio de um episódio, qual (código T:E e duração declarada pela fonte). Feature 060 (`logic/cards-e-expansao.md` §6): é o que
 * a Home precisa para a legenda `T1:E3 · faltam 26 min`, sem nova consulta.
 */
export interface ContinueEntry {
  record: CatalogRecord
  state: UserStateRecord
  episode?: { seasonNumber?: number; episodeNumber?: number; durationSeconds?: number }
}

/** Mesma resolução de `resolveContinueWatching` (que agora só tira o `record`), guardando estado e episódio de cada item. */
export async function resolveContinueEntries(
  sourceId: string,
  states: UserStateRecord[],
  database: CatalogDb = db,
): Promise<ContinueEntry[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []

  // Feature 039 (T019): em lote — uma resolução por TIPO (uma passada pelos
  // blocos daquele tipo), não uma por item; o mapa de `resolveStableIdsIn`
  // diz a que item cada registro pertence, então a ordem de entrada é mantida.
  const parsed = states.map((state) => parseStableId(state.stableId))
  const byKind = new Map<CatalogItemKind, StableIdParts[]>()
  for (const parts of parsed) {
    if (!parts) continue
    const group = byKind.get(parts.kind)
    if (group) group.push(parts)
    else byKind.set(parts.kind, [parts])
  }
  const resolved = new Map<StableIdParts, CatalogRecord>()
  for (const [kind, group] of byKind) {
    for (const [parts, record] of await resolveStableIdsIn(database, sourceId, generation, kind, group)) {
      resolved.set(parts, record)
    }
  }

  // Episódio vira a série-pai — todas as séries numa passada só.
  const seriesIds = new Set<string>()
  for (const record of resolved.values()) {
    if (record.kind === 'episode' && record.seriesId) seriesIds.add(record.seriesId)
  }
  const seriesById = await findSeriesManyIn(database, sourceId, generation, seriesIds)

  // Feature 066 (FR-035, D-014): adulto nunca aparece no Continuar assistindo (a série vale pelo episódio).
  const adult = await getAdultScope(sourceId, database)
  const entries: ContinueEntry[] = []
  for (const [index, parts] of parsed.entries()) {
    const record = parts ? resolved.get(parts) : undefined
    if (!record) continue
    const state = states[index]
    if (record.kind !== 'episode' || !record.seriesId) {
      if (!adult.isAdult(record)) entries.push({ record, state })
      continue
    }
    const series = seriesById.get(record.seriesId)
    if (series && !adult.isAdult(series)) {
      entries.push({
        record: series,
        state,
        episode: { seasonNumber: record.seasonNumber, episodeNumber: record.episodeNumber, durationSeconds: record.durationSeconds },
      })
    }
  }
  return entries
}
