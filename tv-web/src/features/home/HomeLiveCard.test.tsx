import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HomeLiveCard } from './HomeLiveCard'
import type { CatalogItemOut } from '../catalog/catalogApi'

/** Card de "Ao vivo agora" (feature 060, FR-012): programa e barra só com EPG; número só quando derivável. */

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
  it('com EPG: mostra o programa atual e a barra com o progresso real', () => {
    const now = { title: 'Jornal Nacional', start: Date.now() - 15 * 60_000, end: Date.now() + 45 * 60_000, progress: 0.25 }
    const { container } = render(<HomeLiveCard item={CHANNEL} number="012" now={now} focused={false} />)

    expect(container.querySelector('.home-live-program')?.textContent).toBe('Jornal Nacional')
    expect(container.querySelector<HTMLElement>('.home-live-bar i')?.style.width).toBe('25%')
    expect(container.querySelector('.home-live-number')?.textContent).toBe('012')
    expect(container.querySelector('.home-live-badge')?.textContent).toBe('AO VIVO')
  })

  it('sem EPG: nem programa nem barra; sem número derivável, nenhum número', () => {
    const { container } = render(<HomeLiveCard item={CHANNEL} focused={false} />)

    expect(container.querySelector('.home-live-program')).toBeNull()
    expect(container.querySelector('.home-live-bar')).toBeNull()
    expect(container.querySelector('.home-live-number')).toBeNull()
    expect(container.querySelector('.home-live-name')?.textContent).toBe('Globo HD')
  })

  it('só o card focado leva tv-focus e a raiz carrega o id do item', () => {
    const { container, rerender } = render(<HomeLiveCard item={CHANNEL} focused={false} />)
    expect(container.querySelector('.tv-focus')).toBeNull()
    expect(container.querySelector('.home-live-card')?.getAttribute('data-item-id')).toBe('5')

    rerender(<HomeLiveCard item={CHANNEL} focused />)
    expect(container.querySelector('.home-live-card')).toHaveClass('tv-focus')
  })
})
