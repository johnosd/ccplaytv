import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportProgressScreen } from './ImportProgressScreen'
import { db, type ImportRunRecord } from '../../lib/catalog/db'
import { findUnnamedControls } from '../../testing/accessibleNames'

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
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByText(/Entradas lidas/)).toBeInTheDocument())
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('a tela declara o que ficou de fora por tipo não reconhecido (FR-008)', async () => {
    await db.importRuns.put(mockJobRecord({ discardedByType: 50 }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(
        screen.getByText('Entradas de tipo não reconhecido ficaram de fora.'),
      ).toBeInTheDocument()
      expect(screen.getByText(/Descartados \(tipo não reconhecido\): 50/)).toBeInTheDocument()
    })
  })

  it('seção que o painel não serviu aparece como aviso, não como ausência silenciosa', async () => {
    await db.importRuns.put(mockJobRecord({ unavailableSections: ['movie'] }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('O provedor não respondeu à lista de filmes.')).toBeInTheDocument()
    })
  })

  it('importação inexistente mostra um estado próprio com saída focável, sem consultar sem parar', async () => {
    // Registro ausente resolvia para `null`, que nunca é status terminal: a
    // consulta repetia a cada 1,5 s e a tela ficava num carregamento sem
    // nenhum elemento focável — o controle só saía pela tecla Voltar.
    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-sumido" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/não está mais registrada no aparelho/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })

  it('quando houver truncamento, a tela declara que a lista não coube inteira (FR-018)', async () => {
    await db.importRuns.put(mockJobRecord({ truncatedByStorage: true }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('A lista não coube inteira no aparelho.')).toBeInTheDocument()
    })
  })

  it('fonte de provedor conta categorias, sem os rótulos de item que não fazem sentido ali (T022)', async () => {
    await db.importRuns.put(
      mockJobRecord({
        unit: 'categories',
        entriesRead: 340,
        channelsStored: 340,
        discardedByType: 0,
        invalidCount: 0,
      }),
    )

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Categorias lidas: 340/)).toBeInTheDocument()
      expect(screen.getByText(/Categorias gravadas: 340/)).toBeInTheDocument()
      expect(screen.getByText(/Lendo categorias/)).toBeInTheDocument()
    })
    // Descarte por tipo e invalidez não existem para uma estrutura de
    // categorias — não é honesto mostrar uma linha que é sempre zero.
    expect(screen.queryByText(/Descartados/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Inválidos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('caminho do conteúdo guardado (feature 014): etapas reais, sem percentual, rótulo de item corresponde ao que channelsStored conta', async () => {
    // Sem `unit` (M3U, `scanToStored`) — mesmo contrato de rótulo que o
    // caminho integral de antes tinha: "Entradas lidas"/"Itens gravados"
    // continuam corretos, porque `channelsStored` ainda conta registros
    // persistidos com sucesso — só o destino (`storedEntries`, não mais
    // `channels`) mudou, e isso é interno, não aparece na tela.
    await db.importRuns.put(
      mockJobRecord({ step: 'storing', entriesRead: 500, channelsStored: 480, discardedByType: 20, invalidCount: 0 }),
    )

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Entradas lidas: 500/)).toBeInTheDocument()
      expect(screen.getByText(/Itens gravados: 480/)).toBeInTheDocument()
      expect(screen.getByText(/Publicando catálogo/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('falta de espaço ao guardar o conteúdo mostra a mensagem própria (feature 014, D-009)', async () => {
    await db.importRuns.put(mockJobRecord({ status: 'failed', errorKind: 'storage_full' }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText('Não há espaço no aparelho para guardar esta lista.')).toBeInTheDocument()
    })
  })

  it('exibe o estado de recusa com texto próprio e garante elemento focável (T044/US5)', async () => {
    await db.importRuns.put(mockJobRecord({ status: 'failed', errorKind: 'direct_connection_refused' }))

    const Wrapper = createWrapper()
    render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
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

// ---------------------------------------------------------------------------
// Feature 023, US4 (D-009, FR-037/FR-038/FR-039): ao concluir, "Abrir lista".
// ---------------------------------------------------------------------------

function renderProgress(overrides: Partial<React.ComponentProps<typeof ImportProgressScreen>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const props = {
    jobId: 'job-1',
    onRetried: vi.fn(),
    onBack: vi.fn(),
    onOpenSource: vi.fn(),
    ...overrides,
  }
  render(
    <QueryClientProvider client={queryClient}>
      <ImportProgressScreen {...props} />
    </QueryClientProvider>,
  )
  return { ...props, queryClient }
}

/** Importação concluída SEM nenhum aviso (nada descartado, nada inválido, nada truncado). */
const COMPLETED_CLEAN: Partial<ImportRunRecord> = {
  status: 'completed',
  step: 'done',
  discardedByType: 0,
  invalidCount: 0,
  finishedAt: Date.now(),
}

describe('ImportProgressScreen — abrir a lista ao concluir (feature 023, US4)', () => {
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.importRuns.clear()
  })

  it('concluída sem avisos: mostra "Abrir lista" já em foco e o texto "Concluída", sem percentual (FR-037/FR-038)', async () => {
    await db.importRuns.put(mockJobRecord(COMPLETED_CLEAN))
    renderProgress()

    const open = await screen.findByRole('button', { name: 'Abrir lista' })
    expect(screen.getByText(/Concluída/)).toBeInTheDocument()
    expect(screen.queryByText(/Avisos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(open))
  })

  it('concluída COM avisos (status continua `completed`): "Abrir lista" aparece junto dos avisos, que ficam legíveis — sem avanço automático', async () => {
    await db.importRuns.put(mockJobRecord({ ...COMPLETED_CLEAN, discardedByType: 5, truncatedByStorage: true }))
    const props = renderProgress()

    const open = await screen.findByRole('button', { name: 'Abrir lista' })
    expect(screen.getByText('A lista não coube inteira no aparelho.')).toBeInTheDocument()
    expect(screen.getByText('Entradas de tipo não reconhecido ficaram de fora.')).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(open))
    // Nada saiu sozinho: só a pessoa decide abrir.
    expect(props.onOpenSource).not.toHaveBeenCalled()
    expect(props.onBack).not.toHaveBeenCalled()
  })

  it('OK em "Abrir lista" chama onOpenSource com o id da lista do job', async () => {
    await db.importRuns.put(mockJobRecord({ ...COMPLETED_CLEAN, sourceId: 'lista-42' }))
    const props = renderProgress()

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir lista' }))
    expect(props.onOpenSource).toHaveBeenCalledTimes(1)
    expect(props.onOpenSource).toHaveBeenCalledWith('lista-42')
  })

  it('em andamento e falhou: não há "Abrir lista"', async () => {
    await db.importRuns.put(mockJobRecord()) // running
    const running = renderProgress()
    await screen.findByRole('button', { name: 'Cancelar' })
    expect(screen.queryByRole('button', { name: 'Abrir lista' })).not.toBeInTheDocument()
    cleanup()
    running.queryClient.clear()

    await db.importRuns.put(mockJobRecord({ status: 'failed', errorKind: 'network_failure' }))
    renderProgress()
    await screen.findByRole('button', { name: 'Tentar novamente' })
    expect(screen.queryByRole('button', { name: 'Abrir lista' })).not.toBeInTheDocument()
  })

  // Feature 028, FR-015/FR-017 — um caso por estado principal.
  it('todo controle tem nome acessível: andamento', async () => {
    await db.importRuns.put(mockJobRecord({ status: 'running' }))
    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByText(/Em andamento/)).toBeInTheDocument())
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('todo controle tem nome acessível: concluída', async () => {
    await db.importRuns.put(mockJobRecord({ status: 'completed' }))
    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir lista' })).toBeInTheDocument())
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('todo controle tem nome acessível: falha', async () => {
    await db.importRuns.put(mockJobRecord({ status: 'failed', errorKind: 'network_failure' }))
    const Wrapper = createWrapper()
    const { container } = render(
      <Wrapper>
        <ImportProgressScreen jobId="job-1" onRetried={() => {}} onBack={() => {}} onOpenSource={() => {}} />
      </Wrapper>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument())
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('"Voltar" está sempre presente e chama onBack com o id da lista — botão e RETURN (FR-039)', async () => {
    await db.importRuns.put(mockJobRecord({ ...COMPLETED_CLEAN, sourceId: 'lista-42' }))
    const props = renderProgress()

    // O estado de carregando também tem "Voltar" — sem esperar o job, o clique
    // sairia antes de haver lista a apontar (e sem argumento, corretamente).
    await screen.findByRole('button', { name: 'Abrir lista' })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(props.onBack).toHaveBeenCalledTimes(1)
    expect(props.onBack).toHaveBeenLastCalledWith('lista-42')

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(props.onBack).toHaveBeenCalledTimes(2)
    expect(props.onBack).toHaveBeenLastCalledWith('lista-42')
  })

  it('sem job (importação sumida): "Voltar" chama onBack SEM argumento — não há lista a apontar', async () => {
    const props = renderProgress({ jobId: 'job-sumido' })

    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(props.onBack).toHaveBeenCalledTimes(1)
    expect(props.onBack).toHaveBeenCalledWith()
  })

  it('o foco vai para "Abrir lista" na virada para concluída, mesmo com a pessoa já parada em "Voltar" (D-009)', async () => {
    await db.importRuns.put(mockJobRecord()) // running
    const { queryClient } = renderProgress()

    await screen.findByRole('button', { name: 'Cancelar' })
    const back = screen.getByRole('button', { name: 'Voltar' })
    back.focus()
    expect(document.activeElement).toBe(back)

    // A importação termina: o registro muda e a consulta é refeita.
    await db.importRuns.put(mockJobRecord(COMPLETED_CLEAN))
    await queryClient.invalidateQueries({ queryKey: ['import-job', 'job-1'] })

    const open = await screen.findByRole('button', { name: 'Abrir lista' })
    await waitFor(() => expect(document.activeElement).toBe(open))
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })
})
