import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/catalog/db'
import { isSessionUnlocked, relockSession, unlockWithPin, notifyCategoryAccessChanged } from '../../lib/catalog/categoryAccess'
import { enableParentalControl } from '../../lib/parental/pin'
import { useCategoryAccessLifecycle } from './categoryAccessApi'

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
  await enableParentalControl('1111', [])
})

afterEach(async () => {
  cleanup()
  relockSession()
  setVisibility('visible')
  await db.table('parentalPin').clear()
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
