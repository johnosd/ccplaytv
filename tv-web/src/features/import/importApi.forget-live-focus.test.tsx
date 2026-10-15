import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDeleteSource } from './importApi'
import { recalledLiveFocus, rememberLiveFocus } from '../live/liveSessionMemory'

vi.mock('../../lib/catalog/sourceRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/sourceRepository')>()
  return { ...actual, deleteSource: vi.fn().mockResolvedValue(undefined) }
})

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

// Feature 046, FR-013/D-009: excluir uma lista descarta a memória de foco da Live só dela.
describe('useDeleteSource — memória de foco da Live', () => {
  it('esquece a lista excluída e preserva as outras', async () => {
    rememberLiveFocus('lista-A', 'favorites', 'canal-1', 0)
    rememberLiveFocus('lista-B', 'favorites', 'canal-2', 1)

    const { result } = renderHook(() => useDeleteSource(), { wrapper: wrapper() })
    await act(async () => {
      result.current.mutate('lista-A')
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(recalledLiveFocus('lista-A', 'favorites')).toBeNull()
    expect(recalledLiveFocus('lista-B', 'favorites')).toEqual({ channelId: 'canal-2', index: 1 })
  })
})
