import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFavoriteToggle } from './useFavoriteToggle'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { buildStableId } from '../../lib/catalog/userStateRepository'
import { db } from '../../lib/catalog/db'

const SOURCE_ID = 'source-toggle'

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function movieItem(overrides: Partial<CatalogItemOut> = {}): CatalogItemOut {
  return {
    id: '1',
    kind: 'movie',
    name: 'Duna',
    original_group: null,
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: '42',
    original_name: 'Duna',
    ...overrides,
  }
}

async function seedSource(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte de teste',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
}

describe('useFavoriteToggle (feature 013)', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('favoritar mostra "Adicionado aos favoritos"', async () => {
    await seedSource()
    const showToast = vi.fn()
    const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

    await act(() => result.current.toggle(movieItem()))

    expect(showToast).toHaveBeenCalledWith('Adicionado aos favoritos')
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '42' })
    expect((await db.userStates.get(stableId))?.isFavorite).toBe(true)
  })

  it('desfavoritar (segundo toggle) mostra "Removido dos favoritos"', async () => {
    await seedSource()
    const showToast = vi.fn()
    const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

    await act(() => result.current.toggle(movieItem())) // favorita
    await act(() => result.current.toggle(movieItem())) // desfavorita

    expect(showToast).toHaveBeenLastCalledWith('Removido dos favoritos')
  })

  it('falha de gravação mostra aviso honesto, sem detalhe técnico e sem mudar a estrela (FR-013)', async () => {
    await seedSource()
    vi.spyOn(db.userStates, 'put').mockRejectedValueOnce(new Error('QuotaExceededError qualquer coisa técnica'))
    const showToast = vi.fn()
    const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

    await act(() => result.current.toggle(movieItem()))

    expect(showToast).toHaveBeenCalledWith('Não foi possível salvar o favorito.')
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '42' })
    expect(await db.userStates.get(stableId)).toBeUndefined() // estrela não mudou
  })

  it('item sem identidade estável mostra aviso explicativo, sem erro técnico (edge case da spec)', async () => {
    const showToast = vi.fn()
    const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

    await act(() => result.current.toggle(movieItem({ provider_stream_id: null, original_name: '' })))

    expect(showToast).toHaveBeenCalledWith('Este item não pode ser favoritado.')
  })

  describe('vizinho de foco ao desfavoritar dentro de "Favoritos" (FR-018)', () => {
    const ITEMS = [
      movieItem({ id: 'a', provider_stream_id: 'a', original_name: 'A' }),
      movieItem({ id: 'b', provider_stream_id: 'b', original_name: 'B' }),
      movieItem({ id: 'c', provider_stream_id: 'c', original_name: 'C' }),
    ]

    it('move para o item seguinte', async () => {
      await seedSource()
      const showToast = vi.fn()
      const onFocusNeighbor = vi.fn()
      const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

      await act(() => result.current.toggle(ITEMS[0], { visibleItems: ITEMS, onFocusNeighbor })) // favorita
      await act(() => result.current.toggle(ITEMS[0], { visibleItems: ITEMS, onFocusNeighbor })) // desfavorita

      expect(onFocusNeighbor).toHaveBeenCalledWith('b')
    })

    it('vai para o anterior quando é o último da lista', async () => {
      await seedSource()
      const showToast = vi.fn()
      const onFocusNeighbor = vi.fn()
      const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

      await act(() => result.current.toggle(ITEMS[2], { visibleItems: ITEMS, onFocusNeighbor }))
      await act(() => result.current.toggle(ITEMS[2], { visibleItems: ITEMS, onFocusNeighbor }))

      expect(onFocusNeighbor).toHaveBeenCalledWith('b')
    })

    it('null quando é o único item da lista', async () => {
      await seedSource()
      const showToast = vi.fn()
      const onFocusNeighbor = vi.fn()
      const single = [ITEMS[0]]
      const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

      await act(() => result.current.toggle(ITEMS[0], { visibleItems: single, onFocusNeighbor }))
      await act(() => result.current.toggle(ITEMS[0], { visibleItems: single, onFocusNeighbor }))

      expect(onFocusNeighbor).toHaveBeenCalledWith(null)
    })

    it('favoritar nunca chama onFocusNeighbor (só desfavoritar move o foco)', async () => {
      await seedSource()
      const showToast = vi.fn()
      const onFocusNeighbor = vi.fn()
      const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

      await act(() => result.current.toggle(ITEMS[0], { visibleItems: ITEMS, onFocusNeighbor }))

      expect(onFocusNeighbor).not.toHaveBeenCalled()
    })

    it('fora de "Favoritos" (sem visibleItems), desfavoritar não tenta mover o foco', async () => {
      await seedSource()
      const showToast = vi.fn()
      const { result } = renderHook(() => useFavoriteToggle(showToast), { wrapper: wrapper() })

      await act(() => result.current.toggle(ITEMS[0]))
      await expect(act(() => result.current.toggle(ITEMS[0]))).resolves.toBeUndefined()

      expect(showToast).toHaveBeenLastCalledWith('Removido dos favoritos')
    })
  })
})
