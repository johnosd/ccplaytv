import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Tabs } from './Tabs'

afterEach(cleanup)

const ITEMS = [
  { id: 'ep', label: 'Episódios' },
  { id: 'det', label: 'Detalhes' },
  { id: 'cast', label: 'Elenco' },
]

describe('Tabs', () => {
  it('onSelect dispara só em ativação, com o id certo', () => {
    const onSelect = vi.fn()
    render(<Tabs items={ITEMS} activeId="ep" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Elenco' }))
    expect(onSelect).toHaveBeenCalledWith('cast')
  })

  it('re-renderizar com o mesmo activeId não dispara onSelect sozinho', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<Tabs items={ITEMS} activeId="ep" onSelect={onSelect} />)
    rerender(<Tabs items={ITEMS} activeId="ep" onSelect={onSelect} />)
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Episódios' })).toHaveAttribute('aria-selected', 'true')
  })
})
