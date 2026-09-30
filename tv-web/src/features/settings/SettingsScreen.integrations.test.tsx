import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen'
import * as importApi from '../import/importApi'
import { db } from '../../lib/catalog/db'
import { getTmdbStatus } from '../../lib/metadata/tmdbKeyRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'

/**
 * Feature 032, US2 — a aba real "Integrações & BYOK" dentro de Configurações
 * (foco por linhas/colunas, Testar/Editar/Remover, "Em breve", RETURN).
 */
vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return { ...actual, useSources: vi.fn(), useDeleteSource: vi.fn(), useResyncSource: vi.fn() }
})

const KEY = '0123456789abcdef0123456789abcdef'

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function press(key: string) {
  act(() => {
    fireEvent.keyDown(document.body, { key, bubbles: true })
  })
}

function renderSettings(overrides: Partial<SettingsScreenProps> = {}) {
  vi.mocked(importApi.useSources).mockReturnValue({ data: { sources: [] }, isLoading: false, isError: false } as unknown as ReturnType<
    typeof importApi.useSources
  >)
  vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof importApi.useDeleteSource>)
  vi.mocked(importApi.useResyncSource).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof importApi.useResyncSource>)
  const props: SettingsScreenProps = {
    activeSourceId: null,
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onSourceDeleted: vi.fn(),
    onOpenTmdbKey: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<SettingsScreen {...props} />, { wrapper: Wrapper })
  return props
}

/** Sai da coluna de abas (Fontes IPTV é a inicial) para "Integrações & BYOK" (a 1ª) e entra no painel. */
function enterIntegrations() {
  press('ArrowUp')
  press('ArrowRight')
}

async function seedKey(state: 'connected' | 'refused' = 'connected') {
  await db.integrations.put({ id: 'tmdb', key: KEY, format: 'v3', state, lastTestedAt: Date.UTC(2026, 8, 29, 12, 0, 0) })
}

beforeEach(async () => {
  await db.integrations.clear()
  await db.titleMetadata.clear()
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  await db.integrations.clear()
  await db.titleMetadata.clear()
})

