import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  afterEach(() => cleanup())

  it('foca "cancelar" por padrão e Enter aciona onCancel', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        message="Sair do app?"
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('seta direita move o foco pro botão de confirmar, e Enter aciona onConfirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        message="Sair do app?"
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Backspace (tecla Voltar) sempre aciona onCancel, mesmo com o botão de confirmar focado', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        message="Sair do app?"
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'Backspace' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('exibe a mensagem e os rótulos recebidos', () => {
    render(
      <ConfirmDialog
        message="Sair do app?"
        confirmLabel="Sair"
        cancelLabel="Cancelar"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText('Sair do app?')).toBeInTheDocument()
    expect(screen.getByText('Sair')).toBeInTheDocument()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
  })
})
