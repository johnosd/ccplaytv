import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type ImportRunRecord, type SourceRecord } from './db'
import { countChannels, listCategories, listChannels, storeBatch } from './catalogRepository'
import { ImportAlreadyRunningError, startImport } from './importPipeline'
import { getSource } from './sourceRepository'

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-pipeline-${Math.random().toString(36).slice(2)}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

const M3U_SOURCE: SourceRecord = {
  id: 'fonte-m3u',
  type: 'm3u_url',
  displayName: 'Lista por URL',
  m3uUrl: 'http://exemplo.test/lista.m3u',
  connectionState: 'never_synced',
  createdAt: 1,
  updatedAt: 1,
}

const PROVIDER_SOURCE: SourceRecord = {
  id: 'fonte-provedor',
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://exemplo.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
  connectionState: 'never_synced',
  createdAt: 1,
  updatedAt: 1,
}

/**
 * Catálogo misto: dois canais, um filme, um episódio, uma entrada que o
 * classificador não consegue tipar e uma entrada sem URL.
 */
const MIXED_M3U = [
  '#EXTM3U',
  '#EXTINF:-1 group-title="Canais | Esportes",ESPN',
  'http://exemplo.test/live/1.ts',
  '#EXTINF:-1 group-title="Canais | Variedades",Canal Variedades',
  'http://exemplo.test/live/2.ts',
  '#EXTINF:-1 group-title="Filmes",Um Filme Qualquer',
  'http://exemplo.test/vod/1.mp4',
  '#EXTINF:-1 group-title="Series",Uma Serie S01E01',
  'http://exemplo.test/series/1.mp4',
  '#EXTINF:-1 group-title="Aleatorio",Coisa Sem Tipo',
  'http://exemplo.test/outro/1.mp4',
  '#EXTINF:-1 group-title="Canais | Esportes",Entrada Sem URL',
].join('\n')

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status })
}

/**
 * Um corpo de resposta só pode ser lido uma vez. Reaproveitar o mesmo
 * objeto entre chamadas entregaria um corpo já consumido à segunda
 * importação — falha do teste, não do pipeline.
 */
function respondWith(body: string, status = 200) {
  return vi.fn().mockImplementation(() => Promise.resolve(textResponse(body, status)))
}

