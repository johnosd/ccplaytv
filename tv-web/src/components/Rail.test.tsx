import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { Rail } from './Rail'

const VIEWPORT_WIDTH = 1200
const ITEM_WIDTH = 300

let restoreOffsetWidth: PropertyDescriptor | undefined

beforeEach(() => {
  // Mesma técnica do contrato C3: dá largura à janela visível em jsdom.
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: VIEWPORT_WIDTH })
})

afterEach(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  cleanup()
})

function renderRail(count: number) {
  const items = Array.from({ length: count }, (_, i) => i)
  return render(
    <Rail
      items={items}
      itemWidth={ITEM_WIDTH}
      itemHeight={100}
      focusedIndex={0}
      renderItem={(item) => <div>{item}</div>}
    />,
  )
}

function scrollTo(container: HTMLElement, left: number) {
  const rail = container.querySelector<HTMLElement>('.rail')!
  rail.scrollLeft = left
  fireEvent.scroll(rail)
  return rail
}

describe('Rail', () => {
  it('sem itens, não renderiza nada', () => {
    const { container } = renderRail(0)
    expect(container.firstChild).toBeNull()
  })

  it('com 1 item, não mostra indicador de continuação', () => {
    const { container } = renderRail(1)
    expect(container.querySelector('.rail-position')).not.toBeInTheDocument()
  })

  it('aplica itemHeight como altura do trilho (sem ela o trilho colapsa a 0 — F-001)', () => {
    const { container } = render(
      <Rail items={['a', 'b']} itemWidth={100} itemHeight={180} focusedIndex={0} renderItem={(item) => <div>{item}</div>} />,
    )
    expect(container.querySelector<HTMLElement>('.rail')).toHaveStyle({ height: '180px' })
  })

  describe('fade de borda só onde há conteúdo além (F-003)', () => {
    it('com 1 item (cabe inteiro), nenhuma borda esmaece', () => {
      const { container } = renderRail(1)
      const rail = container.querySelector('.rail')!
      expect(rail).not.toHaveClass('rail--fade-start')
      expect(rail).not.toHaveClass('rail--fade-end')
    })

    it('no início, só a borda direita esmaece', () => {
      const { container } = renderRail(20)
      const rail = container.querySelector('.rail')!
      expect(rail).not.toHaveClass('rail--fade-start')
      expect(rail).toHaveClass('rail--fade-end')
    })

    it('no meio, as duas bordas esmaecem', () => {
      const { container } = renderRail(20)
      const rail = scrollTo(container, 3000)
      expect(rail).toHaveClass('rail--fade-start')
      expect(rail).toHaveClass('rail--fade-end')
    })

    it('no fim, só a borda esquerda esmaece', () => {
      const { container } = renderRail(20)
      const rail = scrollTo(container, 20 * ITEM_WIDTH - VIEWPORT_WIDTH)
      expect(rail).toHaveClass('rail--fade-start')
      expect(rail).not.toHaveClass('rail--fade-end')
    })
  })
})
