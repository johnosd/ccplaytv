import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ImportProgressScreen } from './ImportProgressScreen'
import { db, type ImportRunRecord, type SourceRecord } from '../../lib/catalog/db'

const STARTED = Date.now() - 10_000

const SOURCE: SourceRecord = {
  id: 'source-1',
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://exemplo.test',
  providerUsername: 'usuario-teste',
  providerPassword: 'senha-teste',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

function run(overrides: Partial<ImportRunRecord> = {}): ImportRunRecord {
  return {
    id: 'job-1',
    sourceId: 'source-1',
    generation: 1,
    status: 'completed',
    step: 'done',
    unit: 'categories',
    entriesRead: 71,
    channelsStored: 71,
    discardedByType: 0,
    invalidCount: 0,
    truncatedByStorage: false,
    startedAt: STARTED,
    finishedAt: STARTED + 2000,
    sections: {
      channel: { state: 'ready', categories: 41 },
      movie: { state: 'ready', categories: 30 },
      series: { state: 'unavailable' },
    },
    ...overrides,
  }
}

function renderScreen(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
    </QueryClientProvider>,
  )
}

afterEach(async () => {
  cleanup()
  await db.importRuns.clear()
  await db.sources.clear()
})

describe('ImportProgressScreen — linhas por parte (feature 038, US3)', () => {
  it('quatro linhas com estado e contagem reais; "Abrir lista" disponível antes do guia, e o foco vai para ele quando o guia resolve', async () => {
    await db.sources.put(SOURCE) // painel Xtream: guia configurado, ainda não sincronizado
    await db.importRuns.put(run())
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderScreen(queryClient)

    const list = await screen.findByRole('list', { name: 'O que está sendo carregado' })
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual([
      'CanaisPronto — 41 categorias',
      'FilmesPronto — 30 categorias',
      'SériesNão disponível nesta lista',
      'GuiaCarregando',
    ])
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()

    // "Abrir lista" já existe (a estrutura terminou). A pessoa está em "Voltar":
    // o foco não é arrancado dali enquanto o guia não se resolve.
    await screen.findByRole('button', { name: 'Abrir lista' })
    const back = screen.getByRole('button', { name: 'Voltar' })
    act(() => back.focus())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(back).toHaveFocus()
    expect(screen.queryByText(/continuam chegando em segundo plano/)).not.toBeInTheDocument()

    // O guia sincroniza depois desta importação (a raiz invalida `['sources']`).
    await db.sources.update('source-1', { epgLastSyncAt: STARTED + 5000 })
    await act(() => queryClient.invalidateQueries({ queryKey: ['sources'] }))

    await waitFor(() => expect(within(list).getAllByRole('listitem')[3]).toHaveTextContent('GuiaPronto'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir lista' })).toHaveFocus())
    expect(screen.getByText('Os itens de cada categoria continuam chegando em segundo plano.')).toBeInTheDocument()
  })
})
