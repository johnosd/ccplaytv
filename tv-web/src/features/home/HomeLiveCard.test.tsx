import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomeLiveCard } from './HomeLiveCard'
import type { CatalogItemOut } from '../catalog/catalogApi'

/** Ícone de canal favorito do Início (ad-hoc 2026-10-09): logo — ou iniciais — e o nome; nada de EPG. */

const CHANNEL: CatalogItemOut = {
  id: '5',
  kind: 'channel',
  name: 'Globo HD',
  original_group: 'Abertos',
  published: true,
  playable: true,
  source_id: 'src-live',
  provider_stream_id: 'p5',
}

afterEach(cleanup)

describe('HomeLiveCard', () => {
  it('sem logo: mostra as iniciais como placeholder e o nome embaixo', () => {
    const { container } = render(<HomeLiveCard item={CHANNEL} focused={false} />)

    expect(container.querySelector('.poster-box-initials')?.textContent).toBe('GH')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.home-live-name')?.textContent).toBe('Globo HD')
  })

  it('com logo: desenha a imagem do canal', () => {
    const { container } = render(<HomeLiveCard item={{ ...CHANNEL, icon_url: 'http://logo/globo.png' }} focused={false} />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('http://logo/globo.png')
  })

  it('só o card focado leva tv-focus e a raiz carrega o id do item', () => {
    const { container, rerender } = render(<HomeLiveCard item={CHANNEL} focused={false} />)
    expect(container.querySelector('.tv-focus')).toBeNull()
    expect(container.querySelector('.home-live-card')?.getAttribute('data-item-id')).toBe('5')

    rerender(<HomeLiveCard item={CHANNEL} focused />)
    expect(container.querySelector('.home-live-card')).toHaveClass('tv-focus')
  })
})
