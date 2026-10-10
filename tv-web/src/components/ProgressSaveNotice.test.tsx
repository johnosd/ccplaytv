import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyProgressSettled } from '../lib/player/progressSettled'
import { ProgressSaveNotice } from './ProgressSaveNotice'

/** Bug `filmes-no-salvam-progresso-reproduo-nem`: o aviso global da gravação de progresso. */

function renderNotice() {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <ProgressSaveNotice />
    </QueryClientProvider>,
  )
  return invalidate
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ProgressSaveNotice', () => {
  it('gravação concluída: relê o estado do usuário (detalhe, histórico) e não mostra aviso', () => {
    const invalidate = renderNotice()
    act(() => notifyProgressSettled(null))
    const keys = invalidate.mock.calls.map(([filters]) => (filters?.queryKey as string[])[0])
    expect(keys).toEqual(expect.arrayContaining(['user-state', 'user-states', 'history-content', 'series-watched-summary']))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('falha: mostra o código curto por tempo suficiente para ler, e some sozinho', () => {
    vi.useFakeTimers()
    renderNotice()
    act(() => notifyProgressSettled('PRG-W-QUOTA'))
    expect(screen.getByText('Não foi possível salvar onde você parou (PRG-W-QUOTA).')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText(/PRG-W-QUOTA/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText(/PRG-W-QUOTA/)).toBeNull()
  })

  it('desmontar para de ouvir (sem vazamento entre telas)', () => {
    const invalidate = renderNotice()
    cleanup()
    notifyProgressSettled('PRG-W-ABORT')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
