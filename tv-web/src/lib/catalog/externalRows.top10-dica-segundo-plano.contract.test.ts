// Contratos da feature 087 — travados pelo sdd-plan; o sdd-execute só pode fazê-los passar, nunca editá-los.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type CatalogRecord } from './db'
import { renewCategoryItems, storeCategories } from './catalogRepository'
import { readExternalRow } from './showcaseRows'
import { refreshExternalRow } from './externalRows'
import { selectTop10, matchDiscoveryTitlesAsync, TOP10_MIN } from '../metadata/discoveryRules'
import { weekKey, type DiscoveryTitle } from '../metadata/tmdbDiscovery'

const SOURCE = 'fonte-087'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 21, 12)

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-087-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

/** O dia local, na mesma forma que o carregador do TMDB usa para a Dica. */
function dayOf(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Chave do TMDB conectada: sem isto o carregador não tenta nada. */
async function putKey(): Promise<void> {
  await database.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state: 'connected', lastTestedAt: 0 })
}

/**
 * Ranking no cache do período pedido. Com o cache em dia, o carregador responde **sem tocar a rede** — é assim que
 * estes contratos montam o cenário sem depender de `fetch`.
 */
async function putCache(source: 'trending' | 'pool', kind: 'movie' | 'series', titles: DiscoveryTitle[], periodKey?: string): Promise<void> {
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

/** Catálogo com um item por nome dado, todos numa categoria obtida. */
async function seed(names: readonly string[], kind: 'movie' | 'series' = 'movie'): Promise<void> {
  const [id] = await storeCategories([{
    sourceId: SOURCE, generation: 1, kind, fetchMode: 'on_demand',
    order: 0, providerCategoryId: '100', name: 'Cat 0',
  }], database)
  const items: CatalogRecord[] = names.map((name, index) => ({
    sourceId: SOURCE, generation: 1, kind, groupOrder: 0,
    name, originalName: name, providerStreamId: String(index),
    addedAt: NOW - index * 1000, providerRating: 8, year: 2024,
  }))
  await renewCategoryItems({ sourceId: SOURCE, generation: 1, kind, categoryId: id, groupOrder: 0 }, items, NOW, database)
}

describe('produção do Top 10 e da Dica em segundo plano (087)', () => {
  // FR-004 (US1/AC1): o conteúdo tem de ser o MESMO que as regras de hoje produzem — mesmos itens, mesma ordem,
  // mesma posição no ranking. É o contrato que impede a feature de mudar a fileira ao mudar de lugar.
  it('grava os mesmos itens, na mesma ordem e com a posição real, que as regras atuais produzem', async () => {
    const nomes = ['Alfa', 'Beta', 'Gama', 'Delta']
    await seed(nomes)
    await putKey()
    // Ranking com um título que a lista NÃO tem ('Zeta'), para o casamento ter de descartá-lo.
    const titulos = [title('Beta', 1), title('Zeta', 2), title('Alfa', 3), title('Delta', 4)]
    await putCache('trending', 'movie', titulos)

    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)

    const guardado = await readExternalRow(SOURCE, 'movie', 'top10', database)
    // A referência: as mesmas funções da feature 057, aplicadas aos mesmos dados.
    const locais = await database.channels.where('sourceId').equals(SOURCE).toArray()
    const casados = await matchDiscoveryTitlesAsync(titulos, locais, {
      id: (record) => String(record.id),
      name: (record) => record.originalName,
      year: (record) => record.year,
      rating: (record) => record.providerRating,
      addedAt: (record) => record.addedAt,
    })
    const esperado = selectTop10(casados)

    expect(guardado?.items.map((item) => item.name)).toEqual(esperado.map(({ local }) => local.name))
    expect(guardado?.ranks).toEqual(esperado.map(({ rank }) => rank))
    expect(guardado?.periodKey).toBe(weekKey(NOW))
    // O fundo que veio do serviço fica junto: a tela não pode consultar nada para obtê-lo (FR-003).
    expect(guardado?.backdrops?.length).toBe(esperado.length)
  })

  // FR-007 + FR-008 (US2/AC1, AC3): o período guardado é a validade. Dentro dele, nenhuma consulta; vencido e sem
  // resposta nova, o guardado continua valendo — a fileira nunca fica vazia por causa de rede.
  it('dentro do período não produz nada, e com o período vencido sem resposta mantém o que está guardado', async () => {
    await seed(['Alfa', 'Beta', 'Gama'])
    await putKey()
    await putCache('trending', 'movie', [title('Alfa', 1), title('Beta', 2), title('Gama', 3)])
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)
    const primeiro = await readExternalRow(SOURCE, 'movie', 'top10', database)
    expect(primeiro?.items.length).toBeGreaterThanOrEqual(TOP10_MIN)

    // Mesma semana: nada a fazer, e nenhuma requisição é disparada.
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW + 60_000 })).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()

    // Semana seguinte, serviço fora do ar e cache de outro período: o guardado sobrevive intacto.
    fetchSpy.mockRejectedValue(new Error('sem rede'))
    const outraSemana = NOW + 8 * 24 * 60 * 60 * 1000
    await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: outraSemana }).catch(() => undefined)
    const depois = await readExternalRow(SOURCE, 'movie', 'top10', database)
    expect(depois?.items.map((item) => item.name)).toEqual(primeiro?.items.map((item) => item.name))
    expect(depois?.periodKey).toBe(weekKey(NOW))
    vi.unstubAllGlobals()
  })

  // FR-015: abaixo do mínimo a fileira não existe NAQUELE PERÍODO — e isso precisa ficar gravado, senão a fila repete
  // o trabalho (montar o índice do tipo inteiro) a cada rodada. É o caso que um executor erraria mais facilmente.
  it('abaixo do mínimo de cruzados grava o período com a fileira vazia, para a fila não repetir o trabalho', async () => {
    await seed(['Alfa'])
    await putKey()
    // Só 1 cruzado, abaixo de TOP10_MIN (3).
    await putCache('trending', 'movie', [title('Alfa', 1), title('Zeta', 2), title('Ômega', 3)])

    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW })).toBe(true)

    const guardado = await readExternalRow(SOURCE, 'movie', 'top10', database)
    expect(guardado).toBeDefined()
    expect(guardado?.items).toEqual([])
    expect(guardado?.periodKey).toBe(weekKey(NOW))

    // E a segunda chamada no mesmo período não refaz nada.
    expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { database, now: NOW + 60_000 })).toBe(false)
  })
})
