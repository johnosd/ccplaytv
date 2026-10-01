import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'

afterEach(cleanup)

describe('022 — EmptyState/ErrorState sempre têm ação alcançável', () => {
  // US2/AC1,AC2,AC3,AC4 · FR-010–FR-013 · Constitution: Foco Visível e Sem Becos Sem Saída
  it('EmptyState (1 ação) e ErrorState (1 ou 2 ações) são sempre ativáveis, e o código só aparece quando informado', () => {
    const emptyAction = vi.fn()
    const { rerender } = render(<EmptyState title="Nada aqui" action={{ label: 'Explorar', onSelect: emptyAction }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Explorar' }))
    expect(emptyAction).toHaveBeenCalledTimes(1)

    // ErrorState com 1 ação, sem código.
    const errorAction1 = vi.fn()
    rerender(<ErrorState title="Falhou" actions={[{ label: 'Tentar novamente', onSelect: errorAction1 }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(errorAction1).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('error-state-code')).not.toBeInTheDocument()

    // ErrorState com 2 ações e código — cada ação independentemente ativável.
    const errorAction2a = vi.fn()
    const errorAction2b = vi.fn()
    rerender(
      <ErrorState
        title="Sem conexão"
        code="NET-01"
        actions={[
          { label: 'Tentar novamente', onSelect: errorAction2a },
          { label: 'Voltar', onSelect: errorAction2b },
        ]}
      />,
    )
    expect(screen.getByTestId('error-state-code')).toHaveTextContent('NET-01')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(errorAction2b).toHaveBeenCalledTimes(1)
    expect(errorAction2a).not.toHaveBeenCalled()
  })
})
