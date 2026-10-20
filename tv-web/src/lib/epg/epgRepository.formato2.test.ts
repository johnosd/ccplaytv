import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { epgChunks } from '../catalog/chunkTables'
import { deleteEpgForSource, listProgramsForChannels, writeEpgPrograms } from './epgRepository'
import { EPG_CHUNK_BATCH } from './epgChunkStore'
import type { EpgProgramInput } from './types'

/**
 * Feature 082, T023 (D-005): o guia gravado comprimido por canal devolve os mesmos programas que as linhas antigas, a
 * geração antiga fica legível até a troca, e a troca apaga o formato antigo e os pedaços de gerações anteriores.
 */

const SOURCE_ID = 'fonte'
const HOUR = 3_600_000
const NOW = 1_800_000_000_000
let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-epg-082-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Painel', connectionState: 'synced', createdAt: 1, updatedAt: 1 })
})
afterEach(async () => { vi.restoreAllMocks(); await database.delete() })

/** 3 canais, programas de 1 h de −12 h a +48 h, fora de ordem, um sem sinopse. */
function programs(channels = ['c1', 'c2', 'c3']): EpgProgramInput[] {
  const result: EpgProgramInput[] = []
  for (const channelKey of channels) {
    for (let hour = 47; hour >= -12; hour -= 1) {
      result.push({ channelKey, start: NOW + hour * HOUR, end: NOW + (hour + 1) * HOUR, title: `${channelKey} às ${hour}h ação`,
        description: hour % 5 ? `Sinopse ${hour} 🎬` : undefined })
    }
  }
  return result
}

const expected = (input: EpgProgramInput[], key: string, from: number, to: number) => input
  .filter((program) => program.channelKey === key && program.end > from && program.start < to)
  .sort((a, b) => a.start - b.start)
  .map(({ channelKey, start, end, title, description }) => ({ channelKey, start, end, title, description }))

