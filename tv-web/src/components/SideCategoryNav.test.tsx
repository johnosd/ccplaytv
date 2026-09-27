import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SideCategoryNav } from './SideCategoryNav'

afterEach(cleanup)

describe('SideCategoryNav', () => {
  it('entradas pinned ficam sempre no topo, na ordem recebida', () => {
    render(
      <SideCategoryNav
        entries={[
          { id: 'c', label: 'C' },
          { id: 'fav', label: 'Favoritos', pinned: true },
          { id: 'a', label: 'A' },
          { id: 'hist', label: 'Histórico', pinned: true },
          { id: 'b', label: 'B' },
        ]}
        selectedId="fav"
        onSelect={vi.fn()}
      />,
    )
    const labels = screen.getAllByRole('button').map((button) => button.textContent)
    expect(labels[0]).toContain('Favoritos')
    expect(labels[1]).toContain('Histórico')
    expect(labels.slice(2)).toEqual(['C', 'A', 'B'])
  })

  it('entrada sem contagem não desenha número', () => {
    render(<SideCategoryNav entries={[{ id: 'a', label: 'A' }]} selectedId="a" onSelect={vi.fn()} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
