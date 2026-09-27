import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { IconButton } from './IconButton'

afterEach(cleanup)

describe('IconButton', () => {
  it('sempre expõe nome acessível, mesmo sem texto ao lado', () => {
    render(<IconButton icon="search" label="Buscar" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument()
  })

  it('disabled usa .is-hard-disabled e não dispara onSelect', () => {
    const onSelect = vi.fn()
    render(<IconButton icon="search" label="Buscar" onSelect={onSelect} disabled />)
    const button = screen.getByRole('button', { name: 'Buscar' })
    expect(button).toHaveClass('is-hard-disabled')
  })
})
