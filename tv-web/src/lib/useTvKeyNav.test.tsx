import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTvKeyNav } from './useTvKeyNav'

function Harness({
  onBackField,
  onBack,
  initialFocus,
}: {
  onBackField?: boolean
  onBack?: () => void
  initialFocus?: () => HTMLElement | null
}) {
  const containerRef = useRef<HTMLElement>(null)
  useTvKeyNav(containerRef, { onBackField, onBack, initialFocus })
  return (
    <main ref={containerRef}>
      <button type="button">A</button>
      <button type="button">B</button>
      <button type="button">C</button>
    </main>
  )
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'))
}

describe('useTvKeyNav', () => {
  afterEach(() => cleanup())

  it('foca o primeiro focável ao montar', () => {
    const { container } = render(<Harness />)
    expect(document.activeElement).toBe(buttons(container)[0])
  })

  it('setas movem o foco em ordem DOM (próximo/anterior)', () => {
    const { container } = render(<Harness />)
    const [a, b, c] = buttons(container)

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(b)

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(c)

    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(b)

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(a)
  })

  // Feature 037 (T027a): botões e campos misturados seguem a ordem do documento,
  // não a do seletor — o jsdom agrupava os botões antes dos inputs.
  it('botões e campos misturados: as setas seguem a ordem do documento', () => {
    function Mixed() {
      const containerRef = useRef<HTMLElement>(null)
      useTvKeyNav(containerRef)
      return (
        <main ref={containerRef}>
          <div>
            <button type="button">Tipo</button>
          </div>
          <div>
            <input aria-label="Campo" />
          </div>
          <button type="button">Enviar</button>
        </main>
      )
    }
    const { getByRole, getByLabelText } = render(<Mixed />)
    expect(getByRole('button', { name: 'Tipo' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(getByLabelText('Campo')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(getByRole('button', { name: 'Enviar' })).toHaveFocus()
  })

  it('sem onBackField, a tecla Voltar não move o foco nem consome o evento', () => {
    render(<Harness />)
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      cancelable: true,
    })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('com onBackField, Voltar move o foco para o focável anterior e não sai da tela', () => {
    const onBack = vi.fn()
    const { container } = render(<Harness onBackField onBack={onBack} />)
    const [, b] = buttons(container)

    b.focus()
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      cancelable: true,
    })
    document.dispatchEvent(event)

    expect(document.activeElement).toBe(buttons(container)[0])
    expect(event.defaultPrevented).toBe(true)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('com onBackField, Voltar no primeiro focável chama onBack (e não prende o foco)', () => {
    const onBack = vi.fn()
    const { container } = render(<Harness onBackField onBack={onBack} />)

    // O foco inicial já está no primeiro elemento.
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    document.dispatchEvent(event)

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(buttons(container)[0])
  })

  it('com onBackField, o keyCode 10009 do controle Samsung também volta ao campo anterior', () => {
    const onBack = vi.fn()
    const { container } = render(<Harness onBackField onBack={onBack} />)
    const [, b] = buttons(container)

    b.focus()
    fireEvent.keyDown(document, { keyCode: 10009 })

    expect(document.activeElement).toBe(buttons(container)[0])
    expect(onBack).not.toHaveBeenCalled()
  })

  // Feature 037, D-009: `initialFocus` escolhe o foco inicial.
  describe('initialFocus', () => {
    it('foca o elemento devolvido, e as setas seguem a ordem do DOM a partir dele', () => {
      const initialFocus = () =>
        Array.from(document.querySelectorAll<HTMLElement>('main button'))[1] ?? null
      const { container } = render(<Harness initialFocus={initialFocus} />)
      const [, b, c] = buttons(container)
      expect(document.activeElement).toBe(b)

      fireEvent.keyDown(document, { key: 'ArrowDown' })
      expect(document.activeElement).toBe(c)
    })

    it('devolvendo null, cai no primeiro focável', () => {
      const { container } = render(<Harness initialFocus={() => null} />)
      expect(document.activeElement).toBe(buttons(container)[0])
    })

    it('devolvendo um elemento fora do contêiner, cai no primeiro focável', () => {
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      try {
        const { container } = render(<Harness initialFocus={() => outside} />)
        expect(document.activeElement).toBe(buttons(container)[0])
      } finally {
        outside.remove()
      }
    })

    it('não rouba o foco depois de montar: re-render não volta ao elemento pedido', () => {
      const initialFocus = () =>
        Array.from(document.querySelectorAll<HTMLElement>('main button'))[2] ?? null
      const { container, rerender } = render(<Harness initialFocus={initialFocus} />)
      const [a, , c] = buttons(container)
      expect(document.activeElement).toBe(c)

      a.focus()
      rerender(<Harness initialFocus={initialFocus} />)
      expect(document.activeElement).toBe(a)
    })
  })
})
