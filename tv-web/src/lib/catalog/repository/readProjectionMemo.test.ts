import { describe, expect, it } from 'vitest'
import type { CatalogDb, CatalogReadItem } from '../db'
import {
  getReadProjectionMemoChunk,
  invalidateReadProjectionMemo,
  readProjectionMemoChunkCount,
  setReadProjectionMemoChunk,
} from './readProjectionMemo'

const database = {} as CatalogDb
const item = {} as CatalogReadItem
const context = { sourceId: 'source', generation: 1, categoryId: 2, revision: 'r1' }

describe('readProjectionMemo', () => {
  it('retém oito chunks e descarta o mais antigo por LRU', () => {
    for (let chunk = 0; chunk < 8; chunk += 1) setReadProjectionMemoChunk(database, context, chunk, [item])
    expect(getReadProjectionMemoChunk(database, context, 0)).toEqual([item])
    setReadProjectionMemoChunk(database, context, 8, [item])
    expect(getReadProjectionMemoChunk(database, context, 0)).toEqual([item])
    setReadProjectionMemoChunk(database, context, 9, [item])
    expect(getReadProjectionMemoChunk(database, context, 1)).toBeUndefined()
    expect(readProjectionMemoChunkCount(database)).toBe(8)
  })

  it('limpa páginas ao trocar contexto ou invalidar a revisão', () => {
    setReadProjectionMemoChunk(database, context, 0, [item])
    const nextContext = { ...context, revision: 'r2' }
    expect(getReadProjectionMemoChunk(database, nextContext, 0)).toBeUndefined()
    setReadProjectionMemoChunk(database, nextContext, 0, [item])
    invalidateReadProjectionMemo(database, context)
    expect(getReadProjectionMemoChunk(database, nextContext, 0)).toEqual([item])
    invalidateReadProjectionMemo(database, nextContext)
    expect(readProjectionMemoChunkCount(database)).toBe(0)
  })
})
