import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Rail } from './Rail'

afterEach(cleanup)

describe('Rail', () => {
  it('sem itens, não renderiza nada', () => {
    const { container } = render(
      <Rail items={[]} itemWidth={100} focusedIndex={0} renderItem={(item) => <div>{String(item)}</div>} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('com 1 item, não mostra indicador de continuação', () => {
    const { container } = render(
      <Rail items={['a']} itemWidth={100} focusedIndex={0} renderItem={(item) => <div>{item}</div>} />,
    )
    expect(container.querySelector('.rail-position')).not.toBeInTheDocument()
  })
})
