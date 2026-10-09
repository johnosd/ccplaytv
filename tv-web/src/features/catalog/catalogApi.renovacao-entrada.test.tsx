import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prefetchCategoryContent, useCategoryContent } from './catalogApi'
import { createPrefetchInvalidator } from './prefetchApi'
import { db } from '../../lib/catalog/db'
import { listCategories, storeCategories, storeCategoryItems, type CatalogCategory } from '../../lib/catalog/catalogRepository'
import { setPrefetchCategoryDone } from '../../lib/catalog/prefetch'

/**
 * Bug `categoria-aberta-nao-mostra-itens-novos`: depois de a lista atualizar a
 * estrutura, entrar numa categoria com renovação pendente abre na hora com o que
 * há no disco e renova **essa** categoria já, sem depender da fila da pré-carga
 * (que na TV fica presa numa seção inteira). Aqui o agendador nunca é iniciado:
 * só a busca direta pode trazer o filme novo.
 */

const SOURCE_ID = 'fonte-renovacao-entrada'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidator = createPrefetchInvalidator(client, 0)
  setPrefetchCategoryDone(invalidator.categoryDone)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

async function seedPendingCategory(): Promise<CatalogCategory> {
  const fetchedAt = Date.now() - 60 * 60 * 1000 // 1 h: fresca por idade, só a renovação pendente a torna velha
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Painel',
    providerDns: 'http://exemplo.test',
    providerUsername: 'usuario-teste',
    providerPassword: 'senha-teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 1,
    updatedAt: 1,
  })
  const [id] = await storeCategories([
    { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'on_demand', providerCategoryId: '10', name: 'Lançamentos', order: 0 },
  ])
  const movie = (streamId: string, name: string) => ({ sourceId: SOURCE_ID, generation: 1, kind: 'movie' as const, name, originalName: name, groupOrder: 0, providerStreamId: streamId })
  await storeCategoryItems(
    { sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId: id, groupOrder: 0 },
    [movie('1', 'Filme antigo'), movie('2', 'Removido pelo provedor')],
    fetchedAt,
  )
  // A atualização de estrutura ao abrir a lista (feature 038) marcou a categoria mantida.
  await db.categories.update(id, { renewRequestedAt: Date.now() })
  const [category] = await listCategories(SOURCE_ID, 'movie')
  return category
}

const providerNow = [
  { stream_id: 1, name: 'Filme antigo', stream_type: 'movie', category_id: '10' },
  { stream_id: 3, name: 'Filme novo', stream_type: 'movie', category_id: '10' },
]

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.resolve(new Response(JSON.stringify(providerNow))))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(async () => {
  setPrefetchCategoryDone(undefined)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.categoryBlocks.where('[sourceId+generation+kind]').between([SOURCE_ID, 0, ''], [SOURCE_ID, 99, '￿']).delete()
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
})

describe('entrada numa categoria com renovação pendente', () => {
  it('abre com o que há no disco e, sem a fila da pré-carga andar, troca pelo conteúdo atual do provedor', async () => {
    const category = await seedPendingCategory()
    const { wrapper } = setup()

    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, category), { wrapper })

    // Na hora: o que já estava no aparelho, sem esperar a rede.
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.outcome).toBe('fresh')

    // Uma busca só desta categoria, e a grade passa a mostrar o filme novo e não o removido.
    await waitFor(() => expect(result.current.data!.items.map((item) => item.name)).toEqual(['Filme antigo', 'Filme novo']))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = String(fetchSpy.mock.calls[0][0])
    expect(url).toContain('action=get_vod_streams')
    expect(url).toContain('category_id=10')
  })

  it('a pré-busca por foco (com sinal) nunca dispara essa busca direta', async () => {
    const category = await seedPendingCategory()
    const { client } = setup()

    await prefetchCategoryContent(client, SOURCE_ID, category, new AbortController().signal)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('categoria fresca e sem renovação pendente não toca a rede', async () => {
    const category = await seedPendingCategory()
    await db.categories.update(category.id, { renewRequestedAt: undefined })
    const [fresh] = await listCategories(SOURCE_ID, 'movie')
    const { wrapper } = setup()

    const { result } = renderHook(() => useCategoryContent(SOURCE_ID, fresh), { wrapper })
    await waitFor(() => expect(result.current.data?.items.length).toBe(2))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
