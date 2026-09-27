import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { Rail } from './Rail'

const ITEM_WIDTH = 300
const VIEWPORT_WIDTH = 1200

let restoreOffsetWidth: PropertyDescriptor | undefined

beforeEach(() => {
  // Mesma técnica de `MoviesScreen.test.tsx` (feature 009) pra dar um
  // tamanho fixo ao contêiner de scroll em jsdom — `Rail` não mede via
  // `ResizeObserver` (D-008: `itemWidth` é prop fixa), só precisa saber a
  // largura da janela visível pra calcular quantos itens cabem.
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: VIEWPORT_WIDTH })
})

afterEach(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  cleanup()
})

function countMountedItems(container: HTMLElement): number {
  return container.querySelectorAll('[data-rail-item]').length
}

describe('022 — Rail virtualizado', () => {
  // US3/AC1-AC2 · FR-014 · SC-002
  it('com 500 itens nunca monta mais que a janela virtual + overscan, e rolar monta itens novos', () => {
    const items = Array.from({ length: 500 }, (_, i) => i)
    const { container } = render(
      <Rail
        items={items}
        itemWidth={ITEM_WIDTH}
        focusedIndex={0}
        renderItem={(item) => <div data-rail-item={item}>{`Item ${item}`}</div>}
      />,
    )

    const initialCount = countMountedItems(container)
    expect(initialCount).toBeGreaterThan(0)
    expect(initialCount).toBeLessThan(items.length)

    const scrollEl = container.querySelector<HTMLElement>('.rail')
    expect(scrollEl).not.toBeNull()
    const firstItemBefore = container.querySelector('[data-rail-item]')?.getAttribute('data-rail-item')

    scrollEl!.scrollLeft = 60000 // bem além da janela inicial
    fireEvent.scroll(scrollEl!)

    const firstItemAfter = container.querySelector('[data-rail-item]')?.getAttribute('data-rail-item')
    expect(firstItemAfter).not.toBe(firstItemBefore)
    expect(countMountedItems(container)).toBeGreaterThan(0)
    expect(countMountedItems(container)).toBeLessThan(items.length)
  })
})
