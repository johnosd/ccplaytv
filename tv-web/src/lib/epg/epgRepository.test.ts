import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import {
  deleteEpgForSource,
  getEpgStatus,
  InvalidEpgUrlError,
  listProgramsForChannels,
  recordEpgFailure,
  recordEpgSuccess,
  setEpgEnabled,
  setEpgManualUrl,
  setEpgOffsetHours,
  writeEpgPrograms,
} from './epgRepository'
import type { EpgProgramInput } from './types'

const SOURCE_ID = 'fonte'
const SOURCE: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'u',
  providerPassword: 'p',
  connectionState: 'synced',
  createdAt: 1,
  updatedAt: 1,
}
const RANGE = { from: 0, to: 100_000 }

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-epgrepo-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(SOURCE)
})

afterEach(async () => {
  await database.delete()
})

const program = (channelKey: string, start: number, end: number, title = 'P', description?: string): EpgProgramInput => ({
  channelKey,
  start,
  end,
  title,
  description,
})

async function titles(key: string, range = RANGE): Promise<string[]> {
  return ((await listProgramsForChannels(SOURCE_ID, [key], range, database)).get(key) ?? []).map((p) => p.title)
}

describe('writeEpgPrograms / listProgramsForChannels', () => {
  it('lê por canal, ordenado por início, só o que se sobrepõe ao intervalo', async () => {
    await writeEpgPrograms(
      SOURCE_ID,
      [
        program('a', 5_000, 6_000, 'C'),
        program('a', 1_000, 2_000, 'A'),
        program('a', 3_000, 4_000, 'B'),
        program('b', 1_000, 2_000, 'Outro canal'),
        program('a', 200_000, 210_000, 'Fora, depois'),
      ],
      database,
    )

    expect(await titles('a')).toEqual(['A', 'B', 'C'])
    expect(await titles('a', { from: 3_500, to: 5_500 })).toEqual(['B', 'C'])
    // Começou antes do intervalo mas ainda está no ar: entra.
    expect(await titles('a', { from: 1_500, to: 2_500 })).toEqual(['A'])
    expect(await titles('a', { from: 2_000, to: 2_500 })).toEqual([])
  })

  it('aceita fluxo assíncrono e substitui a geração anterior por inteiro', async () => {
    async function* stream(): AsyncGenerator<EpgProgramInput> {
      yield program('a', 1_000, 2_000, 'Novo')
    }
    await writeEpgPrograms(SOURCE_ID, [program('a', 1_000, 2_000, 'Velho')], database)
    const result = await writeEpgPrograms(SOURCE_ID, stream(), database)

    expect(result.programCount).toBe(1)
    expect(await titles('a')).toEqual(['Novo'])
    expect(await database.epgPrograms.count()).toBe(1)
  })

  it('falha no meio da gravação preserva a geração ativa (FR-005)', async () => {
    await writeEpgPrograms(SOURCE_ID, [program('a', 1_000, 2_000, 'Bom')], database)
    async function* broken(): AsyncGenerator<EpgProgramInput> {
      yield program('a', 1_000, 2_000, 'Parcial')
      throw new Error('leitura quebrou')
    }

    await expect(writeEpgPrograms(SOURCE_ID, broken(), database)).rejects.toThrow('leitura quebrou')

    expect(await titles('a')).toEqual(['Bom'])
    expect(await database.epgPrograms.count()).toBe(1)
  })

  it('sobra de geração parcial (app fechado no meio) nunca se mistura com a nova', async () => {
    await database.epgPrograms.add({ sourceId: SOURCE_ID, generation: 1, channelKey: 'a', start: 1, end: 2, title: 'Órfão' })

    await writeEpgPrograms(SOURCE_ID, [program('a', 1_000, 2_000, 'Novo')], database)

    expect(await titles('a')).toEqual(['Novo'])
  })

  it('trunca a sinopse e ignora chave/título vazios', async () => {
    await writeEpgPrograms(
      SOURCE_ID,
      [program('a', 1_000, 2_000, 'T', 'x'.repeat(1_000)), program('', 1_000, 2_000, 'Sem canal'), program('a', 3_000, 4_000, '')],
      database,
    )
    const list = (await listProgramsForChannels(SOURCE_ID, ['a'], RANGE, database)).get('a')!
    expect(list).toHaveLength(1)
    expect(list[0].description).toHaveLength(600)
  })

  it('sem programação ativa ou sem chaves, nada — e sem erro', async () => {
    expect((await listProgramsForChannels(SOURCE_ID, ['a'], RANGE, database)).size).toBe(0)
    expect((await listProgramsForChannels(SOURCE_ID, [], RANGE, database)).size).toBe(0)
    expect((await listProgramsForChannels(SOURCE_ID, [''], RANGE, database)).size).toBe(0)
  })
})

