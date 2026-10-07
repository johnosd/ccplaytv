import type { FeaturedRatedOptions, RatedFields } from './ratedSelection'

/** Feature 065: seleção equivalente com pausas cooperativas; stub do sdd-plan. */
export async function selectFeaturedRatedAsync<T>(
  _items: Iterable<T> | AsyncIterable<T>,
  _read: RatedFields<T>,
  _options: FeaturedRatedOptions,
  _scheduling: { yieldControl: () => Promise<void>; batchSize?: number; signal?: AbortSignal },
): Promise<{ picked: T[]; eligibleCount: number }> {
  throw new Error('not implemented')
}
