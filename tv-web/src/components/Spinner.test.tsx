import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

afterEach(cleanup)

describe('Spinner', () => {
  it.each([20, 32, 48] as const)('tamanho %ipx aplica a dimensão certa', (size) => {
    render(<Spinner size={size} />)
    const spinner = screen.getByRole('status')
    expect(spinner).toHaveStyle({ width: `${size}px`, height: `${size}px` })
  })

  it('nunca mostra percentual', () => {
    render(<Spinner size={32} />)
    expect(screen.getByRole('status').textContent).not.toMatch(/%|\d/)
  })
})
