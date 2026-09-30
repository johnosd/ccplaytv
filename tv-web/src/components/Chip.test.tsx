import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Chip } from './Chip'

afterEach(cleanup)

describe('Chip', () => {
  it('selecionado e não selecionado diferem em mais de um sinal, não só cor', () => {
    const { rerender } = render(<Chip selected={false}>Ação</Chip>)
    const button = screen.getByRole('button')
    expect(button).not.toHaveClass('chip-selected')
    expect(button).toHaveAttribute('aria-pressed', 'false')

    rerender(<Chip selected>Ação</Chip>)
    expect(button).toHaveClass('chip-selected')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('✓')).toBeInTheDocument()
  })
})
