/**
 * Produção do Top 10 e da Dica em segundo plano (feature 087) — o lado do **produtor**.
 *
 * Este arquivo é o novo lugar das garantias que a feature 057 cobria na tela (`catalogApi.discovery*.test.tsx`), para
 * as linhas que a tabela de `sdd/specs/087-top10-dica-segundo-plano/logic/producao-em-segundo-plano.md` §8 manda para
 * o produtor (FR-017). O que está travado no contrato (`externalRows.top10-dica-segundo-plano.contract.test.ts`):
 * equivalência com as regras de hoje, o período como validade e o registro vazio abaixo do mínimo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { renewCategoryItems, storeCategories } from './catalogRepository'
import { readExternalRow } from './showcaseRows'
import { onExternalRowRefreshed, refreshExternalRow, refreshStaleExternalRows } from './externalRows'
import { beginSectionLoad } from './loadActivity'
import { noteFirstReveal, resetFirstRevealForTests } from '../assembly/firstReveal'
import { RATE_LIMIT_PAUSE_MS } from '../metadata/tmdbKeyRepository'
import { weekKey, type DiscoveryTitle } from '../metadata/tmdbDiscovery'

/**
 * Observador do índice do tipo: delega para a implementação real e só conta as leituras. É assim que se verifica que o
 * produtor **para antes** de montar o índice quando não há títulos (garantias 3, 9 e 10) — a parte cara não pode rodar
 * em vão.
 */
const espiao = vi.hoisted(() => ({ leiturasDoIndice: 0 }))
vi.mock('./catalogDerivedRows', async (importOriginal) => {
  const real = await importOriginal<typeof import('./catalogDerivedRows')>()
  return {
    ...real,
    iterateKindRecordBatches: (...args: Parameters<typeof real.iterateKindRecordBatches>) => {
      espiao.leiturasDoIndice += 1
      return real.iterateKindRecordBatches(...args)
    },
  }
})

const SOURCE = 'fonte-087-produtor'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 21, 12)
const DIA_MS = 24 * 60 * 60 * 1000

let database: CatalogDb

