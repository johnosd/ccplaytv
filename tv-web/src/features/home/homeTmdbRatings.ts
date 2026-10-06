import type { TmdbRating } from '../../lib/metadata/contentRating'

/** Junta as notas já obtidas do Top 10 e da Dica; mocks antigos podem não ter o mapa (061, R-006). */
export function mergeDiscoveryRatings(...rows: (ReadonlyMap<string, TmdbRating> | undefined)[]): ReadonlyMap<string, TmdbRating> {
  return new Map(rows.flatMap((row) => [...(row ?? [])]))
}
