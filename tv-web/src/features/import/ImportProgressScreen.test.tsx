import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportProgressScreen } from './ImportProgressScreen'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function mockJobResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    source_id: 'source-1',
    status: 'running',
    current_step: 'classifying',
    counts: {
      entries_read: 100,
      channels: 10,
      movies: 20,
      series: 3,
      episodes: 30,
      unclassified: 5,
      invalid: 0,
    },
    warnings: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: null,
    ...overrides,
  }
}

describe('ImportProgressScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('nunca exibe percentual, mesmo com contadores parciais conhecidos (FR-007)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(mockJobResponse()), { status: 200 })),
    )

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByText(/Entradas lidas/)).toBeInTheDocument())
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('reabrir a tela consulta o estado real via GET, sem recriar a fonte/job (FR-012, SC-006)', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      new Response(
        JSON.stringify(mockJobResponse({ status: 'completed', current_step: 'done' })),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const firstMount = render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText(/Concluída/)).toBeInTheDocument())
    firstMount.unmount()

    // "Reabrir a tela" = montar de novo com um QueryClient novo — simula
    // sair e voltar sem depender de cache retido em memória.
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText(/Concluída/)).toBeInTheDocument())

    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(calledUrls.length).toBeGreaterThanOrEqual(2)
    expect(calledUrls.every((url) => url.includes('/import-jobs/'))).toBe(true)
    expect(calledUrls.some((url) => url.includes('/sources'))).toBe(false)
  })
})
