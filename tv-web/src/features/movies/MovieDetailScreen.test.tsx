import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { PlayerLayer } from '../../components/PlayerLayer'
import { db } from '../../lib/catalog/db'
import { buildStableId, clearProgress, getUserState, updateProgress } from '../../lib/catalog/userStateRepository'
import { RESUME_MIN_SECONDS } from '../../lib/player/resumePolicy'
import { findUnnamedControls } from '../../testing/accessibleNames'

// `useCatalogItem` é mockado (não depende do catálogo real pra estes
// testes). `useUserState`/`invalidateUserState`/`useToggleFavorite` ficam
// com a implementação REAL — são elas que este arquivo testa (T031: invalidação
// de verdade contra o Dexie/fake-indexeddb, não um mock que já "sabe" a resposta).
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn() }
})

// A máquina de estados do player já é testada em PlayerLayer.test.tsx. Aqui
// importa só o que MovieDetailScreen decide ANTES de abri-lo: qual
// `startAtMs` mandar, e quando reler o estado do usuário ao fechar.
vi.mock('../../components/PlayerLayer', () => ({
  // `startAtMs` não é usado no corpo — é lido de `mock.calls` (props
  // completas ficam gravadas ali independente do que a função renderiza).
  PlayerLayer: vi.fn(({ title, onClose }: { title: string; startAtMs?: number; onClose: () => void }) => (
    <div role="dialog" aria-label={`Reproduzindo ${title}`}>
      <button type="button" onClick={onClose}>
        Fechar (teste)
      </button>
    </div>
  )),
}))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Duna',
  original_group: 'Ficção científica',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Duna',
  year: 2021,
  added_at: Date.UTC(2024, 8, 23), // 23/09/2024
}

const STABLE_ID = buildStableId({ sourceId: 'src1', kind: 'movie', providerStreamId: '100' })

function queryResult(data: CatalogItemOut | null, isLoading = false) {
  return { data, isLoading } as ReturnType<typeof catalogApi.useCatalogItem>
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function renderScreen(onBack = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen movieId="movie-1" onBack={onBack} />
    </QueryClientProvider>,
  )
  return queryClient
}

function lastPlayerLayerProps() {
  const calls = vi.mocked(PlayerLayer).mock.calls
  return calls[calls.length - 1]?.[0]
}

