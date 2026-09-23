import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  buildStableId,
  getUserState,
  toggleFavorite,
  updateProgress,
  getGlobalFavorites,
  getContinueWatching,
} from './userStateRepository'

describe('userStateRepository', () => {
  beforeEach(async () => {
    await db.userStates.clear()
  })

  it('should build a stable id', () => {
    const id = buildStableId('src1', 'movie', ' The Matrix ')
    expect(id).toBe('src1_movie_the matrix')
  })

  it('should return undefined if state does not exist', async () => {
    const state = await getUserState('unknown_id')
    expect(state).toBeUndefined()
  })

  it('should toggle favorite for new state', async () => {
    const stableId = buildStableId('src1', 'movie', 'matrix')
    await toggleFavorite(stableId, 'src1', true)

    const state = await getUserState(stableId)
    expect(state).toBeDefined()
    expect(state?.isFavorite).toBe(true)
    expect(state?.sourceId).toBe('src1')
  })

  it('should toggle favorite for existing state', async () => {
    const stableId = buildStableId('src1', 'movie', 'matrix')
    await toggleFavorite(stableId, 'src1', true)
    await toggleFavorite(stableId, 'src1', false)

    const state = await getUserState(stableId)
    expect(state?.isFavorite).toBe(false)
  })

  it('should update progress for new state', async () => {
    const stableId = buildStableId('src1', 'movie', 'matrix')
    await updateProgress(stableId, 'src1', 120)

    const state = await getUserState(stableId)
    expect(state?.progressSeconds).toBe(120)
    expect(state?.lastWatched).toBeDefined()
    expect(state?.isFavorite).toBe(false)
  })

  it('should update progress for existing state', async () => {
    const stableId = buildStableId('src1', 'movie', 'matrix')
    await toggleFavorite(stableId, 'src1', true)
    
    await updateProgress(stableId, 'src1', 300)

    const state = await getUserState(stableId)
    expect(state?.isFavorite).toBe(true) // Should preserve favorite
    expect(state?.progressSeconds).toBe(300)
    expect(state?.lastWatched).toBeDefined()
  })

  it('should fetch global favorites across sources', async () => {
    await toggleFavorite(buildStableId('src1', 'movie', 'matrix'), 'src1', true)
    await toggleFavorite(buildStableId('src2', 'movie', 'avatar'), 'src2', true)
    await toggleFavorite(buildStableId('src1', 'movie', 'dune'), 'src1', false)

    const favs = await getGlobalFavorites()
    expect(favs).toHaveLength(2)
    expect(favs.map((f) => f.sourceId).sort()).toEqual(['src1', 'src2'])
  })

  it('should fetch continue watching across sources', async () => {
    await updateProgress(buildStableId('src1', 'movie', 'matrix'), 'src1', 120)
    await updateProgress(buildStableId('src2', 'movie', 'avatar'), 'src2', 300)

    const cw = await getContinueWatching()
    expect(cw).toHaveLength(2)
    expect(cw[0].lastWatched).toBeGreaterThanOrEqual(cw[1].lastWatched)
  })
})
