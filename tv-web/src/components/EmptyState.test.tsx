import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('renderiza sem ícone e sem descrição, sem espaço vazio no lugar deles', () => {
    render(<EmptyState title="Nada aqui" action={{ label: 'Explorar', onSelect: vi.fn() }} />)
    expect(screen.getByText('Nada aqui')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('não comunica o estado só por cor — tem título em texto visível', () => {
    render(<EmptyState title="Nada aqui" description="Adicione uma fonte" action={{ label: 'Explorar', onSelect: vi.fn() }} />)
    expect(screen.getByText('Nada aqui')).toBeInTheDocument()
    expect(screen.getByText('Adicione uma fonte')).toBeInTheDocument()
  })
})
