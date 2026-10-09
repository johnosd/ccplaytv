/** Agregação pura do estado conhecido de uma série. */
export interface SeriesWatchedSummary {
  known: number
  watched: number
  upToDate: boolean
}

export function summarizeSeriesWatched(episodes: { completedAt?: number }[]): SeriesWatchedSummary {
  const known = episodes.length
  let watched = 0
  for (const episode of episodes) {
    if (episode.completedAt != null) watched += 1
  }
  return { known, watched, upToDate: known > 0 && watched === known }
}
