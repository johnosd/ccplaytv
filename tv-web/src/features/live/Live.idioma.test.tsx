import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_LANGUAGE_STORAGE_KEY, resetAppLanguageForTests } from '../../lib/i18n/appLanguage'
import { createTranslator } from '../../lib/i18n/translate'
import * as catalogApi from '../catalog/catalogApi'
import { UNGROUPED_LABEL } from './groupChannels'
import { LiveScreen } from './LiveScreen'
import { liveGroupDisplay, liveHints } from './liveTrail'

/** Feature 054, Fase 5: TV ao vivo em outros idiomas — textos do app mudam, nomes do provedor não. */

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    fetchPlayback: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

beforeEach(() => {
  window.localStorage.clear()
  resetAppLanguageForTests()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppLanguageForTests()
  vi.clearAllMocks()
})

function renderLive(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<LiveScreen sourceId="s1" onBack={vi.fn()} onResync={vi.fn()} onEditSource={vi.fn()} />, { wrapper: Wrapper })
}

describe('TV ao vivo em outros idiomas (feature 054)', () => {
  it('liveGroupDisplay: o rótulo "Sem categoria" do app é traduzido; nome declarado pelo provedor, jamais', () => {
    const en = createTranslator('en')
    expect(liveGroupDisplay(undefined, en)).toBe('Uncategorized')
    expect(liveGroupDisplay('  ', createTranslator('es'))).toBe('Sin categoría')
    expect(liveGroupDisplay('Canais | Esportes', en)).toBe('Esportes') // só o prefixo redundante cai; o nome do provedor fica
    expect(liveGroupDisplay('Notícias', en)).toBe('Notícias')
    expect(liveGroupDisplay(undefined)).toBe(UNGROUPED_LABEL) // sem `t`: português, como sempre
  })

  it('dicas da barra de teclas por idioma', () => {
    expect(liveHints(createTranslator('en')).map((hint) => `${hint.keyLabel}: ${hint.action}`)).toEqual([
      'OK: Enter / Watch',
      '← →: Page',
      'Hold OK: Favorite',
      'RETURN: Back',
    ])
    expect(liveHints(createTranslator('pt'))[2]).toEqual({ keyLabel: 'Segurar OK', action: 'Favoritar' })
  })

  it('lista sem canais em inglês: mensagem do app traduzida e saída focável (constituição: sem beco)', () => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, 'en')
    vi.mocked(catalogApi.useCategoryList).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
    const idle = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue(idle as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({
      items: [],
      coveredCategories: 0,
      totalCategories: 0,
      isLoading: false,
    } as unknown as ReturnType<typeof catalogApi.useAggregatedItems>)
    renderLive()
    expect(screen.getByText('No channels in this list')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('tv-focus')
  })
})
