import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportProgressScreen } from './ImportProgressScreen'
import { db, type ImportRunRecord } from '../../lib/catalog/db'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function mockJobRecord(overrides: Partial<ImportRunRecord> = {}): ImportRunRecord {
  return {
    id: 'job-1',
    sourceId: 'source-1',
    generation: 1,
    status: 'running',
    step: 'parsing',
    entriesRead: 100,
    channelsStored: 10,
    discardedByType: 80,
    invalidCount: 10,
    truncatedByStorage: false,
    startedAt: Date.now(),
    ...overrides,
  }
}

describe('ImportProgressScreen', () => {
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.importRuns.clear()
  })

  it('nunca exibe percentual, mesmo com contadores parciais conhecidos (FR-007)', async () => {
    await db.importRuns.put(mockJobRecord())

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByText(/Entradas lidas/)).toBeInTheDocument())
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('a tela declara explicitamente que só canais foram importados (FR-008)', async () => {
    await db.importRuns.put(mockJobRecord({ discardedByType: 50 }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Só canais foram importados nesta fonte.')).toBeInTheDocument()
      expect(screen.getByText(/Descartados \(não são canais\): 50/)).toBeInTheDocument()
    })
  })

  it('quando houver truncamento, a tela declara que a lista não coube inteira (FR-018)', async () => {
    await db.importRuns.put(mockJobRecord({ truncatedByStorage: true }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('A lista não coube inteira no aparelho.')).toBeInTheDocument()
    })
  })

  it('exibe o estado de recusa com texto próprio e garante elemento focável (T044/US5)', async () => {
    await db.importRuns.put(mockJobRecord({ status: 'failed', errorKind: 'direct_connection_refused' }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('O provedor não aceita conexão direta por este aplicativo. Requer uso do servidor.')).toBeInTheDocument()
    })

    const retryBtn = screen.getByRole('button', { name: 'Tentar novamente' })
    const backBtn = screen.getByRole('button', { name: 'Voltar' })

    expect(retryBtn).toBeInTheDocument()
    expect(backBtn).toBeInTheDocument()
  })
})
