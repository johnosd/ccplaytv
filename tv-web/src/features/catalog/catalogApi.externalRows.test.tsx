/**
 * A leitura das fileiras externas na tela (feature 087) — garantias que não estão nos contratos travados.
 *
 * Destino das garantias listadas em `sdd/specs/087-top10-dica-segundo-plano/logic/producao-em-segundo-plano.md` §8 que
 * caem do lado da **leitura**.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSaveTmdbKey, useWeeklyTop10 } from './catalogApi'
import { usePrefetchForSource } from './prefetchApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import { refreshExternalRow } from '../../lib/catalog/externalRows'
import { prefetchScheduler } from '../../lib/catalog/prefetch'
import { resetAppLanguageForTests, writeAppLanguage } from '../../lib/i18n/appLanguage'
import { weekKey, type DiscoveryTitle } from '../../lib/metadata/tmdbDiscovery'

const SOURCE = 'fonte-087-leitura'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 21, 12)

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}
function wrapperOf(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const title = (name: string, rank: number): DiscoveryTitle => ({
  tmdbId: 1000 + rank, kind: 'movie', title: name, originalTitle: name, year: 2024, rank,
  voteAverage: 8, voteCount: 900, popularity: 100 - rank, backdropUrl: `fundo-${rank}.jpg`,
})

/** Lista com catálogo, chave e ranking em cache: o produtor tem tudo para produzir sem tocar a rede. */
async function seedSource(): Promise<void> {
  await db.sources.put({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
  await db.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state: 'connected', lastTestedAt: 0 })
  const [id] = await storeCategories([{
    sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'on_demand',
    order: 0, providerCategoryId: '100', name: 'Cat 0',
  }], db)
  const items: CatalogRecord[] = ['Alfa', 'Beta', 'Gama'].map((name, index) => ({
    sourceId: SOURCE, generation: 1, kind: 'movie', groupOrder: 0,
    name, originalName: name, providerStreamId: String(index),
    addedAt: NOW - index * 1000, providerRating: 8, year: 2024,
  }))
  await renewCategoryItems({ sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: id, groupOrder: 0 }, items, NOW, db)
  await db.discoveryCache.put({
    id: 'trending:movie:pt', source: 'trending', kind: 'movie', language: 'pt',
    periodKey: weekKey(NOW), fetchedAt: NOW, titles: [title('Alfa', 1), title('Beta', 2), title('Gama', 3)],
  })
}

function resetLanguage(): void {
  try {
    window.localStorage.clear()
  } catch {
    // armazenamento indisponível: o teste segue com o idioma de sessão descartado
  }
  resetAppLanguageForTests()
}

beforeEach(async () => {
  resetLanguage()
  await db.open()
  await seedSource()
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetLanguage()
  await db.delete()
})

