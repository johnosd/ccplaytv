import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_LANGUAGE_STORAGE_KEY, resetAppLanguageForTests } from '../../lib/i18n/appLanguage'
import { createTranslator } from '../../lib/i18n/translate'
import { FavoritesEmptyState } from '../favorites/FavoritesState'
import { HistoryRemovalModal } from '../history/HistoryRemovalModal'
import { bannerFor } from '../import/connectionBanner'
import { sectionRows } from '../import/importSections'
import { formatCounts } from './sourceFormat'
import { LimitedModeNotice } from './LimitedModeNotice'

/** Feature 054, Fase 8: Fontes, Importação, Favoritos e Histórico em outros idiomas. */

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

describe('Fontes e importação em outros idiomas (feature 054)', () => {
  it('formatCounts: plural e texto por idioma, sem "0" para tipo ausente', () => {
    const counts = { channels: { categories: 41 }, movies: { categories: 20 }, series: { categories: 0 } }
    expect(formatCounts(counts, [], createTranslator('en'))).toBe('41 channel categories · 20 movie')
    expect(formatCounts(counts)).toBe('41 categorias de canais · 20 de filmes')
    expect(formatCounts({ channels: { items: 1, categories: 1 }, movies: { categories: 0 }, series: { categories: 0 } }, [], createTranslator('en'))).toMatch(/^1 channel$/)
  })

  it('sectionRows: rótulos de estado traduzidos, sem percentual inventado', () => {
    const rows = sectionRows({ channel: { state: 'ready', categories: 3 }, movie: { state: 'waiting' }, series: { state: 'failed' } }, createTranslator('en'))
    expect(rows.map((row) => row.label)).toEqual(['Channels', 'Movies', 'Series'])
    expect(rows[0].text).toMatch(/3 categories/)
    expect(rows.every((row) => !/%/.test(row.text))).toBe(true)
  })

  it('bannerFor: erro em espanhol vem do catálogo e nunca carrega URL ou credencial', () => {
    const banner = bannerFor('SRC-401', createTranslator('es'))
    expect(banner.title.length).toBeGreaterThan(0)
    expect(banner.title).not.toBe(bannerFor('SRC-401').title)
  })

  it('aviso do Modo limitado em inglês', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    render(<LimitedModeNotice reason="protocol_unavailable" discardedCount={2} />)
    expect(screen.getByRole('note').getAttribute('aria-label')).toBe(createTranslator('en')('limited.aria'))
    expect(screen.getByText(createTranslator('en').plural('limited.discarded', 2))).toBeTruthy()
  })

  it('favoritos vazio em inglês: texto traduzido e botão de saída focável', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    render(<FavoritesEmptyState kind="movie" focused onBack={vi.fn()} />)
    expect(screen.getByText('No favorites yet')).toBeTruthy()
    expect(screen.getByText(/on a movie/)).toBeTruthy()
    expect(document.querySelector('.tv-focus')).not.toBeNull()
  })

  it('remover do histórico em inglês: título, ações e "Cancelar" focado primeiro', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    render(<HistoryRemovalModal subject={{ kind: 'item', name: 'Filme A' }} hasProgress onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('Remove "Filme A" from history?')).toBeTruthy()
    expect(document.querySelector('.modal-actions .tv-focus')?.textContent).toBe('Cancel')
    expect(screen.getByText('Remove and erase progress')).toBeTruthy()
  })
})