describe('estado e configuração', () => {
  it('registra sucesso e falha sem mexer na marca de sincronização em falha (FR-005)', async () => {
    await recordEpgSuccess(SOURCE_ID, 100, database)
    await recordEpgFailure(SOURCE_ID, 'network', 200, database)
    expect(await getEpgStatus(SOURCE_ID, database)).toMatchObject({ state: 'error', errorKind: 'network', lastSyncAt: 100 })

    await recordEpgSuccess(SOURCE_ID, 300, database)
    expect(await getEpgStatus(SOURCE_ID, database)).toMatchObject({ state: 'linked', lastSyncAt: 300 })
  })

  it('endereço manual: valida sem ecoar, aceita, e limpa com vazio', async () => {
    const bad = setEpgManualUrl(SOURCE_ID, 'abc?token=segredo', database)
    await expect(bad).rejects.toBeInstanceOf(InvalidEpgUrlError)
    await bad.catch((error: Error) => expect(error.message).not.toContain('segredo'))

    await setEpgManualUrl(SOURCE_ID, '  http://guia.test/g.xml  ', database)
    expect((await database.sources.get(SOURCE_ID))?.epgManualUrl).toBe('http://guia.test/g.xml')

    await setEpgManualUrl(SOURCE_ID, '', database)
    expect((await database.sources.get(SOURCE_ID))?.epgManualUrl).toBeUndefined()
  })

  it('trocar o endereço zera o erro anterior', async () => {
    await recordEpgFailure(SOURCE_ID, 'refused', 10, database)
    await setEpgManualUrl(SOURCE_ID, 'http://guia.test/g.xml', database)
    expect((await getEpgStatus(SOURCE_ID, database))?.state).toBe('never_synced')
  })

  it('deslocamento: inteiro, entre −12 e +12', async () => {
    await setEpgOffsetHours(SOURCE_ID, 3.6, database)
    expect((await getEpgStatus(SOURCE_ID, database))?.offsetHours).toBe(4)
    await setEpgOffsetHours(SOURCE_ID, 99, database)
    expect((await getEpgStatus(SOURCE_ID, database))?.offsetHours).toBe(12)
    await setEpgOffsetHours(SOURCE_ID, -99, database)
    expect((await getEpgStatus(SOURCE_ID, database))?.offsetHours).toBe(-12)
    await setEpgOffsetHours(SOURCE_ID, 0, database)
    expect((await getEpgStatus(SOURCE_ID, database))?.offsetHours).toBe(0)
  })

  it('desativar apaga a programação e a marca; ativar volta a "nunca sincronizado" (FR-021)', async () => {
    await writeEpgPrograms(SOURCE_ID, [program('a', 1_000, 2_000)], database)
    await recordEpgSuccess(SOURCE_ID, 100, database)

    await setEpgEnabled(SOURCE_ID, false, database)
    expect(await getEpgStatus(SOURCE_ID, database)).toMatchObject({ state: 'disabled' })
    expect(await titles('a')).toEqual([])
    expect(await database.epgPrograms.count()).toBe(0)

    await setEpgEnabled(SOURCE_ID, true, database)
    expect((await getEpgStatus(SOURCE_ID, database))?.state).toBe('never_synced')
  })

  it('deleteEpgForSource não toca a programação de outra fonte', async () => {
    await database.sources.add({ ...SOURCE, id: 'outra' })
    await writeEpgPrograms(SOURCE_ID, [program('a', 1_000, 2_000)], database)
    await writeEpgPrograms('outra', [program('a', 1_000, 2_000)], database)

    await deleteEpgForSource(SOURCE_ID, database)

    expect(await titles('a')).toEqual([])
    expect((await listProgramsForChannels('outra', ['a'], RANGE, database)).size).toBe(1)
  })

  it('fonte inexistente: estado indefinido, gravação sem efeito', async () => {
    expect(await getEpgStatus('nao-existe', database)).toBeUndefined()
    expect(await writeEpgPrograms('nao-existe', [program('a', 1, 2)], database)).toEqual({ programCount: 0 })
    expect(await database.epgPrograms.count()).toBe(0)
  })
})
