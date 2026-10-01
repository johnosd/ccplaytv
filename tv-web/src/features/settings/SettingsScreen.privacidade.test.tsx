/** Feature 036 (T027): aba Privacidade — contagens, linha vazia, limpeza em lote, sem lista ativa. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen'
import * as importApi from '../import/importApi'
import { db } from '../../lib/catalog/db'
import { getContinueWatching, listPlayed, updateProgress } from '../../lib/catalog/userStateRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return { ...actual, useSources: vi.fn() }
})

const SOURCE_ID = 'src-privacidade'

/**
 * Leituras do IndexedDB (resumo do Histórico, limpeza) podem passar de 1 s, o
 * padrão do `waitFor`, com a suíte inteira rodando em paralelo — achado ao
 * medir a linha de base da feature 040 (falhava só lá; isolado passava).
 */
const IDB_WAIT = { timeout: 5000 }

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function renderSettings(overrides: Partial<SettingsScreenProps> = {}) {
  const props: SettingsScreenProps = {
    activeSourceId: SOURCE_ID,
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

/** Abre em "Fontes IPTV" (2ª aba): ↓ até "Privacidade" (6ª) e → entra. */
function enterPrivacy() {
  for (let i = 0; i < 4; i += 1) press('ArrowDown')
  expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Privacidade')
  press('ArrowRight')
}

/** Linha pelo rótulo da FR-023: "Limpar histórico de Filmes/Séries" e "Limpar ambos". */
const row = (scope: 'Filmes' | 'Séries' | 'Filmes e Séries') =>
  screen.getByRole('button', {
    name: new RegExp(`^${scope === 'Filmes e Séries' ? 'Limpar ambos' : `Limpar histórico de ${scope}`} —`),
  })

beforeEach(async () => {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Sala',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
  vi.mocked(importApi.useSources).mockReturnValue({
    data: { sources: [{ id: SOURCE_ID, display_name: 'Sala' }] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof importApi.useSources>)
  await db.channels.add({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'Alfa', originalName: 'Alfa', groupOrder: 0, providerStreamId: 'a' })
  await updateProgress(`${SOURCE_ID}|movie|id:a`, SOURCE_ID, 120)
  // Filme que não está mais no catálogo: conta como indisponível (FR-025).
  await updateProgress(`${SOURCE_ID}|movie|id:sumiu`, SOURCE_ID, 30)
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('SettingsScreen › Privacidade (feature 036)', () => {
  it('contagens com indisponíveis; linha vazia soft disabled avisa sem abrir confirmação; todo controle tem nome', async () => {
    renderSettings()
    enterPrivacy()

    expect(screen.getByText('Histórico de Sala')).toBeInTheDocument()
    await waitFor(() => expect(row('Filmes')).toHaveAccessibleName('Limpar histórico de Filmes — 1 título · 1 indisponíveis'), IDB_WAIT)
    expect(row('Filmes')).toHaveClass('tv-focus')
    expect(row('Séries')).toHaveAttribute('aria-disabled', 'true')
    expect(row('Séries')).toHaveAccessibleName('Limpar histórico de Séries — histórico vazio')
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])

    press('ArrowDown')
    press('Enter')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('O histórico de Séries já está vazio.')).toBeInTheDocument()
  })

  it('limpar ambos com "apagar progresso": confirma, esvazia Histórico e Continuar, o foco fica na linha', async () => {
    renderSettings()
    enterPrivacy()
    await waitFor(() =>
      expect(row('Filmes e Séries')).toHaveAccessibleName('Limpar ambos — 1 título · 1 indisponíveis'),
      IDB_WAIT,
    )

    press('ArrowDown')
    press('ArrowDown')
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Limpar o histórico de Filmes e Séries?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1) // SC-004: a linha de trás não marca foco
    press('ArrowRight')
    press('ArrowRight')
    expect(within(dialog).getByRole('button', { name: 'Limpar e apagar progresso' })).toHaveClass('tv-focus')
    press('Enter')

    await waitFor(() => expect(screen.getByText('Histórico de Filmes e Séries limpo.')).toBeInTheDocument(), IDB_WAIT)
    expect(await listPlayed(SOURCE_ID, 'movie', db)).toEqual([])
    expect(await getContinueWatching(SOURCE_ID, db)).toEqual([])
    await waitFor(() => expect(row('Filmes e Séries')).toHaveAttribute('aria-disabled', 'true'), IDB_WAIT)
    expect(row('Filmes e Séries')).toHaveClass('tv-focus')
  })

  it('sem lista ativa: explica e "Voltar às abas" é focável e devolve o foco às abas (FR-027)', () => {
    renderSettings({ activeSourceId: null })
    enterPrivacy()

    expect(screen.getByText(/O histórico é guardado por lista/)).toBeInTheDocument()
    const back = screen.getByRole('button', { name: 'Voltar às abas' })
    expect(back).toHaveClass('tv-focus')
    press('Enter')
    expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Privacidade')
  })
})
