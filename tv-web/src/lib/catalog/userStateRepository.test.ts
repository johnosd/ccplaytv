import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import {
  buildStableId,
  getUserState,
  toggleFavorite,
  updateProgress,
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
})
