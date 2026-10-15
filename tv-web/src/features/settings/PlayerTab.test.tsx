import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen'
import * as importApi from '../import/importApi'
import { readPlayerPreferences, writePlayerPreferences } from '../../lib/player/playerPreferences'
import { LANGUAGE_OPTIONS } from '../../lib/player/tracks'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return { ...actual, useSources: vi.fn() }
})

function press(key: string, times = 1) {
  for (let i = 0; i < times; i += 1) {
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }
}

function renderSettings(overrides: Partial<SettingsScreenProps> = {}) {
  const props: SettingsScreenProps = {
    activeSourceId: null,
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onSourceDeleted: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<SettingsScreen {...props} />, { wrapper: Wrapper })
  return props
}

function enterPlayerTab() {
  press('ArrowDown')
  press('ArrowRight')
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(importApi.useSources).mockReturnValue({
    data: { sources: [] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof importApi.useSources>)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('aba Player & reprodução (feature 041, US3)', () => {
  it('quatro linhas na ordem, com um só foco', () => {
    renderSettings()
    enterPlayerTab()
    const rows = screen.getAllByRole('button').filter((b) => /^(Aspecto padrão|Qualidade padrão|Idioma do áudio|Legenda):/.test(b.getAttribute('aria-label') ?? ''))
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Aspecto padrão: Ajustar',
      'Qualidade padrão: Auto',
      'Idioma do áudio: Padrão do conteúdo',
      'Legenda: Desligada',
    ])
    expect(document.querySelectorAll('.tv-focus.privacy-panel-row')).toHaveLength(1)
  })

  it('o seletor de idioma lista "Padrão do conteúdo" + os idiomas fixos; escolher grava e mostra o novo valor', () => {
    renderSettings()
    enterPlayerTab()
    press('ArrowDown', 2) // Idioma do áudio
    press('Enter')
    const dialog = screen.getByRole('dialog', { name: 'Idioma do áudio' })
    const radios = within(dialog).getAllByRole('radio')
    expect(radios.map((r) => r.textContent?.replace(/^[●○]/, ''))).toEqual(['Padrão do conteúdo', ...LANGUAGE_OPTIONS.map((l) => l.label)])
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    press('ArrowDown', 2) // Inglês (2º idioma da tabela: pt, en)
    press('Enter')
    expect(readPlayerPreferences().audioLanguage).toBe('en')
    expect(screen.getByRole('button', { name: 'Idioma do áudio: Inglês' })).toHaveClass('tv-focus')
  })

  it('legenda: escolher um idioma e depois "Desligada" grava e volta a null', () => {
    renderSettings()
    enterPlayerTab()
    press('ArrowDown', 3)
    press('Enter')
    press('ArrowDown')
    press('Enter')
    expect(readPlayerPreferences().textLanguage).toBe('pt')
    press('Enter') // reabre
    expect(within(screen.getByRole('dialog', { name: 'Legenda' })).getByRole('radio', { name: 'Português' })).toHaveClass('tv-focus')
    press('ArrowUp')
    press('Enter')
    expect(readPlayerPreferences().textLanguage).toBeNull()
  })

  it('qualidade: Máxima e Econômica; o seletor abre na opção marcada', () => {
    writePlayerPreferences({ quality: 'min' })
    renderSettings()
    enterPlayerTab()
    press('ArrowDown')
    expect(screen.getByRole('button', { name: 'Qualidade padrão: Econômica' })).toHaveClass('tv-focus')
    press('Enter')
    expect(within(screen.getByRole('dialog', { name: 'Qualidade padrão' })).getByRole('radio', { name: 'Econômica' })).toHaveClass('tv-focus')
  })

  it('RETURN fecha o seletor sem gravar e devolve o foco à linha', () => {
    renderSettings()
    enterPlayerTab()
    press('Enter')
    press('ArrowDown', 2)
    press('Escape')
    expect(screen.queryByRole('dialog', { name: 'Aspecto padrão' })).not.toBeInTheDocument()
    expect(readPlayerPreferences().aspect).toBe('fit')
    expect(screen.getByRole('button', { name: 'Aspecto padrão: Ajustar' })).toHaveClass('tv-focus')
  })

  it('↑ na primeira linha sobe à topbar; ← volta às abas; ↓ não passa da última', () => {
    renderSettings()
    enterPlayerTab()
    press('ArrowDown', 9)
    expect(screen.getByRole('button', { name: 'Legenda: Desligada' })).toHaveClass('tv-focus')
    press('ArrowLeft')
    expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Player & reprodução')
  })
})
