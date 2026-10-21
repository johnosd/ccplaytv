// Contratos da feature 087 — travados pelo sdd-plan; o sdd-execute só pode fazê-los passar, nunca editá-los.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRemoveTmdbKey, useWeeklyTop10 } from './catalogApi'
import { db, type CatalogReadItem } from '../../lib/catalog/db'
import { writeExternalRow } from '../../lib/catalog/showcaseRows'
import { weekKey } from '../../lib/metadata/tmdbDiscovery'

const SOURCE = 'fonte-087-tela'
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

const item = (id: number, name: string): CatalogReadItem => ({
  id, sourceId: SOURCE, generation: 1, kind: 'movie', categoryId: 1, groupOrder: 0, categoryPosition: id,
  name, originalName: name, providerStreamId: String(id), year: 2024, providerRating: 8, hasPlayback: true,
})

/** Resultado já produzido pelo segundo plano — é o que a tela deve se limitar a ler. */
async function putRow(): Promise<void> {
  await writeExternalRow({
    id: '', sourceId: SOURCE, generation: 1, kind: 'movie', row: 'top10',
    periodKey: weekKey(NOW), computedAt: NOW,
    items: [item(1, 'Alfa'), item(2, 'Beta'), item(3, 'Gama')],
    ranks: [1, 2, 3],
    backdrops: [['1', 'fundo-1.jpg']],
    ratings: [['1', { average: 8, votes: 900 }]],
    coveredCategories: 1,
    totalCategories: 2,
  })
}

beforeEach(async () => {
  await db.open()
  await db.sources.put({ id: SOURCE, type: 'provider_credentials', displayName: 'S', connectionState: 'synced',
    activeGeneration: 1, createdAt: 1, updatedAt: 1 })
  await db.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state: 'connected', lastTestedAt: 0 })
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await db.delete()
})

describe('Top 10 na tela, lido do segundo plano (087)', () => {
  // FR-001 + FR-002 + FR-003 (US1/AC1): a tela lê o resultado guardado e NÃO percorre o catálogo nem toca a rede.
  // Com resultado guardado, a fileira traz os itens e a posição real; sem ele, a fileira não existe (FR-005).
  it('mostra o resultado guardado sem tocar a rede nem percorrer o catálogo; sem resultado, a fileira não existe', async () => {
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)

    // Sem resultado guardado: a fileira não existe, e nada é disparado por causa dela.
    const vazio = renderHook(() => useWeeklyTop10(SOURCE, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(vazio.result.current.isLoading).toBe(false))
    expect(vazio.result.current.data ?? []).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()

    // Com resultado guardado: a fileira aparece com a posição real, e continua sem rede.
    await putRow()
    const cheio = renderHook(() => useWeeklyTop10(SOURCE, 'movie'), { wrapper: wrapperOf(newClient()) })
    await waitFor(() => expect(cheio.result.current.data?.length).toBe(3))
    expect(cheio.result.current.data?.map((pick) => pick.item.name)).toEqual(['Alfa', 'Beta', 'Gama'])
    expect(cheio.result.current.data?.map((pick) => pick.rank)).toEqual([1, 2, 3])
    expect(cheio.result.current.totalCategories).toBe(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // FR-011 (US3/AC2): remover a chave é a pessoa pedindo que o conteúdo do serviço saia — então o resultado guardado
  // é apagado, e a fileira some sem nenhuma requisição.
  it('remover a chave apaga o resultado guardado e a fileira some, sem requisição', async () => {
    await putRow()
    const fetchSpy = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchSpy)
    const client = newClient()

    const antes = renderHook(() => useWeeklyTop10(SOURCE, 'movie'), { wrapper: wrapperOf(client) })
    await waitFor(() => expect(antes.result.current.data?.length).toBe(3))

    const remover = renderHook(() => useRemoveTmdbKey(), { wrapper: wrapperOf(client) })
    await remover.result.current.mutateAsync()

    await waitFor(() => expect(antes.result.current.data ?? []).toEqual([]))
    expect(await db.showcaseExternalRows.where('sourceId').equals(SOURCE).count()).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
