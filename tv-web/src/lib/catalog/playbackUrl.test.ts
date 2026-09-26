import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CatalogDb, type CatalogRecord, type SourceRecord } from './db'
import { resolvePlaybackUrl, PlaybackUnavailableError } from './playbackUrl'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-playback-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

describe('resolvePlaybackUrl — URL M3U de painel Xtream (feature 014, US1)', () => {
  const PANEL_SOURCE: SourceRecord = {
    id: 'fonte-painel',
    type: 'm3u_url',
    displayName: 'Lista de Painel',
    m3uUrl: 'http://exemplo.test/get.php?username=joao&password=1234',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  }

  async function seedChannel(overrides: Partial<CatalogRecord> = {}): Promise<number> {
    const [id] = await database.channels.bulkAdd(
      [
        {
          sourceId: PANEL_SOURCE.id,
          generation: 1,
          kind: 'channel',
          name: 'ESPN',
          originalName: 'ESPN',
          groupOrder: 0,
          providerStreamId: '77',
          // Item de categoria on_demand nunca guarda URL — é montada na hora
          // (mesmo contrato de fonte de provedor comum).
          directUrl: undefined,
          ...overrides,
        },
      ],
      { allKeys: true },
    )
    return id as number
  }

  it('monta a URL de reprodução com a credencial derivada da URL M3U, formato preferido da conta', async () => {
    await database.sources.add(PANEL_SOURCE)
    await database.sources.update(PANEL_SOURCE.id, { providerAllowedFormats: ['ts'] })
    const channelId = await seedChannel()

    const url = await resolvePlaybackUrl(channelId, database)

    expect(url).toBe('http://exemplo.test/live/joao/1234/77.ts')
  })

  it('sem formato permitido declarado pela conta, recusa montar a URL em vez de chutar uma extensão', async () => {
    await database.sources.add(PANEL_SOURCE)
    const channelId = await seedChannel()

    await expect(resolvePlaybackUrl(channelId, database)).rejects.toBeInstanceOf(PlaybackUnavailableError)
  })

  it('URL M3U avulsa (não reconhecida como painel) continua sem credencial derivada', async () => {
    await database.sources.add({
      ...PANEL_SOURCE,
      id: 'fonte-avulsa',
      m3uUrl: 'http://exemplo.test/lista.m3u',
    })
    const channelId = await seedChannel({ sourceId: 'fonte-avulsa' })

    await expect(resolvePlaybackUrl(channelId, database)).rejects.toMatchObject({
      reason: 'source_credential_missing',
    })
  })
})
