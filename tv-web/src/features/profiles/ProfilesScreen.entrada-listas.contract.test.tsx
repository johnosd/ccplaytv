import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADD_LIST_FOCUS_ID, ProfilesScreen, type ProfilesScreenProps } from './ProfilesScreen'
import * as importApi from '../import/importApi'
import type { SourceOut } from '../import/importApi'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return {
    ...actual,
    useSources: vi.fn(),
    useDeleteSource: vi.fn(() => ({ mutate: vi.fn() })),
    useResyncSource: vi.fn(() => ({ mutate: vi.fn() })),
  }
})

function makeSource(id: string, displayName: string, overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id,
    type: 'm3u_url',
    display_name: displayName,
    connection_state: 'synced',
    last_successful_sync_at: '2026-09-28T11:17:40.000Z',
    provider_import_mode: null,
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

const SALA = makeSource('sala', 'Sala')
const QUARTO = makeSource('quarto', 'Quarto', {
  type: 'provider_credentials',
  provider_import_mode: 'legacy_m3u',
  provider_dns: 'http://painel.exemplo:8080',
})

function renderProfiles(sources: SourceOut[], overrides: Partial<ProfilesScreenProps> = {}) {
  vi.mocked(importApi.useSources).mockReturnValue({
    data: { sources },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof importApi.useSources>)
  const props: ProfilesScreenProps = {
    mode: 'base',
    onChooseSource: vi.fn(),
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onManageSources: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<ProfilesScreen {...props} />, { wrapper: Wrapper })
  return props
}

// Teclas em `document.body`, como nos contratos da 023.
function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProfilesScreen — contrato da feature 037', () => {
  // US1/AC1, US1/AC4, FR-003, FR-005, FR-006, FR-007, FR-024
  it('tela de listas no formato do protótipo: textos, cartão com iniciais + selo do tipo + avisos, sem data nem endereço, e "Adicionar lista" como botão', () => {
    renderProfiles([SALA, QUARTO], { initialFocusSourceId: 'sala' })

    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toMatch(/Selecione ou Adicione\s*sua lista/)
    expect(screen.getByText('Bem-vindo de volta')).toBeInTheDocument()
    expect(screen.getByText('Escolha uma lista para continuar ou adicione uma nova.')).toBeInTheDocument()
    expect(screen.getByText('Cada lista mantém seu próprio histórico, favoritos e recomendações.')).toBeInTheDocument()

    const sala = screen.getByRole('button', { name: /Sala/ })
    expect(within(sala).getByText('SA')).toBeInTheDocument()
    expect(within(sala).getByText(/^m3u$/i)).toBeInTheDocument()

    const quarto = screen.getByRole('button', { name: /Quarto/ })
    expect(within(quarto).getByText('QU')).toBeInTheDocument()
    expect(within(quarto).getByText(/^xtream$/i)).toBeInTheDocument()
    expect(within(quarto).getByText('Modo limitado')).toBeInTheDocument()

    // A data de sincronização sai do cartão; endereço/credencial nunca aparecem.
    expect(screen.queryByText(/Sincronizada em/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('painel.exemplo')

    expect(screen.getByRole('button', { name: 'Adicionar lista' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gerenciar listas' })).not.toBeInTheDocument()
  })

  // FR-008, FR-019 (foco de volta em "Adicionar lista"), Constitution: Voltar Restaura Foco e Posição
  it('foco inicial pedido em "Adicionar lista" vale mesmo com listas; ↓ leva a "Configurações", OK abre, ↑ devolve o foco', () => {
    const props = renderProfiles([SALA, QUARTO], { initialFocusSourceId: ADD_LIST_FOCUS_ID })

    const add = screen.getByRole('button', { name: 'Adicionar lista' })
    expect(add).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: /Sala/ })).not.toHaveClass('tv-focus')

    press('ArrowDown')
    const settings = screen.getByRole('button', { name: /Configurações/ })
    expect(settings).toHaveClass('tv-focus')
    expect(add).not.toHaveClass('tv-focus')

    press('Enter')
    expect(props.onManageSources).toHaveBeenCalledTimes(1)
    expect(props.onChooseSource).not.toHaveBeenCalled()

    press('ArrowUp')
    expect(screen.getByRole('button', { name: 'Adicionar lista' })).toHaveClass('tv-focus')
  })
})
