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

  it('sem logoUrl, cai no placeholder do PosterArt', () => {
    render(<ChannelRow number="1" name="Canal Exemplo" />)
    expect(screen.getByText('pôster', { exact: false })).toBeInTheDocument()
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
})
