import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorState } from './ErrorState'

afterEach(cleanup)

describe('ErrorState — ação soft disabled sem conexão (feature 042, FR-004)', () => {
  it('fica focável e marcada, com o motivo no nome acessível, e NÃO dispara onSelect', () => {
    const onSelect = vi.fn()
    render(
      <ErrorState
        title="O conteúdo desta lista não está mais no aparelho"
        actions={[{ label: 'Ressincronizar lista', onSelect, softDisabledReason: 'indisponível sem conexão' }]}
        focusedActionIndex={0}
      />,
    )
    const button = screen.getByRole('button', { name: /Ressincronizar lista, indisponível sem conexão/ })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveClass('is-soft-disabled', 'tv-focus')
    fireEvent.click(button)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('sem motivo, é uma ação normal', () => {
    const onSelect = vi.fn()
    render(<ErrorState title="Erro" actions={[{ label: 'Tentar de novo', onSelect }]} focusedActionIndex={0} />)
    const button = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(button).not.toHaveAttribute('aria-disabled')
    fireEvent.click(button)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