describe('as fileiras externas lidas na tela (087)', () => {
  // T027 / FR-006 (garantia 4): a fileira entra com a tela JÁ ABERTA. O teste nunca desmonta nem remonta o hook — é
  // exatamente isso que ele prova: o aviso da gravação invalida a chave daquele tipo e a leitura se repete sozinha.
  it('a fileira entra sem remontar a tela depois que a fila produz', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    const client = newClient()
    // `usePrefetchForSource(null)` instala os assinantes da raiz sem ligar a fila de pré-carga — é a fiação real.
    const view = renderHook(() => {
      usePrefetchForSource(null)
      return useWeeklyTop10(SOURCE, 'movie')
    }, { wrapper: wrapperOf(client) })

    await waitFor(() => expect(view.result.current.isLoading).toBe(false))
    expect(view.result.current.data ?? []).toEqual([])

    await act(async () => {
      expect(await refreshExternalRow(SOURCE, 'movie', 'top10', { now: NOW })).toBe(true)
    })

    await waitFor(() => expect(view.result.current.data?.length).toBe(3))
    expect(view.result.current.data?.map((pick) => pick.item.name)).toEqual(['Alfa', 'Beta', 'Gama'])
    expect(view.result.current.data?.map((pick) => pick.rank)).toEqual([1, 2, 3])
    // Nada disso passou pelo serviço externo: o ranking já estava em cache e a tela só leu o registro.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Garantia 5: o resultado não é calculado na renderização. Agora é trivial de verificar — a tela lê um registro por
  // chave primária, então o conteúdo já vem pronto do segundo plano, com a posição e a cobertura gravadas.
  it('a tela só lê: a posição e a cobertura vêm do registro, não de um cálculo na renderização', async () => {
    await refreshExternalRow(SOURCE, 'movie', 'top10', { now: NOW })
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    const view = renderHook(() => useWeeklyTop10(SOURCE, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(view.result.current.data?.length).toBe(3))
    expect(view.result.current.totalCategories).toBe(1)
    expect(view.result.current.coveredCategories).toBe(1)
    // Feature 060/061: o fundo que veio do serviço foi guardado junto; mostrar o card não consulta nada.
    expect(view.result.current.images?.size).toBe(3)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Garantia 11 (US2/AC4): o registro é por lista. Trocar a lista ativa mostra o daquela lista e não dispara consulta.
  it('trocar a lista não dispara consulta, e a fileira de outra lista nunca aparece', async () => {
    await refreshExternalRow(SOURCE, 'movie', 'top10', { now: NOW })
    await db.sources.put({ id: 'outra-fonte', type: 'provider_credentials', displayName: 'O', connectionState: 'synced',
      activeGeneration: 1, createdAt: 1, updatedAt: 1 })
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    const client = newClient()

    const outra = renderHook(() => useWeeklyTop10('outra-fonte', 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(outra.result.current.isLoading).toBe(false))
    expect(outra.result.current.data ?? []).toEqual([])

    const ativa = renderHook(() => useWeeklyTop10(SOURCE, 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(ativa.result.current.data?.length).toBe(3))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  // Garantia 12 (FR-012): trocar o idioma **mantém** a fileira na tela com o resultado anterior e marca para refazer.
  // A assimetria com remover a chave é deliberada — trocar o idioma não é pedido para esvaziar nada.
  it('trocar o idioma mantém a fileira na tela e marca o registro para refazer', async () => {
    await refreshExternalRow(SOURCE, 'movie', 'top10', { now: NOW })
    const acordar = vi.spyOn(prefetchScheduler, 'wake')
    const view = renderHook(() => {
      usePrefetchForSource(null)
      return useWeeklyTop10(SOURCE, 'movie')
    }, { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(view.result.current.data?.length).toBe(3))

    act(() => {
      writeAppLanguage('en')
    })

    // O período zerado é o "refaça": a fila produz no idioma novo na próxima rodada, que foi acordada agora.
    await waitFor(async () => {
      expect((await db.showcaseExternalRows.get(`${SOURCE}|movie|top10`))?.periodKey).toBe('')
    })
    expect(acordar).toHaveBeenCalled()
    // E o que importa para quem está olhando: os itens continuam guardados e a fileira continua na tela.
    expect((await db.showcaseExternalRows.get(`${SOURCE}|movie|top10`))?.items.length).toBe(3)
    expect(view.result.current.data?.length).toBe(3)
  })

  // Garantia 13 (FR-010): a pessoa salvou a chave e espera consequência — a fila acorda na hora, em vez de esperar a
  // próxima rodada. Que acordar produz a fileira é o que os testes do produtor cobrem; aqui se verifica o gatilho.
  it('salvar a chave acorda a fila de segundo plano', async () => {
    await db.integrations.clear()
    const acordar = vi.spyOn(prefetchScheduler, 'wake')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => (
      String(input).includes('/authentication')
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response(JSON.stringify({ results: [] }), { status: 200 })
    )))

    const salvar = renderHook(() => useSaveTmdbKey(), { wrapper: wrapperOf(newClient()) })
    await act(async () => {
      await salvar.result.current.mutateAsync(KEY)
    })
    expect(acordar).toHaveBeenCalled()
  })
})
