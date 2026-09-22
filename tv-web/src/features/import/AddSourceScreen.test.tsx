import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddSourceScreen } from './AddSourceScreen'
import { db } from '../../lib/catalog/db'
import * as importPipeline from '../../lib/catalog/importPipeline'

vi.spyOn(globalThis, 'fetch')

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('AddSourceScreen', () => {
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.clear()
    await db.importRuns.clear()
  })

  it('cadastrar uma fonte de provedor dispara o pipeline local e n\u00e3o faz requisi\u00e7\u00e3o', async () => {
    const onSourceCreated = vi.fn()
    const onBack = vi.fn()
    
    const startImportSpy = vi.spyOn(importPipeline, 'startImport')

    render(
      <AddSourceScreen
        onSourceCreated={onSourceCreated}
        onBack={onBack}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('tab', { name: /Endereço, usuário e senha/i }))

    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), { target: { value: 'Meu Provedor' } })
    fireEvent.change(screen.getByLabelText(/Endereço do servidor/i), { target: { value: 'http://provedor.test' } })
    fireEvent.change(screen.getByLabelText(/Usuário/i), { target: { value: 'testuser' } })
    fireEvent.change(screen.getByLabelText(/Senha/i), { target: { value: 'testpass' } })

    fireEvent.click(screen.getByRole('button', { name: /Adicionar lista/i }))

    await waitFor(() => {
      expect(onSourceCreated).toHaveBeenCalled()
    })

    const fetchMock = globalThis.fetch as any
    const calledUrls = fetchMock.mock.calls.map((c: any) => c[0] as string)
    expect(calledUrls.some((url: string) => url.startsWith('/sources'))).toBe(false)
    expect(startImportSpy).toHaveBeenCalled()

    const sources = await db.sources.toArray()
    expect(sources.length).toBe(1)
    expect(sources[0].displayName).toBe('Meu Provedor')
  })
})
