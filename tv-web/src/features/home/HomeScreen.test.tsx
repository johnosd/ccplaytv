import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeScreen } from './HomeScreen'
import * as importApi from '../import/importApi'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return {
    ...actual,
    useSources: vi.fn(),
    useDeleteSource: vi.fn(() => ({ mutate: vi.fn() })),
    useResyncSource: vi.fn(() => ({ mutate: vi.fn() })),
  }
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function renderHome() {
  const Wrapper = createWrapper()
  return render(
    <Wrapper>
      <HomeScreen
        onAddSource={() => {}}
        onOpenSource={() => {}}
        onResyncStarted={() => {}}
        onSourceCreated={() => {}}
      />
    </Wrapper>,
  )
}

describe('HomeScreen', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('mostra indicador de carregamento enquanto isLoading, nunca o formulário nem os cards', () => {
    vi.mocked(importApi.useSources).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof importApi.useSources>)

    renderHome()

    expect(screen.getByText(/Carregando/)).toBeInTheDocument()
    expect(screen.queryByText('Nome de exibição')).not.toBeInTheDocument()
    expect(screen.queryByText('Adicionar lista')).not.toBeInTheDocument()
  })

  it('mostra indicativo de erro quando a busca de fontes falha', () => {
    vi.mocked(importApi.useSources).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof importApi.useSources>)

    renderHome()

    expect(screen.getByText(/Não foi possível carregar suas listas/)).toBeInTheDocument()
  })

  it('sem nenhuma lista, renderiza o formulário de adicionar lista diretamente (FR-005)', () => {
    vi.mocked(importApi.useSources).mockReturnValue({
      data: { sources: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof importApi.useSources>)

    renderHome()

    expect(screen.getByText('Nome de exibição')).toBeInTheDocument()
  })

  it('Back na Home vazia abre a confirmação de saída, e Back de novo fecha o diálogo (FR-008)', () => {
    vi.mocked(importApi.useSources).mockReturnValue({
      data: { sources: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof importApi.useSources>)

    renderHome()

    expect(screen.queryByText('Sair do CCPlayTv?')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Backspace' })
    expect(screen.getByText('Sair do CCPlayTv?')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Backspace' })
    expect(screen.queryByText('Sair do CCPlayTv?')).not.toBeInTheDocument()
  })

  it('com listas cadastradas, renderiza um card por lista mais o card "Adicionar lista"', () => {
    vi.mocked(importApi.useSources).mockReturnValue({
      data: {
        sources: [
          {
            id: 'src-1',
            type: 'm3u_url',
            display_name: 'Minha Lista',
            connection_state: 'synced',
            last_successful_sync_at: new Date().toISOString(),
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof importApi.useSources>)

    renderHome()

    expect(screen.getByText('Minha Lista')).toBeInTheDocument()
    expect(screen.getByText('Adicionar lista')).toBeInTheDocument()
    expect(screen.queryByText('Nome de exibição')).not.toBeInTheDocument()
  })
})
