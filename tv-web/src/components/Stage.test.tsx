import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stage } from './Stage'

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

const ORIGINAL_WIDTH = window.innerWidth
const ORIGINAL_HEIGHT = window.innerHeight

afterEach(() => {
  setViewport(ORIGINAL_WIDTH, ORIGINAL_HEIGHT)
})

describe('021 — Stage (US2)', () => {
  it('em 1920×1080 não aplica transform', () => {
    setViewport(1920, 1080)
    render(
      <Stage>
        <div>conteúdo</div>
      </Stage>,
    )
    const stage = document.querySelector('.stage') as HTMLElement
    expect(stage.style.transform).toBe('')
  })

  it('recalcula no resize, sem remontar os filhos', () => {
    setViewport(1920, 1080)
    render(
      <Stage>
        <div data-testid="conteudo">conteúdo</div>
      </Stage>,
    )
    const stage = document.querySelector('.stage') as HTMLElement
    const nodeBefore = screen.getByTestId('conteudo')

    setViewport(1280, 720)
    window.dispatchEvent(new Event('resize'))

    expect(stage.style.transform).toBe('translate(0px, 0px) scale(0.6666666666666666)')
    expect(screen.getByTestId('conteudo')).toBe(nodeBefore)
  })

  it('um botão focado dentro do palco continua com o foco depois do resize', () => {
    setViewport(1920, 1080)
    render(
      <Stage>
        <button type="button">foco</button>
      </Stage>,
    )
    const button = screen.getByRole('button', { name: 'foco' })
    button.focus()
    expect(document.activeElement).toBe(button)

    setViewport(1280, 720)
    window.dispatchEvent(new Event('resize'))

    expect(document.activeElement).toBe(button)
  })
})
