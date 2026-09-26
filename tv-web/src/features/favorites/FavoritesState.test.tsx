import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FavoriteHint, FavoritesEmptyState, FavoritesUnresolvedNote } from './FavoritesState'

describe('FavoritesEmptyState (feature 013)', () => {
  afterEach(() => cleanup())

  it('mostra o texto certo por tipo, citando os dois caminhos (segurar OK e tecla amarela)', () => {
    render(<FavoritesEmptyState kind="channel" focused onBack={() => {}} />)
    expect(
      screen.getByText('Segure OK ou aperte a tecla amarela sobre um canal para favoritar.'),
    ).toBeInTheDocument()

    cleanup()
    render(<FavoritesEmptyState kind="movie" focused onBack={() => {}} />)
    expect(
      screen.getByText('Segure OK ou aperte a tecla amarela sobre um filme para favoritar.'),
    ).toBeInTheDocument()

    cleanup()
    render(<FavoritesEmptyState kind="series" focused onBack={() => {}} />)
    expect(
      screen.getByText('Segure OK ou aperte a tecla amarela sobre uma série para favoritar.'),
    ).toBeInTheDocument()
  })

  it('aplica a classe de foco só quando `focused` é true — quem decide é a tela, não o componente', () => {
    const { rerender } = render(<FavoritesEmptyState kind="movie" focused={false} onBack={() => {}} />)
    expect(screen.getByRole('button', { name: 'Voltar' })).not.toHaveClass('tv-focus')

    rerender(<FavoritesEmptyState kind="movie" focused onBack={() => {}} />)
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('tv-focus')
  })

  it('o botão é sempre um elemento real, ativável (constitution — Foco Visível e Sem Becos Sem Saída)', () => {
    const onBack = vi.fn()
    render(<FavoritesEmptyState kind="movie" focused onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('FavoriteHint (feature 013)', () => {
  afterEach(() => cleanup())

  it('menciona os dois caminhos de favoritar', () => {
    render(<FavoriteHint />)
    expect(screen.getByText('Segure OK ou aperte a tecla amarela para favoritar')).toBeInTheDocument()
  })
})

describe('FavoritesUnresolvedNote (feature 013, FR-009)', () => {
  afterEach(() => cleanup())

  it('nada é renderizado quando não há favoritos pendentes', () => {
    const { container } = render(<FavoritesUnresolvedNote unresolved={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avisa que há favoritos ainda não carregados, sem citar um número', () => {
    render(<FavoritesUnresolvedNote unresolved={3} />)
    const note = screen.getByText(/ainda não apareceram aqui/)
    expect(note.textContent).not.toMatch(/\d/) // nunca um número — só o fato
  })
})
