import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfilesScreen, type ProfilesScreenProps } from './ProfilesScreen'
import * as importApi from '../import/importApi'
import type { SourceOut } from '../import/importApi'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return {
    ...actual,
    useSources: vi.fn(),
    useDeleteSource: vi.fn(),
    useResyncSource: vi.fn(() => ({ mutate: vi.fn() })),
  }
})

function makeSource(id: string, displayName: string): SourceOut {
  return {
    id,
    type: 'm3u_url',
    display_name: displayName,
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: null,
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
  }
}

const SALA = makeSource('sala', 'Sala')
const QUARTO = makeSource('quarto', 'Quarto')

function mockSources(value: Partial<ReturnType<typeof importApi.useSources>>) {
  vi.mocked(importApi.useSources).mockReturnValue(value as ReturnType<typeof importApi.useSources>)
}

function renderProfiles(overrides: Partial<ProfilesScreenProps> = {}) {
  const props: ProfilesScreenProps = {
    mode: 'base',
    onChooseSource: vi.fn(),
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
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

// Teclas em `document.body` (nunca em `document`): só assim a captura de um
// `Modal` roda antes da tela por trás — mesmo cuidado dos contratos da 022.
function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProfilesScreen — contrato da feature 023', () => {
  it('foco inicial na última lista usada, e OK nela escolhe essa lista (US1/AC1-AC2, FR-002, FR-004, FR-006)', () => {
    mockSources({ data: { sources: [SALA, QUARTO] }, isLoading: false, isError: false })
    vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof importApi.useDeleteSource>)

    const props = renderProfiles({ initialFocusSourceId: 'quarto' })

    expect(screen.getByRole('button', { name: /Quarto/ })).toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: /Sala/ })).not.toHaveClass('tv-focus')
    expect(screen.getByRole('button', { name: /Adicionar lista/ })).toBeInTheDocument()

    press('Enter')
    expect(props.onChooseSource).toHaveBeenCalledTimes(1)
    expect(props.onChooseSource).toHaveBeenCalledWith(QUARTO)
  })

  it('falha ao ler as listas mostra erro com código e "Tentar de novo" focado e ativável por OK (FR-008, Constitution: Foco Visível e Sem Becos Sem Saída)', () => {
    const refetch = vi.fn()
    mockSources({ data: undefined, isLoading: false, isError: true, refetch } as unknown as Partial<
      ReturnType<typeof importApi.useSources>
    >)
    vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof importApi.useDeleteSource>)

    renderProfiles()

    expect(screen.getByTestId('error-state-code')).toHaveTextContent(/\S/)
    const retry = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(retry).toHaveClass('tv-focus')

    press('Enter')
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('Excluir exige confirmação num modal com Cancelar em foco — OK duplo não apaga nada (US3/AC4-AC6, FR-010, SC-007)', () => {
    mockSources({ data: { sources: [SALA, QUARTO] }, isLoading: false, isError: false })
    const deleteMutate = vi.fn()
    vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate: deleteMutate } as unknown as ReturnType<
      typeof importApi.useDeleteSource
    >)

    renderProfiles({ initialFocusSourceId: 'sala' })

    // Cartão "Sala" → DOWN abre as ações (foco em Ressincronizar) → RIGHT, RIGHT = Excluir.
    press('ArrowDown')
    expect(screen.getByRole('button', { name: /Ressincronizar/ })).toHaveClass('tv-focus')
    press('ArrowRight')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: /Excluir/ })).toHaveClass('tv-focus')

    // OK duplo: o primeiro abre o modal, o segundo cai em Cancelar.
    press('Enter')
    const dialog = screen.getByRole('dialog', { name: 'Excluir a lista Sala?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    press('Enter')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteMutate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Excluir/ })).toHaveClass('tv-focus')

    // RETURN no modal também só fecha.
    press('Enter')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteMutate).not.toHaveBeenCalled()

    // Confirmação explícita apaga a lista certa.
    press('Enter')
    press('ArrowRight')
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' })).toHaveClass('tv-focus')
    press('Enter')
    expect(deleteMutate).toHaveBeenCalledTimes(1)
    expect(deleteMutate.mock.calls[0][0]).toBe('sala')
  })
})
