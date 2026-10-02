/**
 * Contrato da feature 041 — aba real "Player & reprodução" em Configurações
 * (`plan.md` D-008/D-009, `logic/aspecto-qualidade.md` §4).
 *
 * Fixado por este contrato: a aba é a 3ª (logo abaixo de "Fontes IPTV"), as
 * quatro linhas com nome acessível "<preferência>: <valor>", os valores de
 * fábrica, o seletor de cada linha como diálogo com o nome da preferência e
 * opções em `radio`, e a gravação em `playerPreferences` (do aparelho).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen'
import * as importApi from '../import/importApi'
import { readPlayerPreferences } from '../../lib/player/playerPreferences'
import { findUnnamedControls } from '../../testing/accessibleNames'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return { ...actual, useSources: vi.fn() }
})

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
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
}

/** Abre em "Fontes IPTV" (2ª aba): ↓ até "Player & reprodução" (3ª) e → entra. */
function enterPlayerTab() {
  press('ArrowDown')
  expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Player & reprodução')
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

describe('SettingsScreen › Player & reprodução (feature 041)', () => {
  // US3/AC1-5; FR-010, FR-011, FR-015, FR-016: quatro preferências reais, sem lista ativa, gravadas no aparelho e relidas numa montagem nova.
  it('sem lista ativa: mostra os valores de fábrica; escolher "Preencher" grava a preferência do aparelho, devolve o foco à linha e sobrevive a uma montagem nova', () => {
    renderSettings()
    enterPlayerTab()

    const aspect = screen.getByRole('button', { name: 'Aspecto padrão: Ajustar' })
    expect(aspect).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: 'Qualidade padrão: Auto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Idioma do áudio: Padrão do conteúdo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Legenda: Desligada' })).toBeInTheDocument()
    expect(screen.queryByText(/^Em breve/)).not.toBeInTheDocument()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])

    press('Enter')
    const dialog = screen.getByRole('dialog', { name: 'Aspecto padrão' })
    const fit = within(dialog).getByRole('radio', { name: 'Ajustar' })
    expect(fit).toHaveAttribute('aria-checked', 'true')
    expect(fit).toHaveClass('tv-focus')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
    press('ArrowDown')
    press('Enter')

    expect(screen.queryByRole('dialog', { name: 'Aspecto padrão' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aspecto padrão: Preencher' })).toHaveClass('tv-focus')
    expect(readPlayerPreferences().aspect).toBe('fill')

    cleanup()
    renderSettings()
    enterPlayerTab()
    expect(screen.getByRole('button', { name: 'Aspecto padrão: Preencher' })).toHaveClass('tv-focus')
  })
})
