import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Skeleton } from './Skeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('aplica width/height recebidos no estilo inline', () => {
    const { container } = render(<Skeleton width={205} height={302} />)
    const el = container.firstChild as HTMLElement
    expect(el).toHaveStyle({ width: '205px', height: '302px' })
  })

  it('variant text usa a classe skeleton-text', () => {
    const { container } = render(<Skeleton width="80%" height={16} variant="text" />)
    expect(container.firstChild).toHaveClass('skeleton-text')
  })
})