describe('importPipeline — fonte por URL M3U', () => {
  beforeEach(async () => {
    await database.sources.add(M3U_SOURCE)
  })

  it('grava os tipos que sabe classificar e contabiliza o que descartou (FR-008)', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    const handle = await startImport(M3U_SOURCE.id, { database })
    const run = await handle.completion

    expect(run.status).toBe('completed')
    // Canal, canal, filme e episódio. O que sobra do descarte por tipo é o
    // que o classificador não consegue tipar — não "tudo que não é canal".
    expect(run.channelsStored).toBe(4)
    // Contadores têm unidades diferentes e não se somam: 5 lidas, 4
    // gravadas, 1 descartada por tipo, 1 inválida por falta de URL.
    expect(run.entriesRead).toBe(5)
    expect(run.discardedByType).toBe(1)
    expect(run.invalidCount).toBe(1)
    expect(await countChannels(M3U_SOURCE.id, undefined, undefined, database)).toBe(4)
  })

  it('preserva os grupos declarados pela fonte, na ordem em que apareceram', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    await (await startImport(M3U_SOURCE.id, { database })).completion

    const categories = await listCategories(M3U_SOURCE.id, undefined, database)
    expect(categories.map((category) => category.name)).toEqual([
      'Canais | Esportes',
      'Canais | Variedades',
      'Filmes',
      'Series',
    ])
  })

  it('guarda a URL da entrada, porque para esta fonte ela é o único dado de reprodução', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    await (await startImport(M3U_SOURCE.id, { database })).completion

    const [first] = await listChannels(M3U_SOURCE.id, 0, 0, 1, undefined, database)
    expect(first.directUrl).toBe('http://exemplo.test/live/1.ts')
  })

  it('lê a resposta em fluxo, sem materializar o texto inteiro (D-002)', async () => {
    const textSpy = vi.fn()
    const response = textResponse(MIXED_M3U)
    // Se alguém trocar o caminho de fluxo por um `await response.text()`,
    // este teste falha — é a única forma de travar isso sem medir memória.
    Object.defineProperty(response, 'text', { value: textSpy })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await (await startImport(M3U_SOURCE.id, { database })).completion

    expect(textSpy).not.toHaveBeenCalled()
  })

  it('carimba o início de cada etapa onde ela acontece, em ordem', async () => {
    // O trabalho roda noutra thread: se o tempo por etapa fosse medido na
    // chegada da mensagem, o detalhamento sairia errado justamente numa
    // importação longa — que é quando ele importa (US1).
    let clock = 1000
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    const run = await (
      await startImport(M3U_SOURCE.id, {
        database,
        now: () => {
          clock += 10
          return clock
        },
      })
    ).completion

    const stamps = run.stepStartedAt
    expect(stamps?.fetching).toBe(run.startedAt)
    expect(stamps?.parsing).toBeGreaterThan(stamps?.fetching as number)
    expect(stamps?.storing).toBeGreaterThan(stamps?.parsing as number)
    expect(stamps?.done).toBeGreaterThan(stamps?.storing as number)
  })

  it('marca sincronização só no sucesso', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    await (await startImport(M3U_SOURCE.id, { database, now: () => 5000 })).completion

    const view = await getSource(M3U_SOURCE.id, database)
    expect(view?.lastSuccessfulSyncAt).toBe(5000)
    expect(view?.connectionState).toBe('synced')
    expect(view?.activeGeneration).toBe(1)
  })

  it('manifesto HLS é recusado como categoria própria, não importado como canal (FR-019)', async () => {
    const manifest = ['#EXTM3U', '#EXT-X-TARGETDURATION:10', '#EXTINF:10.0,', 'seg0.ts'].join('\n')
    vi.stubGlobal('fetch', respondWith(manifest))

    const run = await (await startImport(M3U_SOURCE.id, { database })).completion

    expect(run.status).toBe('failed')
    expect(run.errorKind).toBe('hls_manifest')
  })

  it('erro de rede vira categoria, nunca a mensagem crua que carrega a URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const run = await (await startImport(M3U_SOURCE.id, { database })).completion

    expect(run.status).toBe('failed')
    expect(run.errorKind).toBe('network_failure')
    expect(JSON.stringify(run)).not.toContain('exemplo.test')
  })

  it('distingue provedor que recusa conexão direta de falha de rede (FR-011)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
        init?.mode === 'no-cors'
          ? Promise.resolve(new Response(null, { status: 200 }))
          : Promise.reject(new TypeError('Failed to fetch')),
      ),
    )

    const run = await (await startImport(M3U_SOURCE.id, { database })).completion

    expect(run.errorKind).toBe('direct_connection_refused')
  })

  it('importação que falha não toca no catálogo que já estava no ar', async () => {
    await storeBatch(
      [
        {
          sourceId: M3U_SOURCE.id,
          generation: 1,
          kind: 'channel',
      name: 'Canal Antigo',
          originalName: 'Canal Antigo',
          group: 'Esportes',
          groupOrder: 0,
        },
      ],
      database,
    )
    await database.sources.update(M3U_SOURCE.id, { activeGeneration: 1 })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await (await startImport(M3U_SOURCE.id, { database })).completion

    const visible = await listChannels(M3U_SOURCE.id, 0, 0, 10, undefined, database)
    expect(visible.map((item) => item.name)).toEqual(['Canal Antigo'])
    expect((await getSource(M3U_SOURCE.id, database))?.activeGeneration).toBe(1)
  })

  it('cancelar descarta a geração em escrita e preserva a ativa', async () => {
    await storeBatch(
      [
        {
          sourceId: M3U_SOURCE.id,
          generation: 1,
          kind: 'channel',
      name: 'Canal Antigo',
          originalName: 'Canal Antigo',
          group: 'Esportes',
          groupOrder: 0,
        },
      ],
      database,
    )
    await database.sources.update(M3U_SOURCE.id, { activeGeneration: 1 })

    const many = ['#EXTM3U']
    for (let index = 0; index < 20; index += 1) {
      many.push(`#EXTINF:-1 group-title="Canais",Canal ${index}`, `http://exemplo.test/${index}.ts`)
    }
    vi.stubGlobal('fetch', respondWith(many.join('\n')))

    let handle: Awaited<ReturnType<typeof startImport>> | undefined
    handle = await startImport(M3U_SOURCE.id, {
      database,
      batchSize: 2,
      onProgress: () => handle?.cancel(),
    })
    const run = await handle.completion

    expect(run.status).toBe('cancelled')
    expect(await countChannels(M3U_SOURCE.id, undefined, undefined, database)).toBe(1)
    expect((await getSource(M3U_SOURCE.id, database))?.activeGeneration).toBe(1)
    const leftovers = await database.channels.filter((item) => item.generation === 2).count()
    expect(leftovers).toBe(0)
  })

  it('recusa uma segunda importação enquanto houver uma ativa (FR-017)', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))
    const first = await startImport(M3U_SOURCE.id, { database })

    await expect(startImport(M3U_SOURCE.id, { database })).rejects.toBeInstanceOf(
      ImportAlreadyRunningError,
    )

    await first.completion
    // Terminada a primeira, a fonte volta a aceitar importação. A segunda é
    // aguardada até o fim de propósito: deixá-la correndo solta escreveria
    // num banco que o teste seguinte já apagou.
    const second = await startImport(M3U_SOURCE.id, { database })
    await expect(second.completion).resolves.toMatchObject({ status: 'completed' })
  })

  it('relata progresso com contadores reais, sem percentual inventado', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))
    const snapshots: ImportRunRecord[] = []

    await (
      await startImport(M3U_SOURCE.id, {
        database,
        batchSize: 1,
        onProgress: (snapshot) => snapshots.push(snapshot),
      })
    ).completion

    // O primeiro progresso sai ANTES de qualquer rede. Sem ele, a tela fica
    // sem informação durante todo o download — minutos parecendo
    // travamento numa lista grande — e a etapa de obtenção não teria
    // instante inicial contra o qual ser medida.
    expect(snapshots[0].step).toBe('fetching')
    expect(snapshots[0].entriesRead).toBe(0)

    expect(snapshots.length).toBeGreaterThan(1)
    expect(snapshots.map((snapshot) => snapshot.step)).toContain('storing')
    for (const snapshot of snapshots) {
      expect(snapshot).not.toHaveProperty('percent')
      expect(snapshot.channelsStored).toBeLessThanOrEqual(snapshot.entriesRead)
    }
  })

  it('falta de espaço com parte gravada publica o que coube e declara truncamento (R-009/FR-018)', async () => {
    // Para falhar no SEGUNDO lote (já tem canaisStored > 0)
    let callCount = 0
    const originalBulkAdd = database.channels.bulkAdd.bind(database.channels)
    vi.spyOn(database.channels, 'bulkAdd').mockImplementation((...args) => {
      callCount += 1
      if (callCount === 2) {
        return Promise.reject(new DOMException('QuotaExceededError', 'QuotaExceededError')) as any
      }
      return originalBulkAdd(...args)
    })

    const many = ['#EXTM3U']
    for (let index = 0; index < 20; index += 1) {
      many.push(`#EXTINF:-1 group-title="Canais",Canal ${index}`, `http://exemplo.test/${index}.ts`)
    }
    vi.stubGlobal('fetch', respondWith(many.join('\n')))

    const run = await (await startImport(M3U_SOURCE.id, { database, batchSize: 5 })).completion

    // Concluída, mas com truncamento marcado (parte coube, foi publicada).
    expect(run.status).toBe('completed')
    expect(run.truncatedByStorage).toBe(true)
    expect(run.channelsStored).toBe(5) // O primeiro lote coube

    const visible = await countChannels(M3U_SOURCE.id, undefined, undefined, database)
    expect(visible).toBe(5)
  })

  it('falta de espaço no primeiro lote descarta a geração e não marca como completa (R-009)', async () => {
    vi.spyOn(database.channels, 'bulkAdd').mockRejectedValue(
      new DOMException('QuotaExceededError', 'QuotaExceededError')
    )

    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    const run = await (await startImport(M3U_SOURCE.id, { database, batchSize: 5 })).completion

    // Falhou, truncamento marcado, mas NENHUM canal gravado.
    expect(run.status).toBe('failed')
    expect(run.truncatedByStorage).toBe(true)
    expect(run.errorKind).toBeUndefined()
    expect(run.channelsStored).toBe(0)

    const visible = await countChannels(M3U_SOURCE.id, undefined, undefined, database)
    expect(visible).toBe(0)
  })
})

