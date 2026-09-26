import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut, SeriesEpisodesContent } from '../catalog/catalogApi'
import { PlayerLayer } from '../../components/PlayerLayer'
import { db } from '../../lib/catalog/db'
import { buildStableId, markCompleted, updateProgress } from '../../lib/catalog/userStateRepository'

// `useCatalogItem`/`useSeriesEpisodes` são mockados (controlados por teste,
// sem depender do catálogo real). `useUserStates`/`invalidateUserStates`
// ficam com a implementação REAL — mesmo padrão de `MovieDetailScreen.
// test.tsx` para `useUserState`/`invalidateUserState`.
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

  // --- foco inicial e navegação (FR-020, FR-008, D-013) ---

  it('foco inicial está na primeira aba de temporada (FR-020)', () => {
    renderScreen()

    const tabs = screen.getAllByRole('button').filter((b) => b.className.includes('season-tab'))
    expect(tabs[0].className).toContain('tv-focus')
    expect(tabs[0]).toHaveTextContent('Temporada 1')
  })

  it('direita troca a temporada exibida sem nova obtenção (FR-008) — a lista mostra os episódios da temporada 2', () => {
    renderScreen()

    press('ArrowRight')

    const tabs = screen.getAllByRole('button').filter((b) => b.className.includes('season-tab'))
    expect(tabs[1].className).toContain('tv-focus')
    expect(tabs[1]).toHaveTextContent('Temporada 2')
    expect(screen.getByText('Seven Thirty-Seven')).toBeInTheDocument()
    expect(screen.queryByText('Piloto')).not.toBeInTheDocument()
    // useSeriesEpisodes não foi chamado de novo com argumento diferente —
    // trocar de aba é leitura local do que já veio.
    expect(catalogApi.useSeriesEpisodes).toHaveBeenCalledWith('series-1')
  })

  it('BAIXO nas abas entra na lista de episódios; CIMA no primeiro episódio volta às abas', () => {
    renderScreen()

    press('ArrowDown')
    expect(screen.getByText('Piloto').closest('.episode-row')?.className).toContain('tv-focus')

    press('ArrowUp')
    const tabs = screen.getAllByRole('button').filter((b) => b.className.includes('season-tab'))
    expect(tabs[0].className).toContain('tv-focus')
  })

  it('CIMA/BAIXO dentro da lista move entre episódios da mesma temporada', () => {
    renderScreen()
    press('ArrowDown') // entra na lista, foco no Piloto

    press('ArrowDown') // desce pro próximo episódio
    expect(screen.getByText('Cat in the Bag').closest('.episode-row')?.className).toContain('tv-focus')
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
    press('ArrowDown')

    press('Enter')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(lastPlayerLayerProps()?.startAtMs).toBeUndefined()
  })

  it('OK num episódio com posição salva retoma dela (startAtMs em ms)', async () => {
    await updateProgress(stableIdOfEpisode(S1E1), 'src1', 300) // 5min
    renderScreen()
    press('ArrowDown')

    // Espera a leitura real de `useUserStates` assentar antes do OK.
    await screen.findByText('Continuar de 5:00')
    press('Enter')

    expect(lastPlayerLayerProps()?.startAtMs).toBe(300_000)
  })

  // --- selo de assistido (US3, D-007) ---

  it('episódio concluído mostra "✓ Assistido"; em andamento e nunca aberto não mostram', async () => {
    await markCompleted(stableIdOfEpisode(S1E1), 'src1')
    await updateProgress(stableIdOfEpisode(S1E2), 'src1', 90) // em andamento, não concluído
    renderScreen()

    await waitFor(() => {
      const piloto = screen.getByText('Piloto').closest('.episode-row')
      expect(piloto?.textContent).toContain('✓ Assistido')
    })

    const emAndamento = screen.getByText('Cat in the Bag').closest('.episode-row')
    expect(emAndamento?.textContent).not.toContain('✓ Assistido')
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
      const piloto = screen.getByText('Piloto').closest('.episode-row')
      expect(piloto?.textContent).toContain('✓ Assistido')
      expect(piloto?.textContent).toContain('Continuar de 0:40')
    })
  })

  it('fechar a camada devolve o foco ao episódio e invalida o estado do usuário (releitura sem manual)', async () => {
    renderScreen()
    press('ArrowDown')
    press('Enter')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await updateProgress(stableIdOfEpisode(S1E1), 'src1', 90)
    act(() => {
      screen.getByRole('button', { name: 'Fechar (teste)' }).click()
    })

    await waitFor(() => expect(screen.getByText('Continuar de 1:30')).toBeInTheDocument())
    expect(screen.getByText('Piloto').closest('.episode-row')?.className).toContain('tv-focus')
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
    press('ArrowDown')

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
      press('ArrowDown') // foco no Piloto (S1E1)
      press('Enter')
      expect(screen.getByRole('dialog', { name: 'Reproduzindo Piloto' })).toBeInTheDocument()

      conclude()

      expect(screen.queryByRole('dialog', { name: 'Reproduzindo Piloto' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Próximo episódio' })).toBeInTheDocument()
    })

    it('a contagem expira, toca o próximo e muda de temporada quando o próximo está em outra (D-010)', () => {
      renderScreen()
      press('ArrowDown') // Piloto
      press('ArrowDown') // Cat in the Bag (último da Temporada 1)
      press('Enter')
      conclude()

      expect(screen.getByText('Temporada 2 — Seven Thirty-Seven')).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(10_000))

      expect(screen.getByRole('dialog', { name: 'Reproduzindo Seven Thirty-Seven' })).toBeInTheDocument()
      const tabs = screen.getAllByRole('button').filter((b) => b.className.includes('season-tab'))
      expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    })

    it('cancelar a contagem volta à lista com foco no episódio que acabou de concluir, sem tocar o próximo', () => {
      renderScreen()
      press('ArrowDown') // Piloto
      press('Enter')
      conclude()
      expect(screen.getByRole('dialog', { name: 'Próximo episódio' })).toBeInTheDocument()

      press('Escape') // RETURN cancela, igual a SELECT

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Piloto').closest('.episode-row')?.className).toContain('tv-focus')
    })

    it('último episódio da última temporada: fecha e volta à lista, sem aviso de autoplay (FR-016)', () => {
      renderScreen()
      press('ArrowRight') // Temporada 2
      press('ArrowDown') // Seven Thirty-Seven (único episódio, também o último de todos)
      press('Enter')
      expect(screen.getByRole('dialog', { name: 'Reproduzindo Seven Thirty-Seven' })).toBeInTheDocument()

      conclude()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Seven Thirty-Seven').closest('.episode-row')?.className).toContain('tv-focus')
    })
  })
})
