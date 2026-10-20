import { describe, expect, it } from 'vitest'
import {
  BLOCK_CHUNK_ITEMS,
  decodeBlockChunk,
  decodeIdentityIndex,
  encodeBlockChunks,
  encodeIdentityIndex,
  IDENTITY_INDEX_VERSION,
  sharedOf,
} from './blockCodec'
import type { BlockItem } from './db'

const item = (index: number): BlockItem => ({
  id: -index - 1,
  name: `Título ${index} 🎬 ação`,
  originalName: index % 2 ? `Original ${index} çãé` : `Título ${index} 🎬 ação`,
  group: 'Filmes',
  providerCategoryId: '7',
  providerStreamId: String(index),
  iconUrl: index % 3 ? undefined : `https://img.fixture.test/t/p/w600/${(index * 7919).toString(36)}.jpg`,
  year: 1980 + (index % 45),
})

async function roundTrip(items: BlockItem[]) {
  const shared = sharedOf(items)
  const chunks = await encodeBlockChunks(items, shared)
  const decoded: BlockItem[] = []
  for (const chunk of chunks) decoded.push(...(await decodeBlockChunk(chunk, shared)))
  return { chunks, decoded, shared }
}

describe('blockCodec (feature 082, T008)', () => {
  it('ida e volta idêntica: originalName igual e diferente, campos comuns em shared, chaves undefined, acento e emoji', async () => {
    const items = Array.from({ length: BLOCK_CHUNK_ITEMS + 3 }, (_, index) => item(index))
    const { chunks, decoded, shared } = await roundTrip(items)
    expect(shared).toEqual({ group: 'Filmes', providerCategoryId: '7' })
    expect(decoded).toEqual(items)
    // Os pedaços cobrem tudo, na ordem.
    expect(chunks.map((chunk) => [chunk.start, chunk.count])).toEqual([[0, BLOCK_CHUNK_ITEMS], [BLOCK_CHUNK_ITEMS, 3]])
  })

  it('grupo misto (um item sem grupo) não vira grupo de todos', async () => {
    const items = [item(1), { ...item(2), group: undefined }, { ...item(3), group: 'Outro' }]
    const { decoded, shared } = await roundTrip(items)
    expect(shared.group).toBeUndefined()
    expect(decoded.map((value) => value.group)).toEqual(['Filmes', undefined, 'Outro'])
  })

  it('1 200 itens realistas comprimidos ficam abaixo de 30 % do JSON', async () => {
    const items = Array.from({ length: 1_200 }, (_, index) => item(index))
    const { chunks } = await roundTrip(items)
    const compressed = chunks.reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0)
    expect(compressed).toBeLessThan(Buffer.byteLength(JSON.stringify(items)) * 0.3)
  })

  it('índice de identidade guarda ids, a chave de identidade e carimbos de episódios', async () => {
    const items = [item(1), { ...item(2), episodesFetchedAt: 123 }]
    const index = await decodeIdentityIndex(await encodeIdentityIndex(items, (value) => `p:${value.providerStreamId}`))
    expect(index).toEqual({ v: IDENTITY_INDEX_VERSION, ids: [-2, -3], keys: ['p:1', 'p:2'], episodesFetchedAt: [null, 123] })
  })
})
