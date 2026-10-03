import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../lib/i18n/I18nProvider'
import { APP_LANGUAGE_STORAGE_KEY, resetAppLanguageForTests } from '../../lib/i18n/appLanguage'
import * as importApi from '../import/importApi'
import { SettingsScreen } from './SettingsScreen'

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

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nProvider>
    )
  }
  render(
    <SettingsScreen
      activeSourceId={null}
      onAddSource={vi.fn()}
      onEditSource={vi.fn()}
      onResyncStarted={vi.fn()}
      onSourceDeleted={vi.fn()}
      onBack={vi.fn()}
    />,
    { wrapper: Wrapper },
  )
}

/** Abas (integrations 0 → sources 1 → player 2 → accessibility 3); na aba, linha 1 = Idioma. */
function openLanguageRow() {
  press('ArrowDown', 2)
  press('ArrowRight')
  press('ArrowDown')
}

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
  vi.mocked(importApi.useSources).mockReturnValue({
    data: { sources: [] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof importApi.useSources>)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
  vi.clearAllMocks()
})

describe('Configurações — idioma do app (feature 054)', () => {
  it('a linha "Idioma" mostra o idioma vigente pelo nome nativo e é focável por controle remoto', () => {
    renderSettings()
    openLanguageRow()
    const row = screen.getByRole('button', { name: 'Idioma: Português' })
    expect(row).toHaveClass('tv-focus')
    expect(row).not.toHaveClass('is-soft-disabled')
  })

  it('RETURN no seletor fecha sem gravar; o foco volta à linha e o idioma não muda', () => {
    renderSettings()
    openLanguageRow()
    press('Enter')
    expect(screen.getByRole('dialog', { name: 'Idioma' })).toBeInTheDocument()
    press('ArrowDown')
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: 'Idioma: Português' })).toHaveClass('tv-focus')
  })

  it('espanhol e de volta ao português: abas, linhas e <html lang> acompanham, sem recarregar', () => {
    renderSettings()
    openLanguageRow()
    press('Enter')
    press('ArrowDown', 2) // Português → English → Español
    press('Enter')
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('es')
    expect(screen.getByText('Reducir movimiento')).toBeInTheDocument()
    expect(screen.getByText('Accesibilidad')).toBeInTheDocument() // aba traduzida
    expect(document.documentElement.lang).toBe('es-ES')

    press('Enter')
    press('ArrowUp', 2)
    press('Enter')
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('pt')
    expect(screen.getByText('Reduzir movimento')).toBeInTheDocument()
    expect(screen.getByText('Acessibilidade & sistema')).toBeInTheDocument()
  })

  it('em inglês, a aba Player & reprodução traduz linhas, valores e o seletor de idiomas de áudio', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    renderSettings()
    press('ArrowDown')
    press('ArrowRight') // aba Player
    expect(screen.getByRole('button', { name: 'Default aspect: Fit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Audio language: Content default' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subtitles: Off' })).toBeInTheDocument()
    press('ArrowDown', 2)
    press('Enter')
    expect(screen.getByRole('radio', { name: 'Portuguese' })).toBeInTheDocument()
  })
})
