import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Rail } from './Rail'

/**
 * Feature 060 (D-008): `focusedItemWidth` e `align` são opcionais — o item focado pode ser mais largo (card que expande no
 * Início) e, sem as props, o `Rail` é o de sempre (contrato da 022 fica intocado).
 */

let restoreOffsetWidth: PropertyDescriptor | undefined

beforeEach(() => {
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1600 })
})

afterEach(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
  cleanup()
})

const items = ['a', 'b', 'c', 'd']
const slots = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.rail-item')].map((item) => ({ left: item.style.transform, width: item.style.width }))

function rail(focusedIndex: number, extra: { focusedItemWidth?: number; align?: 'auto' | 'start' } = {}) {
  return (
    <Rail items={items} itemWidth={300} itemHeight={200} focusedIndex={focusedIndex} renderItem={(item) => <div>{item}</div>} {...extra} />
  )
}

describe('Rail — largura do item focado (feature 060)', () => {
  it('só o item focado ganha `focusedItemWidth` e os seguintes se deslocam sem sobreposição', () => {
    const { container } = render(rail(1, { focusedItemWidth: 700 }))
    expect(slots(container)).toEqual([
      { left: 'translateX(0px)', width: '300px' },
      { left: 'translateX(300px)', width: '700px' },
      { left: 'translateX(1000px)', width: '300px' },
      { left: 'translateX(1300px)', width: '300px' },
    ])
    expect(container.querySelector<HTMLElement>('.rail-inner')!.style.width).toBe(`${300 + 700 + 300 + 300}px`)
  })

  it('mudar o foco move a largura maior para o novo item, com as posições remedidas no mesmo ciclo', () => {
    const { container, rerender } = render(rail(0, { focusedItemWidth: 700 }))
    expect(slots(container)[1]).toEqual({ left: 'translateX(700px)', width: '300px' })

    rerender(rail(2, { focusedItemWidth: 700 }))
    expect(slots(container)).toEqual([
      { left: 'translateX(0px)', width: '300px' },
      { left: 'translateX(300px)', width: '300px' },
      { left: 'translateX(600px)', width: '700px' },
      { left: 'translateX(1300px)', width: '300px' },
    ])
  })

  it('sem `focusedItemWidth` todos os itens têm a mesma largura, qualquer que seja o foco (comportamento de sempre)', () => {
    const { container, rerender } = render(rail(0))
    const before = slots(container)
    rerender(rail(2, { align: 'start' }))
    expect(slots(container)).toEqual(before)
    expect(before.map((slot) => slot.width)).toEqual(['300px', '300px', '300px', '300px'])
  })

  it('`focusedItemWidth` que some devolve o item à largura normal', () => {
    const { container, rerender } = render(rail(1, { focusedItemWidth: 700 }))
    rerender(rail(1))
    expect(slots(container)[1]).toEqual({ left: 'translateX(300px)', width: '300px' })
  })
})
