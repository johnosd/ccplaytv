import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarqueeText } from './MarqueeText'

// jsdom não faz layout: a largura do conteúdo e a da caixa vêm daqui.
function withWidths(scrollWidth: number, clientWidth: number, run: () => void) {
  const scroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')
  const client = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
  Object.defineProperty(Element.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth })
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => clientWidth })
  try {
    run()
  } finally {
    if (scroll) Object.defineProperty(Element.prototype, 'scrollWidth', scroll)
    if (client) Object.defineProperty(Element.prototype, 'clientWidth', client)
  }
}

const marquee = () => document.querySelector('.marquee') as HTMLElement

describe('MarqueeText (feature 068, FR-005)', () => {
  afterEach(cleanup)

  it('nome que não cabe rola só no item focado, pela sobra medida', () => {
    withWidths(500, 300, () => {
      const { rerender } = render(<MarqueeText text="Canal Exemplo Notícias Ação Educação HD" />)
      expect(marquee()).not.toHaveClass('is-running')
      expect(marquee().textContent).toBe('Canal Exemplo Notícias Ação Educação HD')

      rerender(<MarqueeText text="Canal Exemplo Notícias Ação Educação HD" active />)
      expect(marquee()).toHaveClass('is-running')
      expect(marquee().style.getPropertyValue('--marquee-shift')).toBe('-200px')

      rerender(<MarqueeText text="Canal Exemplo Notícias Ação Educação HD" active={false} />)
      expect(marquee()).not.toHaveClass('is-running')
    })
  })

  it('nome que cabe não anima, mesmo focado', () => {
    withWidths(200, 300, () => {
      render(<MarqueeText text="Canal Curto" active />)
      expect(marquee()).not.toHaveClass('is-running')
    })
  })

  it('"Reduzir movimento" (preferência do app e do sistema) desliga a rolagem no CSS', () => {
    const css = readFileSync(resolve(__dirname, '../styles/components.css'), 'utf8')
    expect(css).toMatch(/:root\.reduce-motion \.marquee\.is-running \.marquee-inner \{[^}]*animation: none/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.marquee\.is-running \{[^}]*\}\s*\.marquee\.is-running \.marquee-inner \{[^}]*animation: none/)
  })
})
