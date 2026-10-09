import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_LANGUAGE_STORAGE_KEY, resetAppLanguageForTests, writeAppLanguage } from '../../lib/i18n/appLanguage'
import { describeError, listErrorCodes } from '../../lib/errors/errorCatalog'
import { createTranslator } from '../../lib/i18n/translate'
import { formatAge, homeStatusLine } from '../home/homeStatusLine'
import { ExitModal } from './ExitModal'
import { TopBar } from './TopBar'

/** Feature 054, Fase 4: casca (topbar, saída), estados do Início e catálogo de erros em en/es. */

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
})

function renderTopBar() {
  return render(
    <TopBar
      sourceName="Minha Lista IPTV"
      active
      focusedItem="home"
      onFocusItem={vi.fn()}
      onExitDown={vi.fn()}
      onNavigate={vi.fn()}
      onOpenProfiles={vi.fn()}
      onOpenSearch={vi.fn()}
      onOpenSettings={vi.fn()}
      onBack={vi.fn()}
    />,
  )
}

describe('casca em outros idiomas (feature 054)', () => {
  it('topbar: destinos e configurações em inglês (sem a lupa, ad-hoc 2026-10-09); o nome da lista (do provedor) não muda', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    renderTopBar()
    for (const name of ['Home', 'Live TV', 'Movies', 'Series']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active list: Minha Lista IPTV. Switch list' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  })

  it('trocar o idioma com a topbar montada atualiza os rótulos sem remontar (mesmo nó)', () => {
    renderTopBar()
    const home = screen.getByRole('button', { name: 'Início' })
    act(() => {
      writeAppLanguage('es')
    })
    expect(screen.getByRole('button', { name: 'Inicio' })).toBe(home)
    expect(screen.getByRole('button', { name: 'Películas' })).toBeInTheDocument()
  })

  it('modal de saída: título, descrição e botões em espanhol, e continua focável por controle remoto', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'es')
    render(<ExitModal onCancel={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '¿Salir de CCPlayTV?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
  })

  it('catálogo de erros: todo código tem título, descrição e ação não vazios em pt, en e es (nunca interpola URL)', () => {
    for (const language of ['pt', 'en', 'es'] as const) {
      const t = createTranslator(language)
      for (const code of listErrorCodes()) {
        const description = describeError(code, t)
        expect(description.title, `${language}/${code}`).toBeTruthy()
        expect(description.description, `${language}/${code}`).toBeTruthy()
        expect(description.primaryAction, `${language}/${code}`).toBeTruthy()
        expect(`${description.title}${description.description}`).not.toMatch(/https?:\/\//)
      }
    }
    expect(describeError('NET-01', createTranslator('en')).title).toBe('No internet')
  })

  it('linha de estado do Início: idade e mensagens por idioma, com singular/plural de dias', () => {
    const DAY = 24 * 60 * 60 * 1000
    const en = createTranslator('en')
    const es = createTranslator('es')
    expect(formatAge(0, en)).toBe('just now')
    expect(formatAge(5 * 60 * 1000, en)).toBe('5 min ago')
    expect(formatAge(DAY, en)).toBe('1 day ago')
    expect(formatAge(3 * DAY, es)).toBe('hace 3 días')
    const progress = { sourceId: 'a', state: 'running', ready: 2, total: 5 } as Parameters<typeof homeStatusLine>[0]['progress']
    expect(homeStatusLine({ sourceId: 'a', updating: false, progress, lastSuccessfulSyncAt: null, now: 0 }, en)).toBe(
      'Preparing catalog — 2 of 5 categories',
    )
    const idle = { sourceId: 'a', state: 'idle', ready: 0, total: 0 } as Parameters<typeof homeStatusLine>[0]['progress']
    expect(homeStatusLine({ sourceId: 'a', updating: false, progress: idle, lastSuccessfulSyncAt: 0, now: 2 * DAY }, es)).toBe(
      'Catálogo actualizado hace 2 días',
    )
  })
})
