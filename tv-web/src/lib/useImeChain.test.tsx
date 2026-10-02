import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRemoteNav } from './useRemoteNav'
import { useImeChain } from './useImeChain'
import { IME_KEYCODES } from './imeKeys'

const DONE = IME_KEYCODES.done[0]
const CANCEL = IME_KEYCODES.cancel[0]

function Form({ onSubmit, onBack }: { onSubmit: () => void; onBack: () => void }) {
  const containerRef = useRef<HTMLElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  useImeChain(containerRef, primaryRef)
  useRemoteNav({ onBack })
  return (
    <section ref={containerRef}>
      <input className="text-field-input" aria-label="Primeiro" />
      <input className="text-field-input" aria-label="Segundo" />
      <input className="text-field-input" aria-label="Terceiro" disabled />
      <input aria-label="Fora da tabela" />
      <button ref={primaryRef} type="button" onClick={onSubmit}>
        Enviar
      </button>
    </section>
  )
}

const press = (element: Element, keyCode: number) => fireEvent.keyDown(element, { key: 'Unidentified', keyCode })

describe('useImeChain', () => {
  afterEach(cleanup)

  it('Done num campo do meio avança ao próximo campo (ignora o desabilitado)', () => {
    render(<Form onSubmit={vi.fn()} onBack={vi.fn()} />)
    const first = screen.getByLabelText('Primeiro')
    first.focus()
    press(first, DONE)
    expect(screen.getByLabelText('Segundo')).toHaveFocus()
  })

  it('Done no último campo foca a ação principal e NÃO envia', () => {
    const onSubmit = vi.fn()
    render(<Form onSubmit={onSubmit} onBack={vi.fn()} />)
    const second = screen.getByLabelText('Segundo')
    second.focus()
    press(second, DONE)
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Cancel não sai da tela nem move o foco', () => {
    const onBack = vi.fn()
    render(<Form onSubmit={vi.fn()} onBack={onBack} />)
    const first = screen.getByLabelText('Primeiro')
    first.focus()
    press(first, CANCEL)
    expect(onBack).not.toHaveBeenCalled()
    expect(first).toHaveFocus()
  })

  it('Enter nunca é tomado do campo (continua do teclado do sistema)', () => {
    render(<Form onSubmit={vi.fn()} onBack={vi.fn()} />)
    const first = screen.getByLabelText('Primeiro')
    first.focus()
    expect(fireEvent.keyDown(first, { key: 'Enter', keyCode: 13 })).toBe(true)
    expect(first).toHaveFocus()
  })

  it('tecla fora da tabela, e campo que não é do TextField, são ignorados', () => {
    render(<Form onSubmit={vi.fn()} onBack={vi.fn()} />)
    const first = screen.getByLabelText('Primeiro')
    first.focus()
    press(first, 65)
    expect(first).toHaveFocus()

    const outside = screen.getByLabelText('Fora da tabela')
    outside.focus()
    press(outside, DONE)
    expect(outside).toHaveFocus()
  })
})
