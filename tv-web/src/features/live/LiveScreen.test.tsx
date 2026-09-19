import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useChannels: vi.fn(), fetchPlayback: vi.fn() }
})

function channel(name: string, group: string | null, playable = true): CatalogItemOut {
  return { id: `id-${name}`, kind: 'channel', name, original_group: group, published: true, playable }
}

function mockChannels(items: CatalogItemOut[]) {
  vi.mocked(catalogApi.useChannels).mockReturnValue({
    data: { items, next_cursor: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useChannels>)
}

function mockQueryState(state: { isLoading?: boolean; isError?: boolean }) {
  vi.mocked(catalogApi.useChannels).mockReturnValue({
    data: undefined,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useChannels>)
}

function renderLive() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  // Um elemento NOVO a cada chamada é essencial: reusar a MESMA referência
  // de elemento entre `render` e `rerender` faz o React aplicar bailout por
  // identidade referencial na subárvore inteira, e `LiveScreen` nunca
  // re-executa — o `useChannels` mockado nunca seria relido de verdade.
  function buildUi() {
    return (
      <Wrapper>
        <LiveScreen sourceId="source-1" onBack={() => {}} />
      </Wrapper>
    )
  }
  const result = render(buildUi())
  return { ...result, rerenderLive: () => result.rerender(buildUi()) }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Move o foco para a coluna de canais e desce `n` posições. */
function focusChannel(n = 0) {
  press('ArrowRight')
  for (let i = 0; i < n; i += 1) press('ArrowDown')
}

describe('LiveScreen', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.fetchPlayback).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // --- T017: estados de borda, todos com saída focável ---

  it('mostra carregando com um elemento focável', () => {
    mockQueryState({ isLoading: true })
    const { container } = renderLive()

    expect(screen.getByText(/Carregando canais/)).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('mostra erro de carga com "Tentar de novo" focável', () => {
    mockQueryState({ isError: true })
    const { container } = renderLive()

    expect(screen.getByText(/Não foi possível carregar os canais/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('distingue "nenhum canal na fonte" de erro, com saída focável', () => {
    mockChannels([])
    const { container } = renderLive()

    expect(screen.getByText('Nenhum canal nesta lista')).toBeInTheDocument()
    expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument()
    expect(container.querySelectorAll('.tv-focus').length).toBeGreaterThan(0)
  })

  it('mostra os grupos e canais reais da fonte, na ordem declarada', () => {
    mockChannels([
      channel('Zulu', 'Esportes'),
      channel('Alfa', 'Notícias'),
      channel('Yankee', 'Esportes'),
    ])
    renderLive()

    const groups = document.querySelectorAll('.live-column-groups .live-item')
    expect([...groups].map((g) => g.textContent)).toEqual(['Esportes', 'Notícias'])
    // O primeiro grupo começa selecionado, com seus canais na ordem da fonte.
    // Consulta escopada à coluna de canais: o nome do canal em foco também
    // aparece no painel de informação à direita.
    const channels = document.querySelectorAll('.live-column-channels .live-item-name')
    expect([...channels].map((c) => c.textContent)).toEqual(['Zulu', 'Yankee'])
  })

  it('não exibe contagem total nem "fim do catálogo" (FR-016)', () => {
    mockChannels([channel('A', 'G'), channel('B', 'G')])
    renderLive()

    // O catálogo publicado pode ser parcial durante uma importação; a tela
    // não pode sugerir completude.
    expect(screen.queryByText(/2 canais/)).not.toBeInTheDocument()
    expect(screen.queryByText(/fim do catálogo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument()
  })

  // --- T018 / T040: canal indisponível ---

  it('mostra canal sem URL como indisponível, e Enter não abre o player', () => {
    mockChannels([channel('Sem fonte', 'Grupo', false)])
    renderLive()

    expect(screen.getByText('Indisponível')).toBeInTheDocument()

    focusChannel()
    press('Enter')

    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(/não tem uma fonte de reprodução/)).toBeInTheDocument()
  })

  // --- T025: foco não dispara requisição de reprodução (SC-006) ---

  it('mover o foco por toda a lista não dispara nenhuma requisição de reprodução', () => {
    mockChannels([
      channel('A', 'G1'),
      channel('B', 'G1'),
      channel('C', 'G2'),
    ])
    renderLive()

    press('ArrowDown')
    press('ArrowUp')
    focusChannel(1)
    press('ArrowUp')
    press('ArrowLeft')
    press('ArrowDown')

    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // --- T026: Enter repetido cria uma única sessão ---

  it('Enter repetido no mesmo canal cria uma única sessão de reprodução', async () => {
    mockChannels([channel('Canal', 'G')])
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: 'id-Canal',
      kind: 'channel',
      url: 'http://exemplo.invalid/x.ts',
      container_hint: 'ts',
    })
    renderLive()

    focusChannel()
    press('Enter')
    press('Enter')
    press('Enter')

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(catalogApi.fetchPlayback).toHaveBeenCalledTimes(1)
  })

  // --- T027: voltar do player restaura o foco no canal de origem ---

  it('ao fechar o player, o foco volta ao canal de origem no mesmo grupo', async () => {
    mockChannels([
      channel('Primeiro', 'G1'),
      channel('Segundo', 'G1'),
      channel('Outro', 'G2'),
    ])
    vi.mocked(catalogApi.fetchPlayback).mockResolvedValue({
      item_id: 'id-Segundo',
      kind: 'channel',
      url: 'http://exemplo.invalid/x.ts',
      container_hint: 'ts',
    })
    renderLive()

    focusChannel(1)
    const focusedBefore = document.querySelector('.live-column-channels .tv-focus')?.textContent
    expect(focusedBefore).toContain('Segundo')

    press('Enter')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const focusedAfter = document.querySelector('.live-column-channels .tv-focus')?.textContent
    expect(focusedAfter).toContain('Segundo')
    // E o grupo continua o mesmo (título da coluna de canais, não a de grupos).
    expect(
      document.querySelector('.live-column-channels .live-column-title')?.textContent,
    ).toBe('G1')
  })

  it('trocar de grupo recomeça no primeiro canal', () => {
    mockChannels([
      channel('A1', 'G1'),
      channel('A2', 'G1'),
      channel('B1', 'G2'),
      channel('B2', 'G2'),
    ])
    renderLive()

    focusChannel(1)
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('A2')

    press('ArrowLeft')
    press('ArrowDown')
    press('ArrowRight')

    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B1')
  })

  // --- Feature 004 (US5, T037): catálogo substituído em segundo plano ---
  // não desorganiza a navegação em curso (FR-022, SC-012) ---

  it('ao trocar o catálogo em segundo plano, o foco segue o canal pelo id — não pelo índice', () => {
    mockChannels([channel('A', 'G1'), channel('B', 'G1'), channel('C', 'G2')])
    const { rerenderLive } = renderLive()

    focusChannel(1) // foca "B", índice 1 do grupo G1
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B')

    // Atualização por idade conclui enquanto o usuário navega: mesmos
    // canais, ordem diferente — "B" passa a ser o índice 0. Foco por
    // índice "saltaria" pra outro canal; por identidade, continua em "B".
    mockChannels([channel('B', 'G1'), channel('A', 'G1'), channel('C', 'G2')])
    rerenderLive()

    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B')
  })

  it('se o canal focado sumir do catálogo novo, cai no início do grupo em vez de focar algo aleatório', () => {
    mockChannels([channel('A', 'G1'), channel('B', 'G1'), channel('C', 'G2')])
    const { rerenderLive } = renderLive()

    focusChannel(1) // foca "B"
    expect(document.querySelector('.live-column-channels .tv-focus')?.textContent).toContain('B')

    // "B" não existe mais no catálogo novo.
    mockChannels([channel('A', 'G1'), channel('C', 'G2')])
    rerenderLive()

    const focused = document.querySelector('.live-column-channels .tv-focus')
    expect(focused).not.toBeNull() // continua havendo saída focável
    expect(focused?.textContent).toContain('A')
  })

  it('se o grupo focado sumir do catálogo novo, cai no primeiro grupo', () => {
    mockChannels([channel('A', 'G1'), channel('B', 'G2')])
    const { rerenderLive } = renderLive()

    press('ArrowDown') // move pro grupo G2
    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('G2')

    // G2 deixou de existir.
    mockChannels([channel('A', 'G1'), channel('C', 'G3')])
    rerenderLive()

    expect(document.querySelector('.live-column-groups .tv-focus')?.textContent).toBe('G1')
  })
})