describe('MovieDetailScreen', () => {
  beforeEach(async () => {
    await db.userStates.clear()
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(MOVIE))
    vi.mocked(PlayerLayer).mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // --- hero V14: ação primária (sempre índice 0), Minha Lista, Trailer (feature 025, US5) ---

  it('sem posição salva, a ação primária é "Assistir", focada no índice 0 (FR-033)', () => {
    renderScreen()

    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
  })

  it('SELECT em Assistir abre a camada, sem posição de retomada (startAtMs indefinido)', () => {
    renderScreen()

    press('Enter')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(lastPlayerLayerProps()?.startAtMs).toBeUndefined()
  })

  it('SELECT repetido (ou tecla mantida) não abre uma segunda camada (FR-010)', () => {
    renderScreen()

    press('Enter')
    press('Enter')
    press('Enter')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(vi.mocked(PlayerLayer)).toHaveBeenCalledTimes(1)
  })

  it('"Minha Lista" alterna o favorito e mostra o toast (US3, D-002)', async () => {
    renderScreen()
    press('ArrowRight') // Assistir(0) -> Minha Lista(1)
    press('Enter')

    expect(await screen.findByText('Adicionado aos favoritos')).toBeInTheDocument()
    expect(await screen.findByText('✓ Na Minha Lista')).toBeInTheDocument()
  })

  // Feature 033: o botão deixou de ser mock (os três estados e a camada têm o contrato próprio).
  it('"Trailer" sem candidato é soft-disabled, se declara e o OK explica sem abrir nenhuma camada', () => {
    vi.spyOn(catalogApi, 'useTitleMetadata').mockReturnValue({
      data: {},
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>)
    vi.spyOn(catalogApi, 'useTmdbStatus').mockReturnValue({
      data: { state: 'connected' },
    } as unknown as ReturnType<typeof catalogApi.useTmdbStatus>)
    renderScreen()
    press('ArrowRight') // Assistir(0) -> Minha Lista(1)
    press('ArrowRight') // Minha Lista(1) -> Trailer(2)

    const trailer = screen.getByText('Trailer — indisponível')
    expect(trailer.className).toContain('is-soft-disabled')
    expect(trailer.getAttribute('aria-disabled')).toBe('true')
    press('Enter')

    expect(screen.getByText('Trailer indisponível para este título')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    [{ videoId: 'enTrailer01', kind: 'trailer', language: 'en', origin: 'tmdb' }, '▶ Trailer · Inglês'],
    [{ videoId: 'ptTeaser001', kind: 'teaser', language: 'pt', origin: 'tmdb' }, '▶ Teaser'],
    [{ videoId: 'enTeaser001', kind: 'teaser', language: 'en', origin: 'tmdb' }, '▶ Teaser · Inglês'],
  ])('rótulo do botão segue o 1º candidato (%j → %s)', (candidate, label) => {
    vi.spyOn(catalogApi, 'useTitleMetadata').mockReturnValue({
      data: { trailers: [candidate] },
      isLoading: false,
      isFetching: false,
    } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>)
    vi.spyOn(catalogApi, 'useTmdbStatus').mockReturnValue({
      data: { state: 'connected' },
    } as unknown as ReturnType<typeof catalogApi.useTmdbStatus>)
    renderScreen()

    expect(screen.getByText(label).className).not.toContain('is-soft-disabled')
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível', () => {
    renderScreen()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('tela rola sem barra nativa (feature 028, FR-006)', () => {
    renderScreen()
    expect(document.querySelector('.vod-detail')).toHaveClass('no-scrollbar')
  })

  it('o botão "Voltar" do estado de erro é ativável por OK do controle (R-005)', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Este filme não está mais no catálogo.')).toBeInTheDocument()
    press('Enter')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('o botão "Voltar" do estado de carregando também é ativável por OK (R-005)', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null, true))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    press('Enter')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('RETURN sempre volta, mesmo no estado de erro', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null))
    const onBack = vi.fn()
    renderScreen(onBack)

    press('Escape')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // --- alternância Assistir / Continuar / Reiniciar ---

  describe('retomada', () => {
    it('com progresso ≥30s, a ação primária é "Continuar de mm:ss", e "Reiniciar" existe', async () => {
      await updateProgress(STABLE_ID, 'src1', RESUME_MIN_SECONDS + 65) // 30+65=95s = 1:35

      renderScreen()

      const resume = await screen.findByText('▶ Continuar de 1:35')
      expect(resume.className).toContain('tv-focus') // ação primária continua no índice 0
      expect(screen.getByText('↺ Reiniciar')).toBeInTheDocument()
      expect(screen.queryByText('▶ Assistir')).not.toBeInTheDocument()
    })

    it('com progresso <30s, continua "Assistir", sem ação secundária de retomada', async () => {
      await updateProgress(STABLE_ID, 'src1', RESUME_MIN_SECONDS - 5)

      renderScreen()

      await waitFor(() => expect(screen.getByText('▶ Assistir')).toBeInTheDocument())
      expect(screen.queryByText('↺ Reiniciar')).not.toBeInTheDocument()
      expect(screen.queryByText(/▶ Continuar/)).not.toBeInTheDocument()
    })

    it('"Continuar" abre a camada passando a posição salva em milissegundos', async () => {
      await updateProgress(STABLE_ID, 'src1', 300) // 5min

      renderScreen()
      await screen.findByText(/▶ Continuar/)

      press('Enter') // ação primária (Continuar) já está focada

      expect(lastPlayerLayerProps()?.startAtMs).toBe(300_000)
    })

    it('"Reiniciar" abre a camada com startAtMs 0 — não undefined (distinção deliberada, logic §3)', async () => {
      await updateProgress(STABLE_ID, 'src1', 300)

      renderScreen()
      await screen.findByText(/▶ Continuar/)

      press('ArrowRight') // move de Continuar (0) pra Reiniciar (1)
      press('Enter')

      expect(lastPlayerLayerProps()?.startAtMs).toBe(0)
    })
  })

  // --- frescor — a leitura não pode ficar defasada depois de fechar a camada ---

  describe('frescor do estado ao fechar a camada (logic §3)', () => {
    it('assistir e voltar atualiza a ação primária pra "Continuar", sem releitura manual', async () => {
      renderScreen()
      expect(screen.getByText('▶ Assistir')).toBeInTheDocument()

      press('Enter') // abre a camada (mockada)
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // O player real teria gravado isto via progressRecorder enquanto
      // tocava — aqui simulado diretamente, já que PlayerLayer é mock.
      await updateProgress(STABLE_ID, 'src1', 90)

      act(() => {
        screen.getByRole('button', { name: 'Fechar (teste)' }).click()
      })

      // Sem a invalidação, a tela continuaria mostrando "Assistir" (leitura
      // de quando montou) mesmo com 90s já gravados.
      expect(await screen.findByText('▶ Continuar de 1:30')).toBeInTheDocument()
      expect(screen.queryByText('▶ Assistir')).not.toBeInTheDocument()
    })

    it('concluir o filme (progresso apagado) e voltar restaura "Assistir"', async () => {
      await updateProgress(STABLE_ID, 'src1', 200)
      renderScreen()
      await screen.findByText(/▶ Continuar/)

      press('Enter')
      // Conclusão real limpa o progresso (FR-020) — aqui simulado direto.
      await clearProgress(STABLE_ID, 'src1')

      act(() => {
        screen.getByRole('button', { name: 'Fechar (teste)' }).click()
      })

      expect(await screen.findByText('▶ Assistir')).toBeInTheDocument()
      expect(screen.queryByText('↺ Reiniciar')).not.toBeInTheDocument()
    })
  })

  // --- Feature 019 (US2): correção manual de "assistido" ---

  describe('marcar/desmarcar assistido manualmente (feature 019, US2)', () => {
    it('sem posição salva: "Marcar como assistido" é a última ação, sem deslocar o foco da ação primária', () => {
      renderScreen()

      const primary = screen.getByText('▶ Assistir')
      expect(primary.className).toContain('tv-focus') // ação primária no índice 0

      const buttons = screen.getAllByText(/./, { selector: '.vod-detail-action' })
      expect(buttons[buttons.length - 1].textContent).toBe('✓ Marcar como assistido')
    })

    it('com posição salva (Continuar/Reiniciar): a ação de assistido continua no fim, sem deslocar a ação primária', async () => {
      await updateProgress(STABLE_ID, 'src1', 300)
      renderScreen()
      await screen.findByText(/▶ Continuar/)

      const primary = screen.getByText(/▶ Continuar/)
      expect(primary.className).toContain('tv-focus') // ainda índice 0

      // Com progresso o filme está no "↺ Histórico": desde a feature 036 (§9),
      // "Remover do histórico" vem logo depois, como última ação.
      const buttons = screen.getAllByText(/./, { selector: '.vod-detail-action' })
      expect(buttons[buttons.length - 2].textContent).toBe('✓ Marcar como assistido')
      expect(buttons[buttons.length - 1].textContent).toBe('Remover do histórico')
    })

    it('confirmar "Marcar como assistido" grava completedAt e alterna o rótulo para "Desmarcar"', async () => {
      renderScreen()

      // Assistir(0) -> Minha Lista(1) -> Trailer(2) -> Semelhantes(3) -> toggle-watched(4), a última ação
      press('ArrowRight')
      press('ArrowRight')
      press('ArrowRight')
      press('ArrowRight')
      press('Enter')

      await waitFor(async () => expect((await getUserState(STABLE_ID))?.completedAt).toBeDefined())
      expect(await screen.findByText('✗ Desmarcar assistido')).toBeInTheDocument()
    })
  })

  // --- ação "Semelhantes" no hero (feature 035, pedido pós-TV) ---

  it('"Semelhantes" fica entre Trailer e Marcar assistido; OK ativa a aba e leva o foco ao painel (sem chave: "Configurar TMDB")', async () => {
    renderScreen()

    const labels = screen.getAllByText(/./, { selector: '.vod-detail-action' }).map((el) => el.textContent)
    expect(labels.indexOf('☰ Semelhantes')).toBe(labels.length - 2)

    press('ArrowRight') // Minha Lista
    press('ArrowRight') // Trailer
    press('ArrowRight') // Semelhantes
    expect(screen.getByText('☰ Semelhantes').className).toContain('tv-focus')
    press('Enter')

    expect(screen.getByRole('tab', { name: 'Semelhantes' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/Semelhantes vêm do TMDB/i)).toBeInTheDocument()
    // O foco saiu do hero e foi para o painel ("Configurar TMDB"), nunca fica em lugar nenhum.
    await waitFor(() => expect(screen.getByText('☰ Semelhantes').className).not.toContain('tv-focus'))
    expect(screen.getByRole('button', { name: 'Configurar TMDB' }).className).toContain('tv-focus')
  })

  // --- abas (US5, FR-037) ---

  it('BAIXO nas ações entra nas abas, com "Detalhes" focada e ativa', () => {
    renderScreen()
    press('ArrowDown')

    const tab = screen.getByRole('tab', { name: 'Detalhes' })
    expect(tab.className).toContain('tv-focus')
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  it('a aba Detalhes mostra só os fatos que existem — ano, categoria, inclusão, disponibilidade', () => {
    renderScreen()

    const panel = document.querySelector('.vod-detail-panel') as HTMLElement
    expect(within(panel).getByText('2021')).toBeInTheDocument()
    expect(within(panel).getByText('Ficção científica')).toBeInTheDocument()
    expect(within(panel).getByText('23/09/2024')).toBeInTheDocument()
    expect(within(panel).getByText('Sim')).toBeInTheDocument()
    expect(screen.queryByText('Elenco: Desconhecido')).not.toBeInTheDocument()
    expect(screen.queryByText(/Resumo não disponível/)).not.toBeInTheDocument()
  })

  // Feature 032 (ad-hoc T044): "Elenco" deixou de ser mock — é uma aba real com o elenco em texto.
  it('aba "Elenco" é real: OK troca a aba (sem "Em breve"); sem elenco informado, diz isso; "Semelhantes" também é real (035)', async () => {
    renderScreen()
    press('ArrowDown') // tabs, foco em Detalhes
    press('ArrowRight') // Elenco

    const cast = screen.getByRole('tab', { name: 'Elenco' })
    expect(cast.className).not.toContain('is-soft-disabled')
    expect(cast).not.toHaveAttribute('aria-disabled')
    press('Enter')

    expect(screen.getByRole('tab', { name: 'Elenco' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Detalhes' })).toHaveAttribute('aria-selected', 'false')
    expect(await screen.findByText('O elenco deste título não foi informado.')).toBeInTheDocument()
    expect(screen.queryByText(/Em breve/)).not.toBeInTheDocument()

    press('ArrowRight') // Semelhantes
    press('Enter')
    expect(screen.queryByText(/Em breve/)).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Semelhantes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Semelhantes' })).not.toHaveAttribute('aria-disabled')
  })

  it('CIMA nas abas volta para as ações', () => {
    renderScreen()
    press('ArrowDown')
    press('ArrowUp')

    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
  })
})
