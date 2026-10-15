import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SeeAllCard } from './SeeAllCard'

describe('SeeAllCard', () => {
  it('desenha o rótulo, o foco de estado e a classe extra do chamador', () => {
    const { container, rerender } = render(<SeeAllCard label="Ver todos (3)" focused={false} />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toBe('home-see-all')
    expect(card.textContent).toBe('Ver todos (3)')

    rerender(<SeeAllCard label="Ver tudo" focused className="vod-see-all-card" />)
    const focused = container.firstElementChild as HTMLElement
    expect(focused.classList.contains('home-see-all')).toBe(true)
    expect(focused.classList.contains('vod-see-all-card')).toBe(true)
    expect(focused.classList.contains('tv-focus')).toBe(true)
  })
})
