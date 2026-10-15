import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ContentCard } from './ContentCard'

afterEach(cleanup)

describe('ContentCard — formatos da feature 053', () => {
  it('rank renderiza o número decorativo (aria-hidden) e marca o card; wide mantém a variante', () => {
    const { container } = render(<ContentCard variant="portrait" title="Filme" rank={3} />)
    const rank = container.querySelector('.content-card-rank')
    expect(rank?.textContent).toBe('3')
    expect(rank?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.content-card--ranked')).not.toBeNull()
    cleanup()
    const wide = render(<ContentCard variant="wide" title="Filme" />)
    expect(wide.container.querySelector('.content-card--wide')).not.toBeNull()
  })

  it('sem rank o card é idêntico ao de antes (sem classe nem número)', () => {
    const { container } = render(<ContentCard variant="portrait" title="Filme" />)
    expect(container.querySelector('.content-card')?.className).toBe('content-card content-card--portrait')
    expect(container.querySelector('.content-card-rank')).toBeNull()
  })
})
