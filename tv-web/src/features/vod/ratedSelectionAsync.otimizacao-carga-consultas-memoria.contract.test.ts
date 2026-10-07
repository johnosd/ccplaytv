import { expect, it, vi } from 'vitest'
import { selectFeaturedRated } from './ratedSelection'
import { selectFeaturedRatedAsync } from './ratedSelectionAsync'

it('FR-001/FR-006 US2-AC1: seleção cooperativa mantém desempates, pool, ordem e escolha diária', async () => {
  const items = Array.from({ length: 600 }, (_, index) => ({
    id: String(index), name: `Título ${index % 240}${index % 2 ? ' [L]' : ''}`,
    rating: 6 + (index % 40) / 10, year: 1990 + (index % 37), addedAt: index % 7,
  }))
  const before = structuredClone(items)
  const read = {
    id: (item: typeof items[number]) => item.id,
    name: (item: typeof items[number]) => item.name,
    rating: (item: typeof items[number]) => item.rating,
    year: (item: typeof items[number]) => item.year,
    addedAt: (item: typeof items[number]) => item.addedAt,
  }
  const yieldControl = vi.fn(async () => {})
  for (const seed of ['2026-10-07|movie|fonte', '2026-10-08|movie|fonte']) {
    const options = { now: new Date(2026, 9, 7, 12).getTime(), seed }
    const expected = selectFeaturedRated(items, read, options)
    const actual = await selectFeaturedRatedAsync(items, read, options, { yieldControl, batchSize: 32 })
    expect(actual).toEqual(expected)
  }
  expect(yieldControl).toHaveBeenCalled()
  expect(items).toEqual(before)
})
