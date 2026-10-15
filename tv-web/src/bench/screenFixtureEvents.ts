import type { CatalogRecord } from '../lib/catalog/db'

/** Dados sintéticos do evento usam relógio da fixture, nunca duração da execução. */
export function categoryEventItems(
  category: { id: number; order: number; generation: number },
  sourceId: string,
  fixtureClock: number,
): CatalogRecord[] {
  const addedAt = fixtureClock + (category.order + 1) * 1000
  const year = new Date(fixtureClock).getUTCFullYear()
  return Array.from({ length: 40 }, (_, n) => ({
    sourceId, generation: category.generation, kind: 'movie', groupOrder: category.order,
    name: `Filme novo ${category.id}-${n}`, originalName: `Filme novo ${category.id}-${n}`,
    providerStreamId: `novo-${category.id}-${n}`, year, providerRating: 9.9, addedAt,
  }))
}