describe('importPipeline — fonte de provedor', () => {
  beforeEach(async () => {
    await database.sources.add(PROVIDER_SOURCE)
  })

  function panelFetch(overrides: Record<string, unknown> = {}) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes('get_live_categories')) {
        return Promise.resolve(
          textResponse(JSON.stringify([{ category_id: '1', category_name: 'Esportes' }])),
        )
      }
      if (url.includes('get_live_streams')) {
        return Promise.resolve(
          textResponse(JSON.stringify([{ name: 'ESPN', stream_id: 9, category_id: '1' }])),
        )
      }
      return Promise.resolve(
        textResponse(
          JSON.stringify({
            user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'], ...overrides },
          }),
        ),
      )
    })
  }

  it('importa pelo protocolo JSON e registra o modo usado', async () => {
    vi.stubGlobal('fetch', panelFetch())

    const run = await (await startImport(PROVIDER_SOURCE.id, { database, now: () => 7000 }))
      .completion

    expect(run.status).toBe('completed')
    expect(run.channelsStored).toBe(1)
    expect((await getSource(PROVIDER_SOURCE.id, database))?.providerImportMode).toBe('xtream_api')
    expect((await getSource(PROVIDER_SOURCE.id, database))?.providerMigratedAt).toBe(7000)
  })

  it('não guarda a URL de reprodução no catálogo — ela é montada na hora', async () => {
    vi.stubGlobal('fetch', panelFetch())

    await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    const [channel] = await listChannels(PROVIDER_SOURCE.id, 0, 0, 1, undefined, database)
    expect(channel.directUrl).toBeUndefined()
    expect(channel.providerStreamId).toBe('9')
    // A credencial não pode ter vazado para o catálogo em nenhuma forma.
    expect(JSON.stringify(channel)).not.toContain(PROVIDER_SOURCE.providerPassword)
  })

  it('assinatura expirada é categoria própria, distinta de credencial recusada', async () => {
    const past = String(Math.floor(Date.now() / 1000) - 60)
    vi.stubGlobal('fetch', panelFetch({ exp_date: past }))

    const run = await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    expect(run.errorKind).toBe('subscription_expired')
  })

  it('credencial recusada não vira falha de rede', async () => {
    vi.stubGlobal('fetch', respondWith('{}', 401))

    const run = await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    expect(run.errorKind).toBe('invalid_credentials')
  })

  function legacyPanelFetch(m3u: string) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes('/get.php')) return Promise.resolve(textResponse(m3u))
      if (url.includes('player_api.php') && url.includes('action=')) {
        // O painel autentica, mas não responde a nenhuma consulta de catálogo.
        return Promise.resolve(textResponse('erro', 404))
      }
      return Promise.resolve(
        textResponse(JSON.stringify({ user_info: { auth: 1, allowed_output_formats: ['ts'] } })),
      )
    })
  }

  const LEGACY_M3U = [
    '#EXTM3U',
    '#EXTINF:-1 group-title="Canais",Canal Legado',
    'http://exemplo.test/live/usuario-teste/senha-teste/77.ts',
    '#EXTINF:-1 group-title="Filmes",Filme Legado',
    'http://exemplo.test/movie/usuario-teste/senha-teste/500.mkv',
  ].join('\n')

  it('painel sem o protocolo JSON cai no modo limitado, em vez de falhar', async () => {
    vi.stubGlobal('fetch', legacyPanelFetch(LEGACY_M3U))

    const run = await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    expect(run.status).toBe('completed')
    expect(run.channelsStored).toBe(2)
    expect((await getSource(PROVIDER_SOURCE.id, database))?.providerImportMode).toBe('legacy_m3u')
  })

  it('no modo limitado o item nasce reproduzível, sem a credencial ir para o catálogo', async () => {
    vi.stubGlobal('fetch', legacyPanelFetch(LEGACY_M3U))

    await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    const stored = await database.channels.toArray()
    const canal = stored.find((item) => item.kind === 'channel')
    const filme = stored.find((item) => item.kind === 'movie')

    // Sem identificador, todo item do modo limitado seria inabrível — era o
    // catálogo que se vê e não se abre.
    expect(canal).toMatchObject({ providerStreamId: '77', streamExtension: 'ts' })
    // O segmento da URL é o painel declarando o tipo: sem ele, o filme viria
    // classificado só pelo nome e a reprodução montaria uma URL de canal.
    expect(filme).toMatchObject({ providerStreamId: '500', streamExtension: 'mkv' })

    for (const item of stored) {
      expect(item.directUrl).toBeUndefined()
      expect(JSON.stringify(item)).not.toContain(PROVIDER_SOURCE.providerPassword)
    }
  })

  it('execução deixada em andamento por um fechamento do app não tranca a fonte', async () => {
    // Sem reconciliação, este registro faz toda importação seguinte ser
    // recusada com ImportAlreadyRunningError — para sempre.
    await database.importRuns.add({
      id: 'run-orfa',
      sourceId: PROVIDER_SOURCE.id,
      generation: 1,
      status: 'running',
      step: 'fetching',
      entriesRead: 0,
      channelsStored: 0,
      discardedByType: 0,
      invalidCount: 0,
      truncatedByStorage: false,
      startedAt: Date.now() - 10 * 60 * 1000,
      heartbeatAt: Date.now() - 10 * 60 * 1000,
    })
    vi.stubGlobal('fetch', panelFetch())

    const run = await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    expect(run.status).toBe('completed')
    const orfa = await database.importRuns.get('run-orfa')
    // Fechada como interrompida, não como cancelada: ninguém cancelou nada.
    expect(orfa?.status).toBe('failed')
    expect(orfa?.errorKind).toBe('interrupted')
  })

  it('seção que o painel não serve fica declarada, em vez de virar lista vazia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('get_live_categories')) {
          return Promise.resolve(
            textResponse(JSON.stringify([{ category_id: '1', category_name: 'Esportes' }])),
          )
        }
        if (url.includes('get_live_streams')) {
          return Promise.resolve(
            textResponse(JSON.stringify([{ name: 'ESPN', stream_id: 9, category_id: '1' }])),
          )
        }
        if (url.includes('get_vod_')) return Promise.resolve(textResponse('erro', 404))
        if (url.includes('get_series')) return Promise.resolve(textResponse('erro', 404))
        return Promise.resolve(
          textResponse(
            JSON.stringify({
              user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'] },
            }),
          ),
        )
      }),
    )

    const run = await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    expect(run.status).toBe('completed')
    expect(run.channelsStored).toBe(1)
    expect(run.unavailableSections).toEqual(['movie', 'series'])
  })
})
