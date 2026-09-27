import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut, SeriesEpisodesContent } from '../catalog/catalogApi'
import { PlayerLayer } from '../../components/PlayerLayer'
import { db } from '../../lib/catalog/db'
import { buildStableId, markCompleted, updateProgress } from '../../lib/catalog/userStateRepository'

// `useCatalogItem`/`useSeriesEpisodes` são mockados (controlados por teste,
// sem depender do catálogo real). `useUserStates`/`invalidateUserStates`/
// `useUserState`/`useToggleFavorite`/`useSeriesWatchedSummary` ficam com a
// implementação REAL — mesmo padrão de `MovieDetailScreen.test.tsx` para
// `useUserState`/`invalidateUserState`.
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useSeriesEpisodes: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(
    ({
      title,
      onClose,
      onCompleted,
    }: {
      title: string
      startAtMs?: number
      onClose: () => void
      onCompleted?: () => void
    }) => (
      <div role="dialog" aria-label={`Reproduzindo ${title}`}>
        <button type="button" onClick={onClose}>
          Fechar (teste)
        </button>
        {onCompleted && (
          <button type="button" onClick={onCompleted}>
            Concluir (teste)
          </button>
        )}
      </div>
    ),
  ),
}))

const SERIES: CatalogItemOut = {
  id: 'series-1',
  kind: 'series',
  name: 'Breaking Bad',
  original_group: 'Drama',
  published: true,
  playable: false,
  source_id: 'src1',
  provider_stream_id: undefined,
  original_name: 'Breaking Bad',
  series_id: '200',
}

function episode(overrides: Partial<EpisodeOut> = {}): EpisodeOut {
  return {
    id: '1001',
    name: 'Piloto',
    season_number: 1,
    episode_number: 1,
    playable: true,
    source_id: 'src1',
    provider_stream_id: '1001',
    series_id: '200',
    original_name: 'Piloto',
    ...overrides,
  }
}

const S1E1 = episode({ id: '1001', name: 'Piloto', episode_number: 1 })
const S1E2 = episode({ id: '1002', name: 'Cat in the Bag', episode_number: 2 })
const S2E1 = episode({ id: '2001', name: 'Seven Thirty-Seven', season_number: 2, episode_number: 1 })

