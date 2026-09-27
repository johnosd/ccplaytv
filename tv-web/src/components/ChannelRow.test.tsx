import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ChannelRow } from './ChannelRow'

afterEach(cleanup)

describe('ChannelRow', () => {
  it('sem nowPlaying, o slot existe vazio no DOM (não desaparece)', () => {
    const { container } = render(<ChannelRow number="1" name="Canal Exemplo" />)
    const now = container.querySelector('.channel-row-now')
    expect(now).not.toBeNull()
    expect(now).toHaveTextContent('')
  })

  it('sem logoUrl, cai no placeholder de iniciais do PosterArt (variante logo, feature 024)', () => {
    render(<ChannelRow number="1" name="Canal Exemplo" />)
    expect(screen.getByText('CE')).toBeInTheDocument()
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('sem progress, não desenha a barra', () => {
    const { container } = render(<ChannelRow number="1" name="Canal Exemplo" />)
    expect(container.querySelector('.channel-row-progress')).not.toBeInTheDocument()
  })

  it('com progress, desenha a barra', () => {
    const { container } = render(<ChannelRow number="1" name="Canal Exemplo" progress={0.5} />)
    expect(container.querySelector('.channel-row-progress')).toBeInTheDocument()
  })

  // Feature 024, D-007/FR-009/FR-019.
  it('sem number, nenhuma coluna de número é desenhada (nunca um número inventado)', () => {
    const { container } = render(<ChannelRow name="Canal Exemplo" />)
    expect(container.querySelector('.channel-row-number')).not.toBeInTheDocument()
  })

  it('nameClassName soma à classe do nome, sem substituí-la (D-008 — .live-item-name da feature 018)', () => {
    const { container } = render(<ChannelRow name="Canal Exemplo" nameClassName="live-item-name" />)
    const nameEl = container.querySelector('.channel-row-name')
    expect(nameEl).toHaveClass('channel-row-name', 'live-item-name')
  })

  it('favorite desenha a estrela; sem ele, nada', () => {
    const { container, rerender } = render(<ChannelRow name="Canal Exemplo" />)
    expect(container.querySelector('.fav-star')).not.toBeInTheDocument()
    rerender(<ChannelRow name="Canal Exemplo" favorite />)
    expect(container.querySelector('.fav-star')).toBeInTheDocument()
  })

  it('unavailable desenha o selo "Indisponível" e marca a linha como soft disabled', () => {
    const { container } = render(<ChannelRow name="Canal Exemplo" unavailable />)
    expect(screen.getByText('Indisponível')).toBeInTheDocument()
    expect(container.querySelector('.channel-row')).toHaveClass('is-soft-disabled')
  })
})
