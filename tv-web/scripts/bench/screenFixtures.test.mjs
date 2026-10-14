import { describe, it, expect } from 'vitest'
import { fixtureRows, fixtureSpec, screenMatrix } from './screenFixtures.mjs'
import { blockItemId } from '../../src/lib/catalog/categoryBlocks'
import { buildStableId } from '../../src/lib/catalog/userStateRepository'

describe('fixtures de telas 065', () => {
  it('fixa população, elegibilidade e identidade canônica sem dados de reprodução', () => {
    const rows = fixtureRows(fixtureSpec({ eligible: 0.2 }))
    expect(rows.categories).toHaveLength(134)
    const movies = rows.categoryBlocks.filter(b => b.kind === 'movie').flatMap(b => b.items)
    expect(movies).toHaveLength(43000)
    expect(movies.filter(i => i.providerRating >= 6)).toHaveLength(8600)
    expect(movies[0].id).toBe(blockItemId(1, 'p:1', new Set()))
    expect(rows.userStates[0].stableId).toBe(buildStableId({ sourceId: 'screen-065-a', kind: 'movie', providerStreamId: '1' }))
    expect(rows.userStates.filter(s => s.isFavorite)).toHaveLength(1000)
    expect(rows.userStates.filter(s => s.lastWatched)).toHaveLength(5000)
    expect(JSON.stringify(rows)).not.toMatch(/directUrl|providerPassword|providerUsername|api_key/)
  })
  it('repete exatamente e representa as matrizes de categorias, episódios e listas', () => {
    const spec = fixtureSpec({ movies: 10, series: 2, movieCategories: 1, seriesCategories: 1, episodes: 3, lists: 3 })
    const rows = fixtureRows(spec)
    expect(rows).toEqual(fixtureRows(spec))
    expect(rows.sources).toHaveLength(3)
    expect(rows.channels).toHaveLength(18)
    expect(screenMatrix().find(c => c.kind === 'category').fixture.movies).toBe(30000)
    expect(screenMatrix().find(c => c.kind === 'episodes').fixture.episodes).toBe(100)
  })
})