function episodesResult(
  data: SeriesEpisodesContent | undefined,
  isLoading = false,
): ReturnType<typeof catalogApi.useSeriesEpisodes> {
  return { data, isLoading, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>
}

function catalogItemResult(data: CatalogItemOut | null, isLoading = false) {
  return { data, isLoading } as ReturnType<typeof catalogApi.useCatalogItem>
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** actions → tabs → season → episodes, focando o 1º episódio da temporada exibida (3 setas). */
function enterEpisodesRow() {
  press('ArrowDown')
  press('ArrowDown')
  press('ArrowDown')
}

function renderScreen(onBack = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailScreen seriesId="series-1" onBack={onBack} />
    </QueryClientProvider>,
  )
  return queryClient
}

function lastPlayerLayerProps() {
  const calls = vi.mocked(PlayerLayer).mock.calls
  return calls[calls.length - 1]?.[0]
}

function stableIdOfEpisode(ep: EpisodeOut) {
  return buildStableId({
    sourceId: ep.source_id,
    kind: 'episode',
    providerStreamId: ep.provider_stream_id ?? undefined,
    seriesId: ep.series_id,
    seasonNumber: ep.season_number ?? undefined,
    episodeNumber: ep.episode_number ?? undefined,
    originalName: ep.original_name,
  })
}

// jsdom não faz layout real: sem isto, `useVirtualizer` mede altura 0 e
// `getVirtualItems()` nunca devolve nada — a lista de episódios ficaria
// sempre vazia nos testes, mesmo com dados. Mesmo mock de `LiveScreen.
// test.tsx` (feature 009).
let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined
let restoreScrollHeight: PropertyDescriptor | undefined

beforeAll(() => {
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  restoreScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
})

afterAll(() => {
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  if (restoreScrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', restoreScrollHeight)
})

describe('SeriesDetailScreen', () => {
  beforeEach(async () => {
    await db.userStates.clear()
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(catalogItemResult(SERIES))
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue(
      episodesResult({ episodes: [S1E1, S1E2, S2E1], outcome: 'fetched' }),
    )
    vi.mocked(PlayerLayer).mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // --- estados de carregando/erro/vazio, todos com saída ativável por OK (R-005) ---

  it('carregando o item da série: "Carregando…" com Voltar focado e ativado por OK', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(catalogItemResult(null, true))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('série não encontrada no catálogo: mensagem com Voltar focado e ativado por OK', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(catalogItemResult(null))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Esta série não está mais no catálogo.')).toBeInTheDocument()
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('carregando episódios: "Carregando episódios…" com Voltar focado e ativado por OK', () => {
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue(episodesResult(undefined, true))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Carregando episódios…')).toBeInTheDocument()
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('obtenção de episódios falhou: "Tentar de novo" focado e ativado por OK (FR-003)', () => {
    const refetch = vi.fn()
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
      data: { episodes: [], outcome: 'failed' },
      isLoading: false,
      refetch,
    } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
    renderScreen()

    const retry = screen.getByText('Tentar de novo')
    expect(retry.className).toContain('tv-focus')
    press('Enter')
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('série sem episódios (obtenção ok, lista vazia): mensagem com Voltar focado e ativado por OK', () => {
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue(episodesResult({ episodes: [], outcome: 'fresh' }))
    const onBack = vi.fn()
    renderScreen(onBack)

    expect(screen.getByText('Episódios ainda não disponíveis')).toBeInTheDocument()
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('obtenção não atualizada (stale-served): aviso visível, conteúdo continua acessível (FR-004)', () => {
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue(
      episodesResult({ episodes: [S1E1], outcome: 'stale-served' }),
    )
    renderScreen()

    expect(
      screen.getByText('Não foi possível atualizar agora — mostrando o que já estava salvo.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Piloto')).toBeInTheDocument()
  })

  // --- hero V14: ação primária, Minha Lista, Trailer (US6, FR-038) ---

  it('foco inicial está na ação primária "Assistir T1:E1" (sem estado salvo, 1º episódio)', () => {
    renderScreen()

    const primary = screen.getByText('▶ Assistir T1:E1')
    expect(primary.className).toContain('tv-focus')
  })

  it('com retomada em algum episódio, a ação primária é "Continuar" com o código do episódio', async () => {
    await updateProgress(stableIdOfEpisode(S1E2), 'src1', 90)
    renderScreen()

    expect(await screen.findByText('▶ Continuar T1:E2')).toBeInTheDocument()
  })

  it('"Minha Lista" alterna o favorito e mostra o toast', async () => {
    renderScreen()
    press('ArrowRight') // primária(0) -> Minha Lista(1)
    press('Enter')

    expect(await screen.findByText('Adicionado aos favoritos')).toBeInTheDocument()
    expect(await screen.findByText('✓ Na Minha Lista')).toBeInTheDocument()
  })

  it('"Trailer" é soft-disabled e anuncia "Em breve" sem abrir o player', () => {
    renderScreen()
    press('ArrowRight') // primária(0) -> Minha Lista(1)
    press('ArrowRight') // Minha Lista(1) -> Trailer(2)

    const trailer = screen.getByText('▶ Trailer')
    expect(trailer.className).toContain('is-soft-disabled')
    press('Enter')

    expect(screen.getByText('Em breve — Trailer do filme ou da série.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // --- abas (US6, FR-039) ---

  it('BAIXO nas ações entra nas abas, com "Episódios" focada e ativa', () => {
    renderScreen()
    press('ArrowDown')

    const tab = screen.getByRole('tab', { name: 'Episódios' })
    expect(tab.className).toContain('tv-focus')
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  it('←/→ nas abas move o foco sem trocar a aba ativa; OK troca de verdade (Detalhes)', () => {
    renderScreen()
    press('ArrowDown') // tabs, foco em Episódios
    press('ArrowRight') // foco em Detalhes, sem trocar

    let details = screen.getByRole('tab', { name: 'Detalhes' })
    expect(details.className).toContain('tv-focus')
    expect(details).toHaveAttribute('aria-selected', 'false')

    press('Enter')

    details = screen.getByRole('tab', { name: 'Detalhes' })
    expect(details).toHaveAttribute('aria-selected', 'true')
    const panel = document.querySelector('.vod-detail-panel') as HTMLElement
    expect(within(panel).getByText('Temporadas conhecidas')).toBeInTheDocument()
    expect(within(panel).getByText('2')).toBeInTheDocument() // 2 temporadas
    expect(within(panel).getByText('3')).toBeInTheDocument() // 3 episódios conhecidos
    expect(within(panel).getByText('Drama')).toBeInTheDocument()
  })

  it('aba "Elenco" é soft-disabled: OK anuncia "Em breve" sem trocar a aba ativa', () => {
    renderScreen()
    press('ArrowDown') // tabs, foco em Episódios
    press('ArrowRight') // Detalhes
    press('ArrowRight') // Elenco

    const cast = screen.getByRole('tab', { name: 'Elenco' })
    expect(cast.className).toContain('is-soft-disabled')
    press('Enter')

    expect(screen.getByText('Em breve — Elenco e equipe técnica.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Episódios' })).toHaveAttribute('aria-selected', 'true')
  })

  it('CIMA nas abas volta para as ações', () => {
    renderScreen()
    press('ArrowDown') // tabs
    press('ArrowUp') // ações

    expect(screen.getByText('▶ Assistir T1:E1').className).toContain('tv-focus')
  })

  // --- seletor de temporada em modal (US6, FR-040) ---

  it('BAIXO nas abas (Episódios ativa) entra na linha de temporada', () => {
    renderScreen()
    press('ArrowDown') // tabs
    press('ArrowDown') // season

    const seasonButton = screen.getByText(/Temporada 1/).closest('.vod-season-button')
    expect(seasonButton?.className).toContain('tv-focus')
    expect(screen.getByText('2 episódios')).toBeInTheDocument()
  })

  it('OK na linha de temporada abre o modal, mesmo havendo várias — a atual vem com ✓ e foco', () => {
    renderScreen()
    press('ArrowDown')
    press('ArrowDown')
    press('Enter')

    expect(screen.getByRole('dialog', { name: 'Selecionar temporada' })).toBeInTheDocument()
    const first = screen.getByText('Temporada 1').closest('.vod-season-modal-item')
    expect(first?.textContent).toContain('✓')
    expect(first?.className).toContain('tv-focus')
  })

  it('escolher outra temporada no modal troca a lista e devolve o foco ao botão', () => {
    renderScreen()
    press('ArrowDown')
    press('ArrowDown')
    press('Enter') // abre modal

    press('ArrowDown') // foco em Temporada 2
    press('Enter') // escolhe

    expect(screen.queryByRole('dialog', { name: 'Selecionar temporada' })).not.toBeInTheDocument()
    expect(screen.getByText('Seven Thirty-Seven')).toBeInTheDocument()
    expect(screen.queryByText('Piloto')).not.toBeInTheDocument()
    expect(screen.getByText(/Temporada 2/).closest('.vod-season-button')?.className).toContain('tv-focus')
    // useSeriesEpisodes não foi chamado de novo — trocar de temporada é leitura local.
    expect(catalogApi.useSeriesEpisodes).toHaveBeenCalledWith('series-1')
  })

  it('RETURN no modal fecha sem trocar a temporada', () => {
    renderScreen()
    press('ArrowDown')
    press('ArrowDown')
    press('Enter')

    press('Escape')

    expect(screen.queryByRole('dialog', { name: 'Selecionar temporada' })).not.toBeInTheDocument()
    expect(screen.getByText('Piloto')).toBeInTheDocument()
  })

  // --- lista de episódios (D-013, FR-041) ---

  it('BAIXO na linha de temporada entra na lista de episódios, no 1º episódio', () => {
    renderScreen()
    enterEpisodesRow()

    expect(screen.getByText('Piloto').closest('.vod-episode-row')?.className).toContain('tv-focus')
  })

  it('CIMA no primeiro episódio volta à linha de temporada', () => {
    renderScreen()
    enterEpisodesRow()
    press('ArrowUp')

    expect(screen.getByText(/Temporada 1/).closest('.vod-season-button')?.className).toContain('tv-focus')
  })

  it('CIMA/BAIXO dentro da lista move entre episódios da mesma temporada', () => {
    renderScreen()
    enterEpisodesRow()

    press('ArrowDown')
    expect(screen.getByText('Cat in the Bag').closest('.vod-episode-row')?.className).toContain('tv-focus')
  })

  it('RETURN volta para a tela Séries (FR-021)', () => {
    const onBack = vi.fn()
    renderScreen(onBack)

    press('Escape')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  // --- reprodução e retomada (FR-009, FR-018) ---

  it('OK num episódio sem retomada abre o player direto, sem menu (startAtMs indefinido)', () => {
    renderScreen()
    enterEpisodesRow()

    press('Enter')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(lastPlayerLayerProps()?.startAtMs).toBeUndefined()
  })

  it('OK num episódio com posição salva retoma dela (startAtMs em ms)', async () => {
    await updateProgress(stableIdOfEpisode(S1E1), 'src1', 300) // 5min
    renderScreen()
    enterEpisodesRow()

    // Espera a leitura real de `useUserStates` assentar antes do OK.
    await screen.findByText('Continuar de 5:00')
    press('Enter')

    expect(lastPlayerLayerProps()?.startAtMs).toBe(300_000)
  })

  // --- selo de assistido (US3, D-007) ---

  it('episódio concluído mostra "✓ Concluído"; em andamento e nunca aberto não mostram', async () => {
    await markCompleted(stableIdOfEpisode(S1E1), 'src1')
    await updateProgress(stableIdOfEpisode(S1E2), 'src1', 90) // em andamento, não concluído
    renderScreen()

    await waitFor(() => {
      const piloto = screen.getByText('Piloto').closest('.vod-episode-row')
      expect(piloto?.textContent).toContain('✓ Concluído')
    })

    const emAndamento = screen.getByText('Cat in the Bag').closest('.vod-episode-row')
    expect(emAndamento?.textContent).not.toContain('✓ Concluído')
    expect(emAndamento?.textContent).toContain('Continuar de 1:30')

    // "Seven Thirty-Seven" está na Temporada 2 — nem chega a montar
    // enquanto a Temporada 1 é a exibida (virtualização por temporada).
    expect(screen.queryByText('Seven Thirty-Seven')).not.toBeInTheDocument()
  })

  it('reassistir um episódio concluído mantém o selo junto com a nova retomada (D-007)', async () => {
    await markCompleted(stableIdOfEpisode(S1E1), 'src1')
    await updateProgress(stableIdOfEpisode(S1E1), 'src1', 40)
    renderScreen()

    await waitFor(() => {
      const piloto = screen.getByText('Piloto').closest('.vod-episode-row')
      expect(piloto?.textContent).toContain('✓ Concluído')
      expect(piloto?.textContent).toContain('Continuar de 0:40')
    })
  })

  it('fechar a camada devolve o foco ao episódio e invalida o estado do usuário (releitura sem manual)', async () => {
    renderScreen()
    enterEpisodesRow()
    press('Enter')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await updateProgress(stableIdOfEpisode(S1E1), 'src1', 90)
    act(() => {
      screen.getByRole('button', { name: 'Fechar (teste)' }).click()
    })

    await waitFor(() => expect(screen.getByText('Continuar de 1:30')).toBeInTheDocument())
    expect(screen.getByText('Piloto').closest('.vod-episode-row')?.className).toContain('tv-focus')
  })

  it('episódio sem identidade estável ainda abre o player, sem linha de retomada (FR-018)', () => {
    const noIdentity = episode({
      id: '9999',
      name: 'Sem identidade',
      provider_stream_id: null,
      series_id: '',
      season_number: 1,
      episode_number: 99,
      original_name: '',
    })
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue(
      episodesResult({ episodes: [noIdentity], outcome: 'fetched' }),
    )
    renderScreen()
    enterEpisodesRow()

    expect(screen.queryByText(/Continuar de/)).not.toBeInTheDocument()
    press('Enter')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(lastPlayerLayerProps()?.startAtMs).toBeUndefined()
  })

  // --- autoplay (US4, D-008/D-009) ---

  describe('autoplay do próximo episódio', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function conclude() {
      act(() => {
        screen.getByRole('button', { name: 'Concluir (teste)' }).click()
      })
    }

    it('a conclusão desmonta o player antes de mostrar a contagem — nunca as duas camadas juntas (FR-013)', () => {
      renderScreen()
      enterEpisodesRow() // foco no Piloto (S1E1)
      press('Enter')
      expect(screen.getByRole('dialog', { name: 'Reproduzindo Piloto' })).toBeInTheDocument()

      conclude()

      expect(screen.queryByRole('dialog', { name: 'Reproduzindo Piloto' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Próximo episódio' })).toBeInTheDocument()
    })

    it('a contagem expira, toca o próximo e muda de temporada quando o próximo está em outra (D-010)', () => {
      renderScreen()
      enterEpisodesRow() // Piloto
      press('ArrowDown') // Cat in the Bag (último da Temporada 1)
      press('Enter')
      conclude()

      expect(screen.getByText('Temporada 2 — Seven Thirty-Seven')).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(10_000))

      expect(screen.getByRole('dialog', { name: 'Reproduzindo Seven Thirty-Seven' })).toBeInTheDocument()
      expect(screen.getByText(/Temporada 2/).closest('.vod-season-button')).toBeInTheDocument()
    })

    it('cancelar a contagem volta à lista com foco no episódio que acabou de concluir, sem tocar o próximo', () => {
      renderScreen()
      enterEpisodesRow() // Piloto
      press('Enter')
      conclude()
      expect(screen.getByRole('dialog', { name: 'Próximo episódio' })).toBeInTheDocument()

      press('Escape') // RETURN cancela, igual a SELECT

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Piloto').closest('.vod-episode-row')?.className).toContain('tv-focus')
    })

    it('último episódio da última temporada: fecha e volta à lista, sem aviso de autoplay (FR-016)', () => {
      renderScreen()
      enterEpisodesRow()
      press('Enter') // abre o modal? não — Piloto está focado, ArrowRight não é usado aqui

      // Reabre a tela do zero e navega até a Temporada 2 pelo modal, que é o
      // único caminho agora (a troca inline por seta saiu, US6).
      act(() => {
        screen.getByRole('button', { name: 'Fechar (teste)' }).click()
      })
      press('ArrowUp') // volta pra season
      press('Enter') // abre modal
      press('ArrowDown') // Temporada 2
      press('Enter') // escolhe — foco fica no botão de temporada
      press('ArrowDown') // entra na lista, único episódio
      press('Enter')
      expect(screen.getByRole('dialog', { name: 'Reproduzindo Seven Thirty-Seven' })).toBeInTheDocument()

      conclude()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Seven Thirty-Seven').closest('.vod-episode-row')?.className).toContain('tv-focus')
    })
  })
})
