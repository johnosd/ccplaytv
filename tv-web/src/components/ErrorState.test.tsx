import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ErrorState } from './ErrorState'

afterEach(cleanup)

describe('ErrorState', () => {
  it('renderiza sem ícone e sem descrição, sem espaço vazio no lugar deles', () => {
    render(<ErrorState title="Falhou" actions={[{ label: 'Tentar novamente', onSelect: vi.fn() }]} />)
    expect(screen.getByText('Falhou')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('sem código, não deixa espaço vazio no lugar do código', () => {
    render(<ErrorState title="Falhou" actions={[{ label: 'Tentar novamente', onSelect: vi.fn() }]} />)
    expect(screen.queryByTestId('error-state-code')).not.toBeInTheDocument()
  })
})
