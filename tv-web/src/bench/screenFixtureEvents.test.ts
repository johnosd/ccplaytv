import { expect, it, vi } from 'vitest'
import { categoryEventItems } from './screenFixtureEvents'
import { selectFeaturedRated } from '../features/vod/ratedSelection'

it('eventos conservam datas, desempates e escolha apesar do tempo real entre publicações', () => {
  const clock = Date.UTC(2026, 9, 7, 15)
  const read = { id: (i: ReturnType<typeof categoryEventItems>[number]) => i.providerStreamId!,
    name: (i: ReturnType<typeof categoryEventItems>[number]) => i.name,
    year: (i: ReturnType<typeof categoryEventItems>[number]) => i.year,
    rating: (i: ReturnType<typeof categoryEventItems>[number]) => i.providerRating,
    addedAt: (i: ReturnType<typeof categoryEventItems>[number]) => i.addedAt }
  const now = vi.spyOn(Date, 'now')
  try {
    now.mockReturnValue(clock)
    const fast = [0, 1, 2].flatMap(order => categoryEventItems({ id: order + 1, order, generation: 1 }, 'synthetic', clock))
    let wallClock = clock
    now.mockImplementation(() => { wallClock += 1000; return wallClock })
    const slow = [0, 1, 2].flatMap(order => categoryEventItems({ id: order + 1, order, generation: 1 }, 'synthetic', clock))
    expect(slow).toEqual(fast)
    expect(new Set(slow.slice(80).map(i => i.addedAt)).size).toBe(1)
    expect(selectFeaturedRated(slow, read, { now: clock, seed: 'fixed' }))
      .toEqual(selectFeaturedRated(fast, read, { now: clock, seed: 'fixed' }))
  } finally { now.mockRestore() }
})
