import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SideCategoryNav } from './SideCategoryNav'

afterEach(cleanup)

const ENTRIES = [
  { id: 'fav', label: 'Favoritos', icon: 'favorite' as const, pinned: true },
  { id: 'a', label: 'Ação', count: 3 },
]

describe('SideCategoryNav — recolhida (feature 053)', () => {
  it('recolhida mantém rótulos e contagem no DOM, mostra a inicial e a seleção funciona', () => {
    const onSelect = vi.fn()
    const { container } = render(<SideCategoryNav entries={ENTRIES} selectedId="" onSelect={onSelect} collapsed />)
    expect(container.querySelector('.side-category-nav--collapsed')).not.toBeNull()
    expect(screen.getByText('Ação', { selector: '.side-category-nav-label' })).toBeInTheDocument()
    expect(container.querySelector('.side-category-nav-initial')?.textContent).toBe('A')
    fireEvent.click(container.querySelectorAll('.side-category-nav-item')[1])
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('sem a prop o DOM é o de antes (sem classe nem inicial)', () => {
    const { container } = render(<SideCategoryNav entries={ENTRIES} selectedId="" onSelect={vi.fn()} />)
    expect(container.querySelector('.side-category-nav')?.className).toBe('side-category-nav')
    expect(container.querySelector('.side-category-nav-initial')).toBeNull()
  })
})
