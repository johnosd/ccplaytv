/**
 * Bug `e2e-campos-da-listagem-nao-acha-fileira-avaliados` (regressão da feature 089, commit f8179b8): a prévia da
 * categoria TEM de acompanhar a pré-carga (038). A pré-carga entrega a categoria e invalida
 * `['category-preview', sourceId, categoryId]`; antes da 089 a consulta "da janela" era observada e refazia sozinha.
 * Sem observador, a invalidação só marcava o cache e a fileira ficava em esqueleto até a janela deslizar.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCategoryPreviews, type CatalogCategory } from './catalogApi'
import * as repository from '../../lib/catalog/catalogRepository'

vi.mock('../../lib/catalog/catalogRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/catalogRepository')>()
  return { ...actual, getActiveCategoryBlock: vi.fn(), listChannels: vi.fn() }
})

function category(id: number): CatalogCategory {
  return { id, kind: 'movie', name: `Cat ${id}`, order: id, count: 0, fetchMode: 'on_demand', providerCategoryId: String(id) }
}

const channel = { id: 1, name: 'Filme', providerStreamId: '1' } as unknown as Awaited<ReturnType<typeof repository.listChannels>>[number]

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { client, wrapper }
}

afterEach(() => vi.clearAllMocks())

describe('a prévia acompanha a pré-carga (invalidação), sem deslizar a janela', () => {
  it('categoria ainda não obtida → a pré-carga a entrega e invalida → a prévia é relida e passa a "ready"', async () => {
    vi.mocked(repository.getActiveCategoryBlock).mockResolvedValue(undefined)
    vi.mocked(repository.listChannels).mockResolvedValue([])
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useCategoryPreviews('s', [category(1)]), { wrapper })
    await waitFor(() => expect(result.current.get(1)?.status).toBe('pending'))

    // A categoria chega (pré-carga 038) e ela invalida a chave, como `prefetchApi.ts` faz.
    vi.mocked(repository.listChannels).mockResolvedValue([channel])
    await client.invalidateQueries({ queryKey: ['category-preview', 's', 1] })

    await waitFor(() => expect(result.current.get(1)?.status).toBe('ready'))
    expect(result.current.get(1)?.items).toHaveLength(1)
  })

  it('invalidação de uma categoria FORA da janela não relê nada (o ganho da 089 fica)', async () => {
    vi.mocked(repository.getActiveCategoryBlock).mockResolvedValue(undefined)
    vi.mocked(repository.listChannels).mockResolvedValue([channel])
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useCategoryPreviews('s', [category(1), category(2)]), { wrapper })
    await waitFor(() => expect(result.current.size).toBe(2))
    const leituras = vi.mocked(repository.listChannels).mock.calls.length

    await client.invalidateQueries({ queryKey: ['category-preview', 's', 99] })
    await client.invalidateQueries({ queryKey: ['category-preview', 'outra-fonte', 1] })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(vi.mocked(repository.listChannels).mock.calls.length).toBe(leituras)
  })
})
