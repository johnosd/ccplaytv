import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Modal } from './Modal'

afterEach(cleanup)

describe('Modal', () => {
  it('expõe role, aria-modal e aria-label', () => {
    render(
      <Modal onBack={vi.fn()} ariaLabel="Diálogo de teste">
        <button type="button">ok</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Diálogo de teste' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('desmontar um Modal ativo libera o slot para o próximo montado', () => {
    const onBackA = vi.fn()
    const { unmount } = render(
      <Modal onBack={onBackA} ariaLabel="A">
        <span>conteúdo A</span>
      </Modal>,
    )
    expect(screen.getByText('conteúdo A')).toBeInTheDocument()
    unmount()

    const onSelectB = vi.fn()
    render(
      <Modal onSelect={onSelectB} onBack={vi.fn()} ariaLabel="B">
        <span>conteúdo B</span>
      </Modal>,
    )
    expect(screen.getByText('conteúdo B')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(onSelectB).toHaveBeenCalledTimes(1)
  })

  it('painel rola sem barra nativa (feature 028, FR-006)', () => {
    render(
      <Modal onBack={vi.fn()} ariaLabel="Diálogo de teste">
        <span>conteúdo</span>
      </Modal>,
    )
    expect(document.querySelector('.modal-panel')).toHaveClass('no-scrollbar')
  })
})
