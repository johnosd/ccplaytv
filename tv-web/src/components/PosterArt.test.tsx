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

  describe('variant="logo" (feature 024, D-007 — logo de canal da Live TV)', () => {
    it('sem url, mostra as iniciais do título em vez do rótulo "pôster"', () => {
      render(<PosterArt title="Globo Esportes" variant="logo" />)
      expect(screen.getByText('GE')).toBeInTheDocument()
      expect(screen.queryByText('pôster', { exact: false })).not.toBeInTheDocument()
    })

    it('nome de uma palavra só usa as 3 primeiras letras, maiúsculas', () => {
      render(<PosterArt title="espn" variant="logo" />)
      expect(screen.getByText('ESP')).toBeInTheDocument()
    })

    it('três palavras ou mais: iniciais até 3 caracteres', () => {
      render(<PosterArt title="Rede Globo Interior Extra" variant="logo" />)
      expect(screen.getByText('RGI')).toBeInTheDocument()
    })

    it('com url válida, monta a <img> por cima igual à variante padrão', () => {
      const { container } = render(<PosterArt url="http://exemplo.test/logo.png" title="ESPN" variant="logo" />)
      expect(container.querySelector('img')).toHaveAttribute('src', 'http://exemplo.test/logo.png')
    })

    it('variant padrão (sem passar a prop) continua idêntica — rótulo "pôster" (contrato travado da 022, C5)', () => {
      render(<PosterArt title="Um Filme" />)
      expect(screen.getByText('pôster', { exact: false })).toBeInTheDocument()
    })
  })
})