describe('guia comprimido por canal (feature 082, T023)', () => {
  it('mesmos programas para agora/a seguir, grade e catch-up (passados na janela)', async () => {
    const input = programs()
    expect((await writeEpgPrograms(SOURCE_ID, input, database)).programCount).toBe(input.length)
    expect(await database.epgPrograms.count()).toBe(0)
    expect(await epgChunks(database).count()).toBe(3)

    const nowNext = await listProgramsForChannels(SOURCE_ID, ['c1', 'c2'], { from: NOW, to: NOW + 2 * HOUR }, database)
    expect(nowNext.get('c1')).toEqual(expected(input, 'c1', NOW, NOW + 2 * HOUR))
    expect(nowNext.get('c1')).toHaveLength(2)
    const grid = await listProgramsForChannels(SOURCE_ID, ['c3'], { from: NOW - HOUR, to: NOW + 6 * HOUR }, database)
    expect(grid.get('c3')).toEqual(expected(input, 'c3', NOW - HOUR, NOW + 6 * HOUR))
    const catchUp = await listProgramsForChannels(SOURCE_ID, ['c2'], { from: NOW - 12 * HOUR, to: NOW }, database)
    expect(catchUp.get('c2')).toEqual(expected(input, 'c2', NOW - 12 * HOUR, NOW))
    // Canal sem programa e fora da janela ficam fora do mapa.
    expect((await listProgramsForChannels(SOURCE_ID, ['nenhum'], { from: NOW, to: NOW + HOUR }, database)).size).toBe(0)
    expect((await listProgramsForChannels(SOURCE_ID, ['c1'], { from: NOW + 100 * HOUR, to: NOW + 101 * HOUR }, database)).size).toBe(0)
    expect((await database.sources.get(SOURCE_ID))?.epgStoredBytes).toBeGreaterThan(0)
  })

  it('geração antiga em linhas fica legível até a troca; a troca apaga as linhas e os pedaços anteriores', async () => {
    await database.sources.update(SOURCE_ID, { epgActiveGeneration: 1 })
    await database.epgPrograms.bulkAdd([
      { sourceId: SOURCE_ID, generation: 1, channelKey: 'c1', start: NOW, end: NOW + HOUR, title: 'Antigo' },
      { sourceId: SOURCE_ID, generation: 1, channelKey: 'c1', start: NOW + HOUR, end: NOW + 2 * HOUR, title: 'Antigo 2' },
    ])
    expect((await listProgramsForChannels(SOURCE_ID, ['c1'], { from: NOW, to: NOW + 2 * HOUR }, database)).get('c1')?.map((program) => program.title))
      .toEqual(['Antigo', 'Antigo 2'])

    await writeEpgPrograms(SOURCE_ID, programs(['c1']), database)
    expect(await database.epgPrograms.count()).toBe(0)
    expect((await listProgramsForChannels(SOURCE_ID, ['c1'], { from: NOW, to: NOW + HOUR }, database)).get('c1')?.[0].title).toBe('c1 às 0h ação')

    // Cada sincronização troca a geração: os pedaços da anterior saem (não acumulam a cada 12 h).
    await writeEpgPrograms(SOURCE_ID, programs(['c2']), database)
    const rows = await epgChunks(database).toArray()
    expect(rows.map((row) => [row.generation, row.channelKey])).toEqual([[3, 'c2']])

    await deleteEpgForSource(SOURCE_ID, database)
    expect(await epgChunks(database).count()).toBe(0)
    expect((await database.sources.get(SOURCE_ID))?.epgStoredBytes).toBeUndefined()
  })

  it(`grava em lotes de no máximo ${EPG_CHUNK_BATCH} canais por transação (R-013)`, async () => {
    const channels = Array.from({ length: 450 }, (_, index) => `canal${index}`)
    const bulkPut = vi.spyOn(epgChunks(database), 'bulkPut')
    await writeEpgPrograms(SOURCE_ID, channels.map((channelKey) => ({ channelKey, start: NOW, end: NOW + HOUR, title: 't' })), database)
    expect(bulkPut.mock.calls.map(([rows]) => (rows as unknown[]).length)).toEqual([200, 200, 50])
    expect(await epgChunks(database).count()).toBe(450)
  })

  it('falha no meio apaga só a geração parcial; a ativa continua', async () => {
    await writeEpgPrograms(SOURCE_ID, programs(['c1']), database)
    async function* broken(): AsyncGenerator<EpgProgramInput> {
      yield { channelKey: 'c9', start: NOW, end: NOW + HOUR, title: 'x' }
      throw new Error('leitura caiu')
    }
    await expect(writeEpgPrograms(SOURCE_ID, broken(), database)).rejects.toThrow('leitura caiu')
    expect((await database.sources.get(SOURCE_ID))?.epgActiveGeneration).toBe(1)
    expect((await listProgramsForChannels(SOURCE_ID, ['c1'], { from: NOW, to: NOW + HOUR }, database)).get('c1')).toHaveLength(1)
  })

  it('banco cheio com o guia ainda em linhas: apaga as linhas antigas e grava o novo na 2ª tentativa', async () => {
    await database.sources.update(SOURCE_ID, { epgActiveGeneration: 1 })
    await database.epgPrograms.add({ sourceId: SOURCE_ID, generation: 1, channelKey: 'c1', start: NOW, end: NOW + HOUR, title: 'Antigo' })
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    const bulkPut = vi.spyOn(epgChunks(database), 'bulkPut').mockRejectedValueOnce(quota)
    await writeEpgPrograms(SOURCE_ID, programs(['c1']), database)
    expect(bulkPut).toHaveBeenCalledTimes(2)
    expect(await database.epgPrograms.count()).toBe(0)
    expect((await listProgramsForChannels(SOURCE_ID, ['c1'], { from: NOW, to: NOW + HOUR }, database)).get('c1')?.[0].title).toBe('c1 às 0h ação')
  })

  it('banco cheio já no formato novo: a falha sobe e o guia ativo fica', async () => {
    await writeEpgPrograms(SOURCE_ID, programs(['c1']), database)
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    vi.spyOn(epgChunks(database), 'bulkPut').mockRejectedValue(quota)
    await expect(writeEpgPrograms(SOURCE_ID, programs(['c2']), database)).rejects.toThrow('cheio')
    expect((await listProgramsForChannels(SOURCE_ID, ['c1'], { from: NOW, to: NOW + HOUR }, database)).get('c1')).toHaveLength(1)
  })
})

