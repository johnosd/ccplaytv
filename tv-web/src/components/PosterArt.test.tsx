import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PosterArt } from './PosterArt'

describe('PosterArt', () => {
  afterEach(() => cleanup())

  it('sem url, nunca monta <img> — só o placeholder', () => {
    const { container } = render(<PosterArt title="Um Filme" />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText(/Um Filme/)).toBeInTheDocument()
  })

  it('com url, monta <img> com src, lazy e decoding assíncrono', () => {
    const { container } = render(<PosterArt url="http://exemplo.test/capa.png" title="Um Filme" />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'http://exemplo.test/capa.png')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
    // Decorativa de propósito: o título já é anunciado pelo label de texto
    // ao lado — alt="" evita que um leitor de tela o anuncie duas vezes.
    expect(img).toHaveAttribute('alt', '')
  })

  it('placeholder (textura + título) sempre presente no DOM, mesmo com capa carregando', () => {
    const { container } = render(<PosterArt url="http://exemplo.test/capa.png" title="Um Filme" />)
    expect(container.querySelector('.poster-box-noise')).toBeInTheDocument()
    expect(screen.getByText(/Um Filme/)).toBeInTheDocument()
  })

  it('falha ao carregar: a <img> some, o placeholder cobre o fallback, sem nova tentativa automática', () => {
    const { container } = render(<PosterArt url="http://exemplo.test/quebrada.png" title="Um Filme" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText(/Um Filme/)).toBeInTheDocument()
  })

  it('uma url nova depois de falha tenta carregar de novo', () => {
    const { container, rerender } = render(
      <PosterArt url="http://exemplo.test/quebrada.png" title="Um Filme" />,
    )
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).not.toBeInTheDocument()

    rerender(<PosterArt url="http://exemplo.test/nova.png" title="Um Filme" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'http://exemplo.test/nova.png')
  })

  it('aplica tv-focus quando focused, e renderiza overlay (children) por cima', () => {
    const { container } = render(
      <PosterArt title="Um Filme" focused>
        <span className="fav-star">★</span>
      </PosterArt>,
    )
    expect(container.querySelector('.poster-box.tv-focus')).toBeInTheDocument()
    expect(screen.getByText('★')).toBeInTheDocument()
  })
})
