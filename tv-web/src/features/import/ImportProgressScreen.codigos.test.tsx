import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ImportProgressScreen } from './ImportProgressScreen'
import { db, type ImportErrorKind, type ImportRunRecord } from '../../lib/catalog/db'
import { InvalidServerAddressError, normalizeServerAddress, ProviderIncompatibleError } from '../../lib/catalog/xtreamConnector'

/**
 * Feature 042, US4 (FR-016): os quatro erros da conexão de uma lista —
 * endereço inválido, falha de conexão, autenticação recusada e resposta
 * incompatível — têm mensagem e código próprios, nunca o erro cru.
 */

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function failedJob(errorKind: ImportErrorKind): ImportRunRecord {
  return {
    id: 'job-1',
    sourceId: 'source-1',
    generation: 1,
    status: 'failed',
    step: 'fetching',
    entriesRead: 0,
    channelsStored: 0,
    discardedByType: 0,
    invalidCount: 0,
    truncatedByStorage: false,
    startedAt: Date.now(),
    errorKind,
  }
}

async function showFailure(errorKind: ImportErrorKind) {
  await db.importRuns.put(failedJob(errorKind))
  render(
    <Wrapper>
      <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
    </Wrapper>,
  )
  await waitFor(() => expect(screen.getByTestId('import-error-code')).toBeInTheDocument())
  return { code: screen.getByTestId('import-error-code').textContent, text: screen.getByLabelText('Erro').textContent ?? '' }
}

afterEach(async () => {
  cleanup()
  await db.importRuns.clear()
})

describe('ImportProgressScreen — códigos de erro (feature 042)', () => {
  it('cada um dos quatro erros tem código e mensagem distintos', async () => {
    const seen = new Map<string, string>()
    for (const [kind, expectedCode] of [
      ['invalid_address', 'SRC-001'],
      ['network_failure', 'NET-02'],
      ['invalid_credentials', 'SRC-401'],
      ['invalid_playlist', 'SRC-422'],
    ] as const) {
      const { code, text } = await showFailure(kind)
      expect(code).toBe(expectedCode)
      seen.set(kind, text)
      cleanup()
      await db.importRuns.clear()
    }
    expect(new Set(seen.values()).size).toBe(4) // quatro mensagens diferentes
  })

  it('a mensagem nunca carrega URL nem credencial', async () => {
    const { text } = await showFailure('invalid_credentials')
    for (const secret of ['http', '@', 'senha:']) expect(text).not.toContain(secret)
  })
})

describe('normalizeServerAddress — endereço inválido (feature 042)', () => {
  it('lança InvalidServerAddressError, que continua sendo um ProviderIncompatibleError (o fallback M3U não muda)', () => {
    for (const bad of ['', 'http://', 'http://usuario:senha@exemplo.test']) {
      let thrown: unknown
      try {
        normalizeServerAddress(bad)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(InvalidServerAddressError)
      expect(thrown).toBeInstanceOf(ProviderIncompatibleError)
    }
  })
})
