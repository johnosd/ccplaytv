import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTvKeyNav } from './useTvKeyNav'

function Harness({
  onBackField,
  onBack,
}: {
  onBackField?: boolean
  onBack?: () => void
}) {
  const containerRef = useRef<HTMLElement>(null)
  useTvKeyNav(containerRef, { onBackField, onBack })
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
})
