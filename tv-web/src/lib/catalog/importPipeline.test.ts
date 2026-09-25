import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type ImportRunRecord, type SourceRecord } from './db'
import { countChannels, listCategories, listChannels, listEpisodes, storeBatch } from './catalogRepository'
import { ImportAlreadyRunningError, startImport } from './importPipeline'
import { ensureCategory } from './categoryLoader'
import { getSource } from './sourceRepository'
import { logger } from '../logger'

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

/**
 * Lê todas as categorias de uma fonte pelo caminho normal de tela
 * (`ensureCategory`) — feature 014: nenhuma fonte M3U grava item na
 * importação, só quando a categoria é lida (FR-007/FR-009).
 */
async function readAllCategories(sourceId: string): Promise<void> {
  const categories = await listCategories(sourceId, undefined, database)
  for (const category of categories) {
    await ensureCategory(sourceId, category, { database })
  }
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
    // Canal, canal, filme e episódio — mais a série sintética que o
    // episódio cria (feature 012, D-003): "Uma Serie" vira um registro
    // `kind:'series'` próprio, além do episódio em si. O que sobra do
    // descarte por tipo é o que o classificador não consegue tipar — não
    // "tudo que não é canal".
    expect(run.channelsStored).toBe(5)
    // Contadores têm unidades diferentes e não se somam: 5 lidas (a série
    // sintética não é uma linha da fonte, então não conta aqui — feature
    // 012), 5 gravadas, 1 descartada por tipo, 1 inválida por falta de URL.
    expect(run.entriesRead).toBe(5)
    expect(run.discardedByType).toBe(1)
    expect(run.invalidCount).toBe(1)
    // Feature 014, FR-007: nada em `channels` até a categoria ser lida.
    expect(await countChannels(M3U_SOURCE.id, undefined, undefined, database)).toBe(0)

    await readAllCategories(M3U_SOURCE.id)
    expect(await countChannels(M3U_SOURCE.id, undefined, undefined, database)).toBe(5)
  })

  it('preserva os grupos declarados pela fonte, na ordem em que apareceram, com estrutura completa e contagem real (feature 010/014)', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    await (await startImport(M3U_SOURCE.id, { database })).completion

    const categories = await listCategories(M3U_SOURCE.id, undefined, database)
    // Só canal/filme/série viram categoria navegável (categoryKindOf). O
    // episódio "Uma Serie S01E01" nunca tem categoria própria — quem entra
    // na categoria "Series" é a série sintética que o agrupa (feature 012,
    // D-001/D-003), um cartão por série, não por arquivo de episódio.
    expect(categories.map((category) => category.name)).toEqual([
      'Canais | Esportes',
      'Canais | Variedades',
      'Filmes',
      'Series',
    ])
    for (const category of categories) {
      expect(category.fetchMode).toBe('stored')
      // Feature 014, D-011: diferente da 010 (provedor, sem contagem
      // antecipada), a varredura M3U sempre sabe a contagem real — é o que
      // `declaredCount` guarda assim que a importação termina.
      expect(category.declaredCount).toBe(1)
      // Ainda não lida: sem itens no disco, sem instante de leitura.
      expect(category.count).toBe(0)
      expect(category.itemsFetchedAt).toBeUndefined()
    }

    await readAllCategories(M3U_SOURCE.id)

    const readCategories = await listCategories(M3U_SOURCE.id, undefined, database)
    expect(readCategories.map((c) => c.count)).toEqual([1, 1, 1, 1])
    for (const category of readCategories) {
      expect(category.itemsFetchedAt).toBeDefined()
    }
  })

  it('cada item aponta para a categoria do seu grupo, mesmo gravado em blocos separados (batchSize pequeno)', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    // batchSize 1 força cada registro a virar um bloco próprio de
    // `storedEntries` — é o cenário que expõe se ler a categoria concatena
    // os blocos na ordem certa e mantém cada item na categoria certa.
    await (await startImport(M3U_SOURCE.id, { database, batchSize: 1 })).completion
    await readAllCategories(M3U_SOURCE.id)

    const categories = await listCategories(M3U_SOURCE.id, undefined, database)
    const idOf = (name: string) => categories.find((c) => c.name === name)!.id
    const orderOf = (name: string) => categories.find((c) => c.name === name)!.order

    const [espn] = await listChannels(M3U_SOURCE.id, orderOf('Canais | Esportes'), 0, 10, 'channel', database)
    const [filme] = await listChannels(M3U_SOURCE.id, orderOf('Filmes'), 0, 10, 'movie', database)
    // Sem categoria própria de "episódio" para pedir a página por
    // groupOrder — varre a tabela inteira, seguro numa base de teste
    // pequena (não é o caminho de leitura de produção).
    const episodio = (await database.channels.toArray()).find((item) => item.kind === 'episode')

    expect(espn.categoryId).toBe(idOf('Canais | Esportes'))
    expect(filme.categoryId).toBe(idOf('Filmes'))
    // Episódio não tem categoria navegável — categoryId fica ausente, não
    // um valor forjado.
    expect(episodio?.categoryId).toBeUndefined()
  })

  it('guarda a URL da entrada, porque para esta fonte ela é o único dado de reprodução', async () => {
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    await (await startImport(M3U_SOURCE.id, { database })).completion
    await readAllCategories(M3U_SOURCE.id)

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

  it('cancelar no meio descarta os blocos guardados da geração em escrita, preserva a ativa (feature 014)', async () => {
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
    let progressCount = 0
    handle = await startImport(M3U_SOURCE.id, {
      database,
      batchSize: 2,
      onProgress: () => {
        progressCount += 1
        // Deixa pelo menos um bloco ser gravado em `storedEntries` antes de
        // cancelar — prova que um bloco JÁ GRAVADO da geração cancelada
        // também é descartado, não só o que ainda estava em buffer.
        if (progressCount > 3) handle?.cancel()
      },
    })
    const run = await handle.completion

    expect(run.status).toBe('cancelled')
    expect(await countChannels(M3U_SOURCE.id, undefined, undefined, database)).toBe(1)
    expect((await getSource(M3U_SOURCE.id, database))?.activeGeneration).toBe(1)
    const leftoverChannels = await database.channels.filter((item) => item.generation === 2).count()
    expect(leftoverChannels).toBe(0)
    const leftoverBlocks = await database.storedEntries.filter((item) => item.generation === 2).count()
    expect(leftoverBlocks).toBe(0)
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
    // `channelsStored` pode passar de `entriesRead`: a série sintética que
    // o agrupamento M3U cria (feature 012, D-003) grava um registro extra
    // sem ser uma linha própria da fonte — não há mais o invariante
    // "nunca grava mais do que leu". O que continua valendo, e é o que
    // este teste verifica de fato, é não inventar percentual.
    for (const snapshot of snapshots) {
      expect(snapshot).not.toHaveProperty('percent')
    }
  })

  it('falta de espaço ao guardar um bloco descarta a geração inteira, nunca publica parcial (feature 014, D-009)', async () => {
    // Falha no SEGUNDO bloco — já tinha um bloco guardado com sucesso antes
    // disso, e mesmo assim nada pode sobreviver (diferente do antigo
    // truncamento por item, removido com o caminho integral).
    let callCount = 0
    const originalBulkAdd = database.storedEntries.bulkAdd.bind(database.storedEntries)
    vi.spyOn(database.storedEntries, 'bulkAdd').mockImplementation((...args) => {
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

    expect(run.status).toBe('failed')
    expect(run.errorKind).toBe('storage_full')
    // Nada publicado: nem estrutura, nem conteúdo guardado da geração que falhou.
    expect(await listCategories(M3U_SOURCE.id, undefined, database)).toEqual([])
    expect(await database.storedEntries.where('sourceId').equals(M3U_SOURCE.id).count()).toBe(0)
    expect((await getSource(M3U_SOURCE.id, database))?.activeGeneration).toBeUndefined()
  })

  it('falta de espaço no primeiro bloco também descarta a geração e não marca como completa', async () => {
    vi.spyOn(database.storedEntries, 'bulkAdd').mockRejectedValue(
      new DOMException('QuotaExceededError', 'QuotaExceededError')
    )

    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    const run = await (await startImport(M3U_SOURCE.id, { database, batchSize: 5 })).completion

    expect(run.status).toBe('failed')
    expect(run.errorKind).toBe('storage_full')
    expect(run.channelsStored).toBe(0)
    expect(await listCategories(M3U_SOURCE.id, undefined, database)).toEqual([])
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
    // Contando categorias, não itens — é o que faz a tela de progresso
    // dizer a verdade sobre o que está acontecendo (FR-013).
    expect(run.unit).toBe('categories')
    expect((await getSource(PROVIDER_SOURCE.id, database))?.providerImportMode).toBe('xtream_api')
    expect((await getSource(PROVIDER_SOURCE.id, database))?.providerMigratedAt).toBe(7000)
  })

  it('grava só a estrutura (categorias on_demand), nenhum item — conclui em passos, não em itens (T015)', async () => {
    vi.stubGlobal('fetch', panelFetch())

    await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    // Zero itens: é o que faz a importação de provedor concluir em
    // segundos, mesmo numa fonte com centenas de milhares de entradas.
    expect(await countChannels(PROVIDER_SOURCE.id, undefined, undefined, database)).toBe(0)

    const [category] = await listCategories(PROVIDER_SOURCE.id, 'channel', database)
    expect(category).toMatchObject({
      name: 'Esportes',
      providerCategoryId: '1',
      fetchMode: 'on_demand',
      count: 0,
    })
    // O protocolo Xtream não declara contagem nas categorias — o campo
    // fica ausente, nunca um número inventado no lugar (D-005).
    expect(category.declaredCount).toBeUndefined()
    expect(category.itemsFetchedAt).toBeUndefined()
    // A credencial não pode ter vazado para a estrutura em nenhuma forma.
    expect(JSON.stringify(category)).not.toContain(PROVIDER_SOURCE.providerPassword)
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
    // Volta a contar itens: o caminho legado não tem estrutura pronta de
    // antemão para contar como categorias.
    expect(run.unit).toBe('items')
    expect((await getSource(PROVIDER_SOURCE.id, database))?.providerImportMode).toBe('legacy_m3u')
    // Feature 014, FR-020: o painel foi alcançado (autenticou), só não
    // respondeu à consulta de categorias — mesmo motivo do caminho m3u_url.
    expect((await getSource(PROVIDER_SOURCE.id, database))?.limitedReason).toBe('protocol_unavailable')
  })

  it('ressincronizar e o painel voltar a falar o protocolo limpa o Modo limitado (feature 014, FR-023)', async () => {
    vi.stubGlobal('fetch', legacyPanelFetch(LEGACY_M3U))
    await (await startImport(PROVIDER_SOURCE.id, { database })).completion
    expect((await getSource(PROVIDER_SOURCE.id, database))?.providerImportMode).toBe('legacy_m3u')

    vi.stubGlobal('fetch', panelFetch())
    await (await startImport(PROVIDER_SOURCE.id, { database })).completion

    const source = await getSource(PROVIDER_SOURCE.id, database)
    expect(source?.providerImportMode).toBe('xtream_api')
    expect(source?.limitedReason).toBeUndefined()
  })

  it('no modo limitado o item nasce reproduzível, sem a credencial ir para o catálogo', async () => {
    vi.stubGlobal('fetch', legacyPanelFetch(LEGACY_M3U))

    await (await startImport(PROVIDER_SOURCE.id, { database })).completion
    await readAllCategories(PROVIDER_SOURCE.id)

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

describe('importPipeline — agrupamento de séries M3U (feature 012, US2)', () => {
  function breakingBadM3u(count: number): string {
    const lines = ['#EXTM3U']
    for (let i = 1; i <= count; i += 1) {
      const n = String(i).padStart(2, '0')
      lines.push(`#EXTINF:-1 group-title="Series",Breaking Bad S01E${n}`)
      lines.push(`http://exemplo.test/vod/${i}.mp4`)
    }
    return lines.join('\n')
  }

  it('10 episódios da mesma série viram 1 registro de série + 10 episódios, todos com o mesmo seriesId (FR-005/FR-006)', async () => {
    await database.sources.add({ ...M3U_SOURCE, id: 'fonte-bb' })
    vi.stubGlobal('fetch', respondWith(breakingBadM3u(10)))

    const run = await (await startImport('fonte-bb', { database })).completion
    await readAllCategories('fonte-bb')

    expect(run.status).toBe('completed')
    const stored = await database.channels.where('sourceId').equals('fonte-bb').toArray()
    const series = stored.filter((item) => item.kind === 'series')
    const episodes = stored.filter((item) => item.kind === 'episode')

    // Um cartão por série, nunca um por arquivo de episódio (FR-006).
    expect(series).toHaveLength(1)
    expect(episodes).toHaveLength(10)
    expect(episodes.every((ep) => ep.seriesId === series[0].seriesId)).toBe(true)
    expect(episodes.every((ep) => ep.categoryId === undefined)).toBe(true)

    // A categoria "Series" conta a série (1), não os episódios (10) —
    // mesma semântica de contagem real de itens por categoria (D-005).
    const [category] = await listCategories('fonte-bb', 'series', database)
    expect(category.name).toBe('Series')
    expect(category.count).toBe(1)
    expect(series[0].categoryId).toBe(category.id)

    const listed = await listEpisodes('fonte-bb', series[0].seriesId as string, database)
    expect(listed.map((ep) => ep.name).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `Breaking Bad S01E${String(i + 1).padStart(2, '0')}`),
    )
  })

  it('duas fontes com a mesma série não se misturam — cada uma com os próprios episódios', async () => {
    await database.sources.add({ ...M3U_SOURCE, id: 'fonte-a' })
    await database.sources.add({ ...M3U_SOURCE, id: 'fonte-b', m3uUrl: 'http://exemplo.test/b.m3u' })

    vi.stubGlobal('fetch', respondWith(breakingBadM3u(3)))
    await (await startImport('fonte-a', { database })).completion
    await readAllCategories('fonte-a')

    vi.stubGlobal('fetch', respondWith(breakingBadM3u(5)))
    await (await startImport('fonte-b', { database })).completion
    await readAllCategories('fonte-b')

    const seriesA = (await database.channels.where('sourceId').equals('fonte-a').toArray()).find(
      (item) => item.kind === 'series',
    )
    const seriesB = (await database.channels.where('sourceId').equals('fonte-b').toArray()).find(
      (item) => item.kind === 'series',
    )
    expect(seriesA).toBeDefined()
    expect(seriesB).toBeDefined()

    const episodesA = await listEpisodes('fonte-a', seriesA!.seriesId as string, database)
    const episodesB = await listEpisodes('fonte-b', seriesB!.seriesId as string, database)
    expect(episodesA).toHaveLength(3)
    expect(episodesB).toHaveLength(5)
  })

  it('Modo limitado: episódio sem SxxEyy no nome, tipado só pela URL /series/, é agrupado mesmo assim (D-012)', async () => {
    await database.sources.add(PROVIDER_SOURCE)
    const legacyM3u = [
      '#EXTM3U',
      '#EXTINF:-1 group-title="Filmes e Séries",Um Episódio Qualquer',
      'http://exemplo.test/series/usuario-teste/senha-teste/900.mp4',
    ].join('\n')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/get.php')) return Promise.resolve(textResponse(legacyM3u))
        if (url.includes('player_api.php') && url.includes('action=')) {
          return Promise.resolve(textResponse('erro', 404))
        }
        return Promise.resolve(
          textResponse(JSON.stringify({ user_info: { auth: 1, allowed_output_formats: ['ts'] } })),
        )
      }),
    )

    const run = await (await startImport(PROVIDER_SOURCE.id, { database })).completion
    await readAllCategories(PROVIDER_SOURCE.id)

    expect(run.status).toBe('completed')
    const stored = await database.channels.where('sourceId').equals(PROVIDER_SOURCE.id).toArray()
    const series = stored.filter((item) => item.kind === 'series')
    const episode = stored.find((item) => item.kind === 'episode')

    // Sem SxxEyy no nome, agrupa pelo próprio nome normalizado — mas
    // continua virando `kind:'episode'`, nunca `kind:'series'` orfão
    // (achado R-004, pré-existente à feature 012).
    expect(series).toHaveLength(1)
    expect(episode).toMatchObject({ providerStreamId: '900', streamExtension: 'mp4', seriesId: series[0].seriesId })
    expect(episode?.directUrl).toBeUndefined()
  })
})

describe('importPipeline — URL M3U reconhecida como painel Xtream (feature 014, US1)', () => {
  const M3U_PANEL_URL = 'http://exemplo.test/get.php?username=usuario-teste&password=senha-teste'

  function panelSource(id: string): SourceRecord {
    return {
      id,
      type: 'm3u_url',
      displayName: 'Lista de Painel',
      m3uUrl: M3U_PANEL_URL,
      connectionState: 'never_synced',
      createdAt: 1,
      updatedAt: 1,
    }
  }

  /** Mesmo padrão de `panelFetch` (describe "fonte de provedor"), com um ramo a mais para `get.php`. */
  function panelUrlFetch(overrides: Record<string, unknown> = {}) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.includes('get_live_categories')) {
        return Promise.resolve(
          textResponse(JSON.stringify([{ category_id: '1', category_name: 'Esportes' }])),
        )
      }
      if (url.includes('get.php')) return Promise.resolve(textResponse(MIXED_M3U))
      return Promise.resolve(
        textResponse(
          JSON.stringify({
            user_info: { auth: 1, exp_date: '0', allowed_output_formats: ['ts'], ...overrides },
          }),
        ),
      )
    })
  }

  function requestedGetPhp(fetchSpy: ReturnType<typeof vi.fn>): boolean {
    return fetchSpy.mock.calls.some((call) => typeof call[0] === 'string' && call[0].includes('get.php'))
  }

  it('URL M3U de painel confirmado importa só categorias, sem baixar get.php (FR-001/FR-002/FR-003)', async () => {
    await database.sources.add(panelSource('painel-ok'))
    const fetchSpy = panelUrlFetch()
    vi.stubGlobal('fetch', fetchSpy)

    const run = await (await startImport('painel-ok', { database })).completion

    expect(run.status).toBe('completed')
    expect(run.unit).toBe('categories')
    expect(await countChannels('painel-ok', undefined, undefined, database)).toBe(0)
    const [category] = await listCategories('painel-ok', 'channel', database)
    expect(category).toMatchObject({ name: 'Esportes', providerCategoryId: '1', fetchMode: 'on_demand' })
    const source = await getSource('painel-ok', database)
    expect(source?.providerImportMode).toBe('xtream_api')
    expect(source?.limitedReason).toBeUndefined()
    expect(requestedGetPhp(fetchSpy)).toBe(false)
  })

  it('a fonte continua identificada como URL M3U depois de confirmada como painel (FR-005)', async () => {
    await database.sources.add(panelSource('painel-tipo'))
    vi.stubGlobal('fetch', panelUrlFetch())

    await (await startImport('painel-tipo', { database })).completion

    expect((await getSource('painel-tipo', database))?.type).toBe('m3u_url')
  })

  it('painel recusa a credencial (auth 0) → falha com invalid_credentials, sem tocar no arquivo', async () => {
    await database.sources.add(panelSource('painel-auth0'))
    const fetchSpy = panelUrlFetch({ auth: 0 })
    vi.stubGlobal('fetch', fetchSpy)

    const run = await (await startImport('painel-auth0', { database })).completion

    expect(run.status).toBe('failed')
    expect(run.errorKind).toBe('invalid_credentials')
    expect(requestedGetPhp(fetchSpy)).toBe(false)
  })

  it('painel responde 401 → falha com invalid_credentials', async () => {
    await database.sources.add(panelSource('painel-401'))
    vi.stubGlobal('fetch', respondWith('{}', 401))

    const run = await (await startImport('painel-401', { database })).completion

    expect(run.errorKind).toBe('invalid_credentials')
  })

  it('assinatura vencida → falha com subscription_expired', async () => {
    await database.sources.add(panelSource('painel-vencido'))
    const past = String(Math.floor(Date.now() / 1000) - 60)
    vi.stubGlobal('fetch', panelUrlFetch({ exp_date: past }))

    const run = await (await startImport('painel-vencido', { database })).completion

    expect(run.errorKind).toBe('subscription_expired')
  })

  it('painel não responde ao protocolo (404) → cai no caminho integral, Modo limitado com protocol_unavailable', async () => {
    await database.sources.add(panelSource('painel-404'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('get.php')) return Promise.resolve(textResponse(MIXED_M3U))
        return Promise.resolve(textResponse('erro', 404))
      }),
    )

    const run = await (await startImport('painel-404', { database })).completion
    await readAllCategories('painel-404')

    expect(run.status).toBe('completed')
    expect(run.unit).toBe('items')
    const source = await getSource('painel-404', database)
    expect(source?.providerImportMode).toBe('legacy_m3u')
    expect(source?.limitedReason).toBe('protocol_unavailable')
    expect(await countChannels('painel-404', undefined, undefined, database)).toBeGreaterThan(0)
  })

  it('falha de rede ao consultar o painel (não 404) → Modo limitado com panel_unreachable', async () => {
    await database.sources.add(panelSource('painel-rede'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('get.php')) return Promise.resolve(textResponse(MIXED_M3U))
        return Promise.reject(new TypeError('Failed to fetch'))
      }),
    )

    const run = await (await startImport('painel-rede', { database })).completion

    expect(run.status).toBe('completed')
    const source = await getSource('painel-rede', database)
    expect(source?.providerImportMode).toBe('legacy_m3u')
    expect(source?.limitedReason).toBe('panel_unreachable')
  })

  it('detecção é refeita a cada importação: painel que passa a responder some do Modo limitado (FR-004/FR-023)', async () => {
    await database.sources.add(panelSource('painel-muda'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('get.php')) return Promise.resolve(textResponse(MIXED_M3U))
        return Promise.resolve(textResponse('erro', 404))
      }),
    )
    await (await startImport('painel-muda', { database })).completion
    expect((await getSource('painel-muda', database))?.providerImportMode).toBe('legacy_m3u')

    vi.stubGlobal('fetch', panelUrlFetch())
    await (await startImport('painel-muda', { database })).completion

    const source = await getSource('painel-muda', database)
    expect(source?.providerImportMode).toBe('xtream_api')
    expect(source?.limitedReason).toBeUndefined()
  })

  it('URL M3U avulsa (não reconhecida como painel) segue o caminho integral, sem modo nem motivo', async () => {
    await database.sources.add(M3U_SOURCE)
    vi.stubGlobal('fetch', respondWith(MIXED_M3U))

    const run = await (await startImport(M3U_SOURCE.id, { database })).completion

    expect(run.status).toBe('completed')
    const source = await getSource(M3U_SOURCE.id, database)
    expect(source?.providerImportMode).toBeUndefined()
    expect(source?.limitedReason).toBeUndefined()
  })

  // Feature 015 — caminho `stored` (scanToStored/toStoredRecord) propaga
  // tvg-logo pra iconUrl: filme, série sintética (herdado do 1º episódio,
  // D-003) e nunca canal (FR-009).
  it('varredura captura tvg-logo pra filme e série, e a série sintética herda do 1º episódio', async () => {
    const lines = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-logo="http://exemplo.test/espn.png" group-title="Canais",ESPN',
      'http://exemplo.test/live/1.ts',
      '#EXTINF:-1 tvg-logo="http://exemplo.test/filme.png" group-title="Filmes",Um Filme',
      'http://exemplo.test/vod/1.mp4',
      '#EXTINF:-1 group-title="Filmes",Filme Sem Capa',
      'http://exemplo.test/vod/2.mp4',
      '#EXTINF:-1 tvg-logo="http://exemplo.test/serie-ep1.png" group-title="Series",Uma Serie S01E01',
      'http://exemplo.test/series/1.mp4',
      '#EXTINF:-1 tvg-logo="http://exemplo.test/serie-ep2.png" group-title="Series",Uma Serie S01E02',
      'http://exemplo.test/series/2.mp4',
    ].join('\n')

    await database.sources.add(M3U_SOURCE)
    vi.stubGlobal('fetch', respondWith(lines))
    await (await startImport(M3U_SOURCE.id, { database })).completion
    await readAllCategories(M3U_SOURCE.id)

    const categories = await listCategories(M3U_SOURCE.id, undefined, database)
    const orderOf = (name: string) => categories.find((c) => c.name === name)!.order

    const channels = await listChannels(M3U_SOURCE.id, orderOf('Canais'), 0, 10, 'channel', database)
    expect(channels[0].iconUrl).toBeUndefined() // FR-009: canal nunca ganha capa

    const movies = await listChannels(M3U_SOURCE.id, orderOf('Filmes'), 0, 10, 'movie', database)
    const withIcon = movies.find((m) => m.name === 'Um Filme')
    const withoutIcon = movies.find((m) => m.name === 'Filme Sem Capa')
    expect(withIcon?.iconUrl).toBe('http://exemplo.test/filme.png')
    expect(withoutIcon?.iconUrl).toBeUndefined()

    const series = await listChannels(M3U_SOURCE.id, orderOf('Series'), 0, 10, 'series', database)
    // Série sintética herda a capa do 1º episódio (S01E01), não do 2º.
    expect(series[0].iconUrl).toBe('http://exemplo.test/serie-ep1.png')
  })

  // T012 — SC-007: nenhum ramo de falha ou de Modo limitado vaza usuário, senha ou URL.
  it('nenhum ramo desta fonte vaza usuário, senha ou URL, nem em run nem em log (SC-007)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn')

    function assertNoLeak(run: ImportRunRecord): void {
      const dump = JSON.stringify(run)
      expect(dump).not.toContain('usuario-teste')
      expect(dump).not.toContain('senha-teste')
      for (const call of warnSpy.mock.calls) {
        const callDump = JSON.stringify(call)
        expect(callDump).not.toContain('usuario-teste')
        expect(callDump).not.toContain('senha-teste')
      }
    }

    await database.sources.add(panelSource('vaza-401'))
    vi.stubGlobal('fetch', respondWith('{}', 401))
    assertNoLeak(await (await startImport('vaza-401', { database })).completion)

    await database.sources.add(panelSource('vaza-404'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('get.php')) return Promise.resolve(textResponse(MIXED_M3U))
        return Promise.resolve(textResponse('erro', 404))
      }),
    )
    assertNoLeak(await (await startImport('vaza-404', { database })).completion)

    await database.sources.add(panelSource('vaza-rede'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('get.php')) return Promise.resolve(textResponse(MIXED_M3U))
        return Promise.reject(new TypeError('Failed to fetch'))
      }),
    )
    assertNoLeak(await (await startImport('vaza-rede', { database })).completion)
  })
})
