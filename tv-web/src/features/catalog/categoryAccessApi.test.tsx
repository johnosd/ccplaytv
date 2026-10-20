import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/catalog/db'
import { isSessionUnlocked, relockSession, unlockWithPin, notifyCategoryAccessChanged } from '../../lib/catalog/categoryAccess'
import { enableParentalControl } from '../../lib/parental/listPin'
import { useCategoryAccessLifecycle } from './categoryAccessApi'
import { createPrefetchInvalidator } from './prefetchApi'

/** Feature 066 (T028, FR-015, D-005): rebloqueio por segundo plano e troca de lista; reset só quando havia sessão. */

let queryClient: QueryClient

function mount(sourceId: string | null) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return renderHook(({ id }: { id: string | null }) => useCategoryAccessLifecycle(id), { wrapper, initialProps: { id: sourceId } })
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(async () => {
  queryClient = new QueryClient()
  await enableParentalControl('sala', '1111', [])
})

afterEach(async () => {
  cleanup()
  relockSession()
  setVisibility('visible')
  await db.table('parentalPins').clear()
  notifyCategoryAccessChanged() // a regra guardada em memória não vê limpeza direta das tabelas
})

describe('useCategoryAccessLifecycle', () => {
  it('ir para segundo plano rebloqueia e refaz as consultas do catálogo', async () => {
    mount('sala')
    await act(async () => {
      expect(await unlockWithPin('sala', '1111')).toBe(true)
    })
    const reset = vi.spyOn(queryClient, 'resetQueries')

    act(() => setVisibility('hidden'))
    expect(isSessionUnlocked('sala')).toBe(false)
    expect(reset).toHaveBeenCalledWith({ queryKey: ['categories'] })
  })

  // Feature 084 (FR-007): o limite de remontagem do índice vale só para a pré-carga; mudar o acesso relê na hora.
  it('esconder/bloquear categoria remonta o índice na hora, mesmo dentro da janela do limite da pré-carga', async () => {
    mount('sala')
    const fetchIndex = vi.fn(async () => ({ entries: [] }))
    const key = ['catalog-search-index', 'sala', 'movie']
    queryClient.setQueryData(key, { entries: [] })
    const unsubscribe = new QueryObserver(queryClient, { queryKey: key, queryFn: fetchIndex, staleTime: Infinity }).subscribe(() => {})
    const invalidator = createPrefetchInvalidator(queryClient, 0, 60_000)
    try {
      invalidator.categoryDone('sala', 1, 'movie') // abre a janela: a 1ª remontagem é imediata
      await waitFor(() => expect(fetchIndex).toHaveBeenCalledTimes(1))

      act(() => notifyCategoryAccessChanged())
      await waitFor(() => expect(fetchIndex).toHaveBeenCalledTimes(2)) // sem esperar os 60 s da janela
    } finally {
      invalidator.dispose()
      unsubscribe()
    }
  })

  it('trocar de lista rebloqueia; sem sessão aberta, nada é refeito à toa', async () => {
    const { rerender } = mount('sala')
    await act(async () => {
      await unlockWithPin('sala', '1111')
    })
    rerender({ id: 'quarto' })
    expect(isSessionUnlocked('sala')).toBe(false)

    const reset = vi.spyOn(queryClient, 'resetQueries')
    rerender({ id: 'sala' })
    act(() => setVisibility('hidden'))
    expect(reset).not.toHaveBeenCalled()
  })
})
