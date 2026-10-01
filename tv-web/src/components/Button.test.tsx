import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Button } from './Button'

afterEach(cleanup)

describe('Button', () => {
  it.each(['primary', 'secondary', 'ghost', 'accent'] as const)('variante %s usa a classe certa', (variant) => {
    render(
      <Button variant={variant} onSelect={vi.fn()}>
        Ação
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveClass(`button-${variant}`)
  })

  it('disabled usa .is-hard-disabled e não dispara onSelect', () => {
    const onSelect = vi.fn()
    render(
      <Button variant="primary" disabled onSelect={onSelect}>
        Ação
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toHaveClass('is-hard-disabled')
    fireEvent.click(button)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('loading não dispara onSelect ao clicar, e não mostra percentual', () => {
    const onSelect = vi.fn()
    render(
      <Button variant="primary" loading onSelect={onSelect}>
        Enviando
      </Button>,
    )
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(onSelect).not.toHaveBeenCalled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.textContent).not.toMatch(/%|\d/)
  })
})
