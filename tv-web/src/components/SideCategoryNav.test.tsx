import { createRef } from 'react'
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

  // Feature 024.
  it('focusedRef é aplicado só no botão da entrada focada', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <SideCategoryNav
        entries={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        selectedId="a"
        focusedId="b"
        onSelect={vi.fn()}
        focusedRef={ref}
      />,
    )
    expect(ref.current).toBe(screen.getByRole('button', { name: 'B' }))
  })

  it('pinnedBadge: false esconde o selo ★ de uma entrada fixa, sem afetar a posição no topo', () => {
    render(
      <SideCategoryNav
        entries={[
          { id: 'todos', label: 'Todos', pinned: true, pinnedBadge: false },
          { id: 'fav', label: 'Favoritos', pinned: true },
          { id: 'a', label: 'A' },
        ]}
        selectedId="fav"
        onSelect={vi.fn()}
      />,
    )
    const labels = screen.getAllByRole('button').map((button) => button.textContent)
    expect(labels[0]).toContain('Todos')
    expect(screen.getByRole('button', { name: /Todos/ }).querySelector('.side-category-nav-pinned-badge')).toBeNull()
    expect(screen.getByRole('button', { name: /Favoritos/ }).querySelector('.side-category-nav-pinned-badge')).not.toBeNull()
  })

  // Feature 025 (D-013): cabeçalho de grupo opcional.
  it('sem groupLabel em nenhuma entrada, nenhum cabeçalho aparece (Live, inalterada)', () => {
    render(
      <SideCategoryNav
        entries={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
        selectedId="a"
        onSelect={vi.fn()}
      />,
    )
    expect(document.querySelector('.side-category-nav-group-label')).toBeNull()
  })

  it('desenha o cabeçalho só antes da primeira entrada de cada grupo', () => {
    render(
      <SideCategoryNav
        entries={[
          { id: 'fav', label: 'Favoritos', pinned: true, groupLabel: 'Sua biblioteca' },
          { id: 'hist', label: 'Histórico', pinned: true, groupLabel: 'Sua biblioteca' },
          { id: 'todos', label: 'Todos', groupLabel: 'Catálogo' },
          { id: 'a', label: 'A', groupLabel: 'Catálogo' },
        ]}
        selectedId="fav"
        onSelect={vi.fn()}
      />,
    )
    const headers = [...document.querySelectorAll('.side-category-nav-group-label')].map((el) => el.textContent)
    expect(headers).toEqual(['Sua biblioteca', 'Catálogo'])
  })
})
