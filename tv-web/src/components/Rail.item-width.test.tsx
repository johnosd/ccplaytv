import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Rail } from './Rail'

/**
 * Bug "Continue assistindo sobreposto na 1ª abertura": a fileira abre com pôster alto (item de 324 px) e vira card largo
 * (item de 424 px) quando os fundos chegam. O `Rail` guardava as posições com a largura antiga e os cards de 424 px ficavam
 * a 324 px um do outro — sobrepostos — até uma rolagem remedir.
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
const offsets = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.rail-item')].map((item) => ({ left: item.style.transform, width: item.style.width }))

function railWith(itemWidth: number) {
  return <Rail items={items} itemWidth={itemWidth} itemHeight={240} focusedIndex={0} renderItem={(item) => <div>{item}</div>} />
}

describe('Rail — mudança de largura do item', () => {
  it('ao mudar `itemWidth` os itens são reposicionados com a nova largura, sem sobreposição', () => {
    const { container, rerender } = render(railWith(324))
    expect(offsets(container).slice(0, 3)).toEqual([
      { left: 'translateX(0px)', width: '324px' },
      { left: 'translateX(324px)', width: '324px' },
      { left: 'translateX(648px)', width: '324px' },
    ])

    rerender(railWith(424))
    expect(offsets(container).slice(0, 3)).toEqual([
      { left: 'translateX(0px)', width: '424px' },
      { left: 'translateX(424px)', width: '424px' },
      { left: 'translateX(848px)', width: '424px' },
    ])
    expect(container.querySelector<HTMLElement>('.rail-inner')!.style.width).toBe(`${4 * 424}px`)
  })

  it('voltar à largura anterior também reposiciona', () => {
    const { container, rerender } = render(railWith(424))
    rerender(railWith(324))
    expect(offsets(container)[1]).toEqual({ left: 'translateX(324px)', width: '324px' })
  })
})
