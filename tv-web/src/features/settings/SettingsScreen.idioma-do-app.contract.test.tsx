import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../lib/i18n/I18nProvider'
import { APP_LANGUAGE_STORAGE_KEY } from '../../lib/i18n/appLanguage'
import * as importApi from '../import/importApi'
import { SettingsScreen } from './SettingsScreen'

/**
 * Feature 054 — contrato de US1/AC1: escolher o idioma em Acessibilidade &
 * sistema troca os textos na hora, sem perder o foco, e persiste (FR-001..FR-003).
 * `sdd/specs/054-idioma-do-app/logic/idioma-do-app.md` §2.
 */

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

describe('SettingsScreen — idioma do app (feature 054)', () => {
  it('US1/AC1+AC2, FR-003: escolher English troca a interface na hora, o foco fica na linha do idioma e a escolha persiste', () => {
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

    // Abas: integrations(0) → sources(1) → player(2) → accessibility(3). Linhas: Reduzir movimento(0) → Idioma(1).
    press('ArrowDown', 2)
    press('ArrowRight')
    press('ArrowDown')
    expect(document.querySelector('.accessibility-panel .tv-focus')?.textContent).toContain('Idioma')

    press('Enter') // abre o seletor: Português, English, Español
    press('ArrowDown')
    press('Enter')

    expect(screen.getByText('Reduce motion')).toBeInTheDocument()
    expect(document.querySelector('.accessibility-panel .tv-focus')?.textContent).toContain('Language')
    expect(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('en')
  })
})
