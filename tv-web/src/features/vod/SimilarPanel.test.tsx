import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimilarPanel, type SimilarPanelProps } from './SimilarPanel'
import { findUnnamedControls } from '../../testing/accessibleNames'
import type { SimilarTabStatus } from '../../lib/metadata/types'

afterEach(cleanup)

function renderPanel(props: Partial<SimilarPanelProps>) {
  const onConfigure = vi.fn()
  const view = render(
    <SimilarPanel
      status="loading"
      titles={[]}
      kind="movie"
      configureFocused={false}
      onSelectTitle={() => {}}
      onConfigure={onConfigure}
      {...props}
    />,
  )
  return { ...view, onConfigure }
}

const TEXTS: Array<[Exclude<SimilarTabStatus, 'ready'>, RegExp]> = [
  ['loading', /Buscando títulos semelhantes/],
  ['no_key', /Semelhantes vêm do TMDB\. Configure uma chave do TMDB/],
  ['no_match', /Não foi possível identificar este título no TMDB/],
  ['empty', /O TMDB não tem títulos semelhantes a este\./],
  ['unavailable', /Semelhantes está indisponível agora\. Veja o estado do TMDB em Configurações › Integrações & BYOK\./],
]

describe('SimilarPanel', () => {
  it.each(TEXTS)('estado %s: mensagem própria e nenhum controle sem nome acessível', (status, text) => {
    const { container } = renderPanel({ status })
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(findUnnamedControls(container)).toEqual([])
  })

  it('só o estado sem chave tem botão; os demais deixam o foco na fileira de abas e nunca disparam toast', () => {
    for (const [status] of TEXTS) {
      cleanup()
      renderPanel({ status })
      expect(screen.queryAllByRole('button')).toHaveLength(status === 'no_key' ? 1 : 0)
    }
    cleanup()
    const { onConfigure } = renderPanel({ status: 'no_key', configureFocused: true })
    const button = screen.getByRole('button', { name: 'Configurar TMDB' })
    expect(button.className).toContain('tv-focus')
    button.click()
    expect(onConfigure).toHaveBeenCalledTimes(1)
  })

  it('empty mostra a cobertura; ready mostra o chip só nos não encontrados, com a atribuição do TMDB', () => {
    renderPanel({ status: 'empty', coverage: { covered: 1, total: 2 }, kind: 'series' })
    expect(screen.getByText('Procurado em 1 de 2 categorias de séries')).toBeInTheDocument()

    cleanup()
    const { container } = renderPanel({
      status: 'ready',
      coverage: { covered: 1, total: 2 },
      titles: [
        { key: 'tmdb:movie:1', tmdbId: 1, kind: 'movie', title: 'Achado', year: 2001, localItemId: '7' },
        { key: 'tmdb:movie:2', tmdbId: 2, kind: 'movie', title: 'Perdido', year: 2002 },
      ],
      focusedKey: 'tmdb:movie:2',
    })
    expect(screen.getAllByText('Não encontrado na sua lista')).toHaveLength(1)
    expect(screen.getByText('Dados: TMDB')).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(1)
  })

  // Feature 059 (D-007): duas linhas tituladas, cartões sem selo visível.
  it('ready separa "Na sua lista" e "Não encontrados na sua lista"; o selo do não encontrado é só nome acessível', () => {
    const achado = { key: 'tmdb:movie:1', tmdbId: 1, kind: 'movie' as const, title: 'Achado', year: 2001, localItemId: '7' }
    const perdido = { key: 'tmdb:movie:2', tmdbId: 2, kind: 'movie' as const, title: 'Perdido', year: 2002 }
    const { container } = renderPanel({ status: 'ready', titles: [achado, perdido] })
    const [inList, missing] = container.querySelectorAll('.similar-section')
    expect(screen.getByRole('heading', { name: 'Na sua lista' })).toBeInTheDocument()
    expect(inList?.textContent).toContain('Achado')
    expect(missing?.textContent).toContain('Perdido')
    expect(screen.getByText('Não encontrado na sua lista').className).toBe('sr-only')
    expect(container.querySelector('.similar-chip')).toBeNull()
  })

  it('sem nenhum na lista, a 1ª linha é uma frase não focável; sem nenhum fora, a 2ª linha não existe', () => {
    const perdido = { key: 'tmdb:movie:2', tmdbId: 2, kind: 'movie' as const, title: 'Perdido', year: 2002 }
    renderPanel({ status: 'ready', titles: [perdido] })
    const phrase = screen.getByText('Nenhum título semelhante está na sua lista.')
    expect(phrase.tagName).toBe('P')
    expect(phrase.className).not.toContain('tv-focus')
    expect(screen.getByRole('heading', { name: 'Não encontrados na sua lista' })).toBeInTheDocument()

    cleanup()
    const achado = { key: 'tmdb:movie:1', tmdbId: 1, kind: 'movie' as const, title: 'Achado', year: 2001, localItemId: '7' }
    renderPanel({ status: 'ready', titles: [achado] })
    expect(screen.queryByRole('heading', { name: 'Não encontrados na sua lista' })).not.toBeInTheDocument()
    expect(screen.queryByText('Nenhum título semelhante está na sua lista.')).not.toBeInTheDocument()
  })
})
