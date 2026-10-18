import { describe, expect, it } from 'vitest'
import { BLOCK_CHUNK_ITEMS, decodeBlockChunk, decodeIdentityIndex, encodeBlockChunks, encodeIdentityIndex } from './blockCodec'
import type { BlockItem } from './db'

const item = (index: number): BlockItem => ({
  id: -index - 1,
  name: `Título ${index} 🎬`,
  originalName: index % 2 ? `Original ${index}` : `Título ${index} 🎬`,
  group: 'Filmes',
  providerCategoryId: '7',
  providerStreamId: String(index),
  iconUrl: index % 3 ? undefined : `https://img.fixture.test/${index}.jpg`,
})

describe('blockCodec', () => {
  it('divide, comprime e devolve os itens idênticos', async () => {
    const items = Array.from({ length: BLOCK_CHUNK_ITEMS + 3 }, (_, index) => item(index))
    const chunks = await encodeBlockChunks(items, { group: 'Filmes', providerCategoryId: '7' })
    expect(chunks).toHaveLength(2)
    const decoded = []
    for (const chunk of chunks) decoded.push(...await decodeBlockChunk(chunk, { group: 'Filmes', providerCategoryId: '7' }))
    expect(decoded).toEqual(items)
    const compressed = chunks.reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0)
    expect(compressed).toBeLessThan(Buffer.byteLength(JSON.stringify(items)) * 0.3)
  })

  it('preserva o índice de identidade e carimbos de episódios', async () => {
    const items = [item(1), { ...item(2), episodesFetchedAt: 123 }]
    expect(await decodeIdentityIndex(await encodeIdentityIndex(items))).toEqual({ ids: [-2, -3], keys: ['1', '2'], episodesFetchedAt: [null, 123] })
  })
})
