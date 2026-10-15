import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

describe('TextField — cobertura pelo teclado (feature 045, US3)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('ao receber o foco, pede a rolagem do bloco do campo (rótulo + campo + dica + erro)', () => {
    const frame = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 0
    })
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    document.body.append(scroller)
    const rects: string[] = []
    const original = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      rects.push((this as HTMLElement).className || (this as HTMLElement).tagName)
      return original.call(this)
    })

    render(<TextField label="Servidor" purpose="url" value="" onChange={vi.fn()} hint="dica" />, { container: scroller })
    fireEvent.focus(screen.getByLabelText('Servidor'))

    expect(frame).toHaveBeenCalled()
    // Mediu o contêiner rolável e o bloco inteiro `.text-field`, não só o <input>.
    expect(rects).toContain('text-field')
    scroller.remove()
  })

  it('sem ancestral rolável, focar não quebra nada', () => {
    render(<TextField label="Buscar" purpose="search" value="" onChange={vi.fn()} />)
    expect(() => fireEvent.focus(screen.getByLabelText('Buscar'))).not.toThrow()
  })
})
