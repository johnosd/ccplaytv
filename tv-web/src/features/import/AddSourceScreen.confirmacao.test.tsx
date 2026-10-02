import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddSourceScreen } from './AddSourceScreen'
import type { SourceOut } from './importApi'
import { db } from '../../lib/catalog/db'
import * as sourceRepository from '../../lib/catalog/sourceRepository'

vi.spyOn(globalThis, 'fetch')

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function fillXtream(server = 'http://painel.exemplo.test:8080') {
  fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Casa' } })
  fireEvent.change(screen.getByLabelText('Servidor'), { target: { value: server } })
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'joao' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo' } })
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /Conectar e sincronizar|Tentar de novo|Salvar alterações/ }))

describe('AddSourceScreen — confirmação de conexão (feature 045, US1)', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset()
  })

  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch')
    await db.sources.clear()
    await db.importRuns.clear()
  })

  it('endereço inválido: SRC-001 sem consultar a rede, dados preservados', async () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fillXtream('http://')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('SRC-001')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Usuário')).toHaveValue('joao')
  })

  it('servidor que não responde: NET-02, e o botão vira "Tentar de novo" com o foco nele', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fillXtream()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('NET-02')
    const retry = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(retry).toHaveFocus()
    expect(await db.sources.count()).toBe(0)
  })

  it('aparelho offline: NET-01 na hora, sem consultar a rede', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fillXtream()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('NET-01')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('M3U que serve HTML: SRC-422 e o rótulo da ação não muda', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(() => Promise.resolve(new Response('<html></html>')))
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /Lista M3U/ }))
    fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Casa' } })
    fireEvent.change(screen.getByLabelText('URL M3U'), { target: { value: 'http://lista.exemplo.test/x.m3u' } })
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('SRC-422')
    expect(screen.getByRole('button', { name: 'Conectar e sincronizar' })).toHaveFocus()
  })

  it('painel sem protocolo cujo M3U serve segue ao progresso (Modo limitado), sem erro', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((input) =>
      Promise.resolve(
        String(input).includes('get.php')
          ? new Response('#EXTM3U\n#EXTINF:-1,Canal\nhttp://painel.exemplo.test/1.ts\n')
          : new Response('', { status: 404 }),
      ),
    )
    const onSourceCreated = vi.fn()
    render(<AddSourceScreen onSourceCreated={onSourceCreated} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fillXtream()
    submit()
    await waitFor(() => expect(onSourceCreated).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disco cheio ao criar: STO-01 na mesma faixa', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ user_info: { auth: 1 } }))),
    )
    const quota = Object.assign(new Error('cheio'), { name: 'QuotaExceededError' })
    vi.spyOn(sourceRepository, 'createSource').mockRejectedValue(quota)
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fillXtream()
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('STO-01')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveFocus()
  })
})

describe('AddSourceScreen — edição (feature 045, FR-011)', () => {
  const existing: SourceOut = {
    id: 'src-prov',
    type: 'provider_credentials',
    display_name: 'Meu Provedor',
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: 'http://prov.test',
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
  }

  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset()
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch')
  })

  it('salvar só o nome não consulta a rede', async () => {
    const updateSpy = vi.spyOn(sourceRepository, 'updateSource').mockResolvedValue(undefined)
    const onSourceUpdated = vi.fn()
    render(<AddSourceScreen existingSource={existing} onSourceCreated={vi.fn()} onSourceUpdated={onSourceUpdated} onBack={vi.fn()} />, {
      wrapper: createWrapper(),
    })
    fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Outro nome' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(onSourceUpdated).toHaveBeenCalledTimes(1))
    expect(updateSpy).toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