beforeEach(async () => {
  espiao.leiturasDoIndice = 0
  // A fila só chega ao produtor depois da primeira tela da sessão (T047); o estado normal de quem o chama é "revelada".
  resetFirstRevealForTests()
  noteFirstReveal()
  database = new CatalogDb(`test-087p-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await database.delete()
})

function dayOf(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

async function putKey(over: { state?: 'connected' | 'refused' | 'offline' | 'rate_limited'; pausedUntil?: number } = {}): Promise<void> {
  await database.integrations.put({ id: 'tmdb', key: KEY, format: 'v3',
    state: over.state ?? 'connected', lastTestedAt: 0, pausedUntil: over.pausedUntil })
}

/** Ranking no cache do período: com ele em dia o carregador responde sem tocar a rede. */
async function putCache(
  source: 'trending' | 'pool',
  kind: 'movie' | 'series',
  titles: DiscoveryTitle[],
  periodKey?: string,
): Promise<void> {
  await database.discoveryCache.put({
    id: `${source}:${kind}:pt`,
    source,
    kind,
    language: 'pt',
    periodKey: periodKey ?? (source === 'trending' ? weekKey(NOW) : dayOf(NOW)),
    fetchedAt: NOW,
    titles,
  })
}

const title = (name: string, rank: number, kind: 'movie' | 'series' = 'movie'): DiscoveryTitle => ({
  tmdbId: 1000 + rank, kind, title: name, originalTitle: name, year: 2024, rank,
  voteAverage: 8, voteCount: 900, popularity: 100 - rank, backdropUrl: `fundo-${rank}.jpg`,
})

/** Uma categoria obtida com os nomes dados, mais `pending` categorias declaradas e ainda não obtidas. */
async function seed(
  names: readonly string[],
  kind: 'movie' | 'series' = 'movie',
  order = 0,
  pending = 0,
): Promise<number[]> {
  const ids = await storeCategories([
    { sourceId: SOURCE, generation: 1, kind, fetchMode: 'on_demand',
      order, providerCategoryId: String(100 + order), name: `Cat ${order}` },
    ...Array.from({ length: pending }, (_, index) => ({
      sourceId: SOURCE, generation: 1, kind, fetchMode: 'on_demand' as const,
      order: order + index + 1, providerCategoryId: String(200 + index), name: `Pendente ${index}`,
    })),
  ], database)
  const items: CatalogRecord[] = names.map((name, index) => ({
    sourceId: SOURCE, generation: 1, kind, groupOrder: order,
    name, originalName: name, providerStreamId: `${order}-${index}`,
    addedAt: NOW - index * 1000, providerRating: 8, year: 2024,
  }))
  await renewCategoryItems({ sourceId: SOURCE, generation: 1, kind, categoryId: ids[0], groupOrder: order }, items, NOW, database)
  return ids
}

const nomes = (row: Awaited<ReturnType<typeof readExternalRow>>): string[] => (row?.items ?? []).map((item) => item.name)

describe('o produtor das fileiras externas (087)', () => {
  // Garantia 1: cruza o ranking guardado com a lista, com a posição REAL, a cobertura, e sem rede. A versão `[L]` perde
  // para a principal, e um título que a lista não tem é descartado.
  it('cruza com a posição real e a cobertura, sem tocar a rede, e a principal vence a versão [L]', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    await putKey()
    await seed(['Alfa', 'Beta [L]', 'Beta', 'Gama', 'Fora do ranking'], 'movie', 0, 1)
    await putCache('trending', 'movie', [title('Alfa', 1), title('Ausente', 2), title('Beta', 3), title('Gama', 4)])

    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)

    const guardado = await readExternalRow(SOURCE, 'movie', 'top10', database)
    expect(nomes(guardado)).toEqual(['Alfa', 'Beta', 'Gama'])
    expect(guardado?.ranks).toEqual([1, 3, 4])
    // Uma categoria obtida de duas declaradas: é o aviso de escopo parcial da fileira.
    expect(guardado?.coveredCategories).toBe(1)
    expect(guardado?.totalCategories).toBe(2)
    // Feature 061: a nota veio junto, por id do item da lista — a tela não consulta nada ao focar.
    const notas = new Map(guardado?.ratings ?? [])
    for (const item of guardado?.items ?? []) {
      expect(notas.get(String(item.id))).toEqual({ average: 8, votes: 900 })
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Garantia 2, no lado da Dica: abaixo do mínimo de candidatos válidos a fileira é vazia (o Top 10 está no contrato).
  it('a Dica fica vazia abaixo do mínimo de candidatos, e o período é gravado', async () => {
    await putKey()
    await seed(['Um', 'Dois', 'Três', 'Quatro'])
    await putCache('pool', 'movie', ['Um', 'Dois', 'Três', 'Quatro'].map((name, index) => title(name, index + 1)))

    expect(await refreshExternalRow(SOURCE, 'movie', 'tip', { database, now: NOW })).toBe(true)
    const guardado = await readExternalRow(SOURCE, 'movie', 'tip', database)
    expect(guardado?.items).toEqual([])
    expect(guardado?.periodKey).toBe(dayOf(NOW))
    // O Top 10 não guarda posição para uma fileira que não é dele.
    expect(guardado?.ranks).toBeUndefined()
  })

  // Garantia 3: sem chave não há dado, e o índice **nem é lido** — a parte cara não roda em vão.
  it('sem chave não produz nada e não lê o índice do tipo', async () => {
    await seed(['Alfa', 'Beta', 'Gama'])
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)])
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(false)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeUndefined()
    expect(espiao.leiturasDoIndice).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Garantia 4 (T036): uma categoria que chega depois atualiza a fileira. Ela **não** muda o período, então a cobertura
  // gravada entra na validade — sem isso a fileira ficaria parada no catálogo de quando foi produzida até a semana virar.
  it('categoria que chega depois refaz a fileira, sem consultar nada', async () => {
    await putKey()
    const ids = await seed(['Alfa', 'Beta', 'Gama'], 'movie', 0, 1)
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3), title('Delta', 5)])
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)
    expect(nomes(await readExternalRow(SOURCE, 'movie', 'top10', database))).toEqual(['Alfa', 'Beta', 'Gama'])

    // A categoria pendente é obtida: o mesmo ranking agora cruza um título a mais.
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    await renewCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: ids[1], groupOrder: 1 },
      [{ sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: 1, name: 'Delta', originalName: 'Delta',
        providerStreamId: '1-0', addedAt: NOW, providerRating: 8, year: 2024 }], NOW, database)

    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)
    const depois = await readExternalRow(SOURCE, 'movie', 'top10', database)
    expect(depois?.ranks).toEqual([1, 2, 3, 5])
    expect(depois?.coveredCategories).toBe(2)
    // Refazer o cruzamento não é consultar: o ranking do período já estava guardado.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Garantia 6: o tipo decide as DUAS pontas — o ranking que se carrega e o índice com que se cruza.
  it('série usa o ranking e o índice de séries, e não os de filmes', async () => {
    await putKey()
    await seed(['Alfa', 'Beta', 'Gama'], 'movie', 0)
    await seed(['Zeta', 'Teta', 'Iota'], 'series', 1)
    // O ranking de séries nomeia as séries da lista; o de filmes nomeia as MESMAS séries — que não existem no índice
    // de filmes. Se o produtor trocasse o índice, a fileira de filmes viria cheia.
    const series = [title('Zeta', 1, 'series'), title('Teta', 2, 'series'), title('Iota', 3, 'series')]
    await putCache('trending', 'series', series)
    await putCache('trending', 'movie', series.map((item) => ({ ...item, kind: 'movie' as const })))

    expect(await refreshExternalRow(SOURCE, 'series', 'top10', { database, now: NOW })).toBe(true)
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)

    const serie = await readExternalRow(SOURCE, 'series', 'top10', database)
    expect(nomes(serie)).toEqual(['Zeta', 'Teta', 'Iota'])
    expect(serie?.ranks).toEqual([1, 2, 3])
    expect(serie?.items.every((item) => item.kind === 'series')).toBe(true)
    const filme = await readExternalRow(SOURCE, 'movie', 'top10', database)
    expect(filme?.items).toEqual([])
    expect(filme?.periodKey).toBe(weekKey(NOW))
  })

  // Garantia 7: a Dica sorteia o MESMO no mesmo dia — a semente é do dia, do tipo e da lista. Produzir duas vezes no
  // mesmo dia (apagando o registro no meio, que é o que forçaria um sorteio novo) dá o mesmo resultado.
  it('a Dica sorteia igual no mesmo dia, mesmo produzida de novo', async () => {
    await putKey()
    const candidatos = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete']
    await seed(candidatos)
    await putCache('pool', 'movie', candidatos.map((name, index) => title(name, index + 1)))

    await refreshExternalRow(SOURCE, 'movie', 'tip', { database, now: NOW })
    const primeiro = nomes(await readExternalRow(SOURCE, 'movie', 'tip', database))
    expect(primeiro.length).toBeGreaterThan(0)

    await database.showcaseExternalRows.clear()
    // Outro instante do MESMO dia: a semente não muda, então o sorteio não muda.
    await refreshExternalRow(SOURCE, 'movie', 'tip', { database, now: NOW + 3 * 60 * 60 * 1000 })
    expect(nomes(await readExternalRow(SOURCE, 'movie', 'tip', database))).toEqual(primeiro)
  })

  // Garantia 8 — a que **muda de natureza** (R-004): antes o dia ficava fixo na montagem da tela; agora fica fixo no
  // período gravado. É mais forte: sobrevive a remontagens, e o relógio andando dentro do dia não produz nada.
  it('o sorteio da Dica é fixado no período gravado: o relógio andando no mesmo dia não o troca', async () => {
    await putKey()
    const candidatos = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete']
    await seed(candidatos)
    await putCache('pool', 'movie', candidatos.map((name, index) => title(name, index + 1)))

    expect(await refreshExternalRow(SOURCE, 'movie', 'tip', { database, now: NOW })).toBe(true)
    const antes = await readExternalRow(SOURCE, 'movie', 'tip', database)

    // 6 horas depois, mesmo dia: nada a fazer, e o registro fica idêntico.
    expect(await refreshExternalRow(SOURCE, 'movie', 'tip', { database, now: NOW + 6 * 60 * 60 * 1000 })).toBe(false)
    const depois = await readExternalRow(SOURCE, 'movie', 'tip', database)
    expect(nomes(depois)).toEqual(nomes(antes))
    expect(depois?.periodKey).toBe(dayOf(NOW))

    // Outro dia, com o ranking daquele dia em cache: aí sim produz, e o período acompanha.
    await putCache('pool', 'movie', candidatos.map((name, index) => title(name, index + 1)), dayOf(NOW + DIA_MS))
    expect(await refreshExternalRow(SOURCE, 'movie', 'tip', { database, now: NOW + DIA_MS })).toBe(true)
    expect((await readExternalRow(SOURCE, 'movie', 'tip', database))?.periodKey).toBe(dayOf(NOW + DIA_MS))
  })

  // Garantia 9: chave recusada ou em pausa por limite de uso — nenhuma requisição, o índice nem é lido, e o guardado
  // continua valendo. É o FR-009: nada disso esvazia a fileira.
  it('chave recusada ou em pausa: nenhuma requisição, e o guardado continua valendo', async () => {
    await putKey()
    await seed(['Alfa', 'Beta', 'Gama'])
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)])
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)
    const guardado = await readExternalRow(SOURCE, 'movie', 'top10', database)

    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    const outraSemana = NOW + 8 * DIA_MS
    for (const credencial of [{ state: 'refused' as const }, { state: 'rate_limited' as const, pausedUntil: outraSemana + RATE_LIMIT_PAUSE_MS }]) {
      espiao.leiturasDoIndice = 0
      await putKey(credencial)
      expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: outraSemana })).toBe(false)
      expect(espiao.leiturasDoIndice).toBe(0)
      expect(nomes(await readExternalRow(SOURCE, 'movie', 'top10', database))).toEqual(nomes(guardado))
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Garantia 10: sem rede, com cache de outro período o guardado continua (não se grava o conteúdo velho sob o período
  // novo); sem cache nenhum nada é gravado, e a fileira simplesmente não existe — sem erro.
  it('sem rede: o guardado sobrevive, e sem cache nenhum nada é gravado', async () => {
    await putKey()
    await seed(['Alfa', 'Beta', 'Gama'])
    const fetchSpy = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchSpy)

    // Sem cache nenhum: nada a mostrar, nada gravado, e nenhuma exceção escapa.
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(false)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeUndefined()

    // Com o ranking de outra semana guardado, a produção da semana nova não vinga — e não apaga nada.
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)], '2000-W01')
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(false)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeUndefined()
  })

  // T028 (FR-006): a fileira entra com a tela aberta porque a gravação AVISA. A invalidação da pré-carga depende de uma
  // categoria chegar, e o produtor roda quando não há mais nenhuma a chegar — sem este aviso, a fileira só apareceria
  // na próxima visita.
  it('avisa quem está ouvindo quando grava, e não avisa quando não havia o que fazer', async () => {
    await putKey()
    await seed(['Alfa', 'Beta', 'Gama'])
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)])

    const avisos: Array<[string, string]> = []
    const cancelar = onExternalRowRefreshed((sourceId, kind) => avisos.push([sourceId, kind]))
    try {
      expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)
      expect(avisos).toEqual([[SOURCE, 'movie']])

      // Mesmo período e mesma cobertura: nada foi produzido, então nada é avisado (senão a tela releria em vão).
      expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW + 60_000 })).toBe(false)
      expect(avisos).toEqual([[SOURCE, 'movie']])
    } finally {
      cancelar()
    }
  })

  // T050: a varredura entrega **um tipo** por rodada, com o índice montado UMA vez e reusado pelas duas fileiras. Antes
  // era uma fileira por rodada, e cada uma remontava o índice do tipo inteiro: o dobro da parte cara. Medido na TV
  // antes da correção: quadro de 1750 ms e entrada em categoria de 3,7 s.
  it('monta o índice do tipo uma vez por rodada e grava as duas fileiras do tipo', async () => {
    await putKey()
    await seed(['Alfa', 'Beta', 'Gama', 'Quatro', 'Cinco', 'Seis'])
    const titulos = ['Alfa', 'Beta', 'Gama', 'Quatro', 'Cinco', 'Seis'].map((name, index) => title(name, index + 1))
    await putCache('trending', 'movie', titulos)
    await putCache('pool', 'movie', titulos)

    espiao.leiturasDoIndice = 0
    expect(await refreshStaleExternalRows(SOURCE, { database, now: NOW })).toBe(true)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeDefined()
    expect(await readExternalRow(SOURCE, 'movie', 'tip', database)).toBeDefined()
    // **Uma** montagem para as duas fileiras: é o número que a TV sente.
    expect(espiao.leiturasDoIndice).toBe(1)

    // Nada mais a fazer: a fila segue para as outras tarefas em vez de repetir o índice do tipo.
    espiao.leiturasDoIndice = 0
    expect(await refreshStaleExternalRows(SOURCE, { database, now: NOW })).toBe(false)
    expect(espiao.leiturasDoIndice).toBe(0)
  })

  // T047 (FR-014 / Decisões Invariantes 5 e 6): a fila chama o `housekeeping` depois de CADA categoria da carga, e o
  // portão do agendador não sabe disso. Sem estas duas barreiras, o índice do tipo inteiro seria remontado a cada
  // categoria que chega — o trabalho que a feature 086 tirou do caminho da carga.
  it('não produz enquanto a carga da lista está em curso', async () => {
    await putKey()
    await seed(['Alfa', 'Beta', 'Gama'])
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)])

    const fimDaCarga = beginSectionLoad()
    try {
      expect(await refreshStaleExternalRows(SOURCE, { database, now: NOW })).toBe(false)
      // A parte cara nem começa: é ela que degradava a carga.
      expect(espiao.leiturasDoIndice).toBe(0)
      expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeUndefined()
    } finally {
      fimDaCarga()
    }

    // Terminada a carga, a mesma rodada produz.
    expect(await refreshStaleExternalRows(SOURCE, { database, now: NOW })).toBe(true)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeDefined()
  })

  it('não produz antes da primeira tela da sessão aparecer', async () => {
    await putKey()
    await seed(['Alfa', 'Beta', 'Gama'])
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)])

    // Sinal rearmado e nenhuma tela revelada ainda: é o instante em que a pessoa acabou de entrar na lista.
    resetFirstRevealForTests()
    expect(await refreshStaleExternalRows(SOURCE, { database, now: NOW })).toBe(false)
    expect(espiao.leiturasDoIndice).toBe(0)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeUndefined()

    // A tela apareceu: a fila pode trabalhar.
    noteFirstReveal()
    expect(await refreshStaleExternalRows(SOURCE, { database, now: NOW })).toBe(true)
    expect(await readExternalRow(SOURCE, 'movie', 'top10', database)).toBeDefined()
  })

  // FR-013: o registro pertence à geração ativa. Sem lista (ou sem geração) não se produz nada — não há onde ancorá-lo.
  it('não produz para uma lista sem geração ativa', async () => {
    await putKey()
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)])
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    expect(await refreshExternalRow('fonte-que-nao-existe', 'movie', 'top10', { database, now: NOW })).toBe(false)
    expect(espiao.leiturasDoIndice).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