describe('SettingsScreen › Integrações & BYOK (feature 032)', () => {
  it('sem chave: card TMDB "Não configurado" com atribuição e "Configurar" focado; OK abre a tela da chave com o foco de origem', async () => {
    const props = renderSettings()
    enterIntegrations()

    const card = screen.getByRole('region', { name: 'TMDB' })
    expect(within(card).getByText('Não configurado')).toBeInTheDocument()
    expect(within(card).getByText(/não é endossado nem certificado pelo TMDB/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Configurar' })).toHaveClass('tv-focus')
    expect(within(card).queryByRole('button', { name: 'Testar' })).not.toBeInTheDocument()

    press('Enter')
    expect(props.onOpenTmdbKey).toHaveBeenCalledWith({ zone: 'panel', tab: 'integrations' })
  })

  it('IA, Clima e Teste de velocidade aparecem soft disabled; OK anuncia "Em breve" e não faz mais nada', async () => {
    const props = renderSettings()
    enterIntegrations()

    for (const title of ['Assistente de IA', 'Clima', 'Teste de velocidade']) {
      const card = screen.getByRole('region', { name: title })
      expect(within(card).getByRole('button')).toHaveAttribute('aria-disabled', 'true')
    }
    press('ArrowDown') // 1º card "Em breve"
    expect(within(screen.getByRole('region', { name: 'Assistente de IA' })).getByRole('button')).toHaveClass('tv-focus')
    press('Enter')
    expect(await screen.findByText(/Em breve —/)).toBeInTheDocument()
    expect(props.onOpenTmdbKey).not.toHaveBeenCalled()
  })

  it('com chave: estado, chave só mascarada e ações Testar/Editar/Remover; a chave inteira nunca chega ao DOM', async () => {
    await seedKey()
    renderSettings()
    enterIntegrations()

    const card = await screen.findByRole('region', { name: 'TMDB' })
    await within(card).findByText('Conectado')
    expect(within(card).getByText(`••••${KEY.slice(-4)} (v3)`)).toBeInTheDocument()
    for (const name of ['Testar', 'Editar', 'Remover']) {
      expect(within(card).getByRole('button', { name })).toBeInTheDocument()
    }
    expect(document.body.innerHTML).not.toContain(KEY)
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('"Editar" abre a tela da chave; ←/→ percorrem as ações e ← na primeira volta às abas', async () => {
    await seedKey()
    const props = renderSettings()
    enterIntegrations()
    const card = await screen.findByRole('region', { name: 'TMDB' })
    await within(card).findByText('Conectado')

    press('ArrowRight') // Testar -> Editar
    expect(within(card).getByRole('button', { name: 'Editar' })).toHaveClass('tv-focus')
    press('Enter')
    expect(props.onOpenTmdbKey).toHaveBeenCalledWith({ zone: 'panel', tab: 'integrations' })

    press('ArrowLeft') // Editar -> Testar
    press('ArrowLeft') // Testar (coluna 0) -> abas
    expect(within(card).getByRole('button', { name: 'Testar' })).not.toHaveClass('tv-focus')
    expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Integrações & BYOK')
  })

  it('"Testar": mostra o resultado e atualiza o estado sem apagar a chave', async () => {
    await seedKey()
    vi.stubGlobal('fetch', vi.fn(async () => response(401)))
    renderSettings()
    enterIntegrations()
    const card = await screen.findByRole('region', { name: 'TMDB' })
    await within(card).findByText('Conectado')

    press('Enter') // Testar
    expect(await screen.findByText('Chave recusada pelo TMDB', { selector: '.toast, .toast *' })).toBeInTheDocument()
    await within(card).findByText('Chave recusada pelo TMDB', { selector: '.integration-card-state' })
    expect((await getTmdbStatus()).state).toBe('refused')
    expect(await db.integrations.get('tmdb')).toBeDefined()
  })

  it('"Remover": confirmação com Cancelar por padrão; cancelar mantém a chave, confirmar apaga e volta a "Não configurado"', async () => {
    await seedKey()
    await db.titleMetadata.put({
      stableId: 'a|movie|id:1',
      sourceId: 'a',
      kind: 'movie',
      provider: { synopsis: 'P' },
      tmdb: { status: 'no_match' },
      tmdbFetchedAt: 5,
    })
    renderSettings()
    enterIntegrations()
    const card = await screen.findByRole('region', { name: 'TMDB' })
    await within(card).findByText('Conectado')

    press('ArrowRight')
    press('ArrowRight') // Remover
    press('Enter')
    const modal = screen.getByRole('dialog', { name: 'Remover a chave do TMDB?' })
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')

    press('Enter') // Cancelar
    expect(screen.queryByRole('dialog', { name: 'Remover a chave do TMDB?' })).not.toBeInTheDocument()
    expect(await db.integrations.get('tmdb')).toBeDefined()

    press('Enter') // reabre (foco continua em Remover)
    press('ArrowRight') // -> "Remover" do modal
    press('Enter')
    await within(card).findByText('Não configurado')
    expect(await db.integrations.get('tmdb')).toBeUndefined()
    const row = await db.titleMetadata.get('a|movie|id:1')
    expect(row?.provider?.synopsis).toBe('P')
    expect(row?.tmdb).toBeUndefined()
    expect(within(card).getByRole('button', { name: 'Configurar' })).toHaveClass('tv-focus')
  })

  it('RETURN no modal de remoção fecha só o modal', async () => {
    await seedKey()
    const props = renderSettings()
    enterIntegrations()
    const card = await screen.findByRole('region', { name: 'TMDB' })
    await within(card).findByText('Conectado')
    press('ArrowRight')
    press('ArrowRight')
    press('Enter')
    press('Escape')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Remover a chave do TMDB?' })).not.toBeInTheDocument())
    expect(props.onBack).not.toHaveBeenCalled()
    expect(await db.integrations.get('tmdb')).toBeDefined()
  })
})
