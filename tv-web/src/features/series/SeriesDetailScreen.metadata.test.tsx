import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'
import { findUnnamedControls } from '../../testing/accessibleNames'

/**
 * Feature 032 — metadata no detalhe de série (US1, FR-003/004/008/022) e
 * sinopse por episódio (FR-028). O hook de dados é mockado; o resto é real.
 */
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useSeriesEpisodes: vi.fn(), useTitleMetadata: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(() => <div role="dialog" aria-label="Reproduzindo" />),
}))

const SERIES: CatalogItemOut = {
  id: 'series-1',
  kind: 'series',
  name: 'Frieren',
  original_group: 'Animação',
  published: true,
  playable: false,
  source_id: 'src1',
  original_name: 'Frieren',
  series_id: '200',
}

function episode(id: string, name: string, n: number, synopsis?: string): EpisodeOut {
  return {
    id,
    name,
    season_number: 1,
    episode_number: n,
    playable: true,
    source_id: 'src1',
    provider_stream_id: id,
    series_id: '200',
    original_name: name,
    synopsis: synopsis ?? null,
  }
}

const EP1 = episode('1001', 'Piloto', 1, 'Sinopse do episódio um.')
const EP2 = episode('1002', 'Segundo', 2)
const EP3 = episode('1003', 'Terceiro', 3, 'Sinopse do episódio três.')

const LONG = `${'Uma frase longa para a sinopse passar do limite. '.repeat(6)}Fim.`

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function metadata(view: TitleMetadataView | undefined) {
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data: view } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>)
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailScreen seriesId="series-1" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

// jsdom não mede layout: sem isto o virtualizador da lista de episódios não devolve linha nenhuma.
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

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: SERIES, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
    data: { episodes: [EP1, EP2, EP3], outcome: 'fetched' },
    isLoading: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
  metadata(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SeriesDetailScreen — metadata (feature 032)', () => {
  it('sinopse curta aparece sem "Ver mais"; sem metadata o hero não ganha nada (FR-003)', () => {
    metadata({ synopsis: { value: 'Uma maga elfa.', origin: 'provider' } })
    renderScreen()
    expect(screen.getByText('Uma maga elfa.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ver mais/ })).not.toBeInTheDocument()

    cleanup()
    metadata(undefined)
    renderScreen()
    expect(document.querySelector('.vod-detail-synopsis')).toBeNull()
    expect(document.querySelector('.vod-detail-backdrop')).toBeNull()
  })

  it('sinopse longa: ↑ das ações foca "Ver mais", OK abre o modal, RETURN volta ao botão, ↓ volta às ações (FR-004)', () => {
    metadata({ synopsis: { value: LONG, origin: 'provider' } })
    renderScreen()

    press('ArrowUp')
    expect(screen.getByRole('button', { name: /Ver mais/ }).className).toContain('tv-focus')
    press('Enter')
    expect(within(screen.getByRole('dialog', { name: 'Sinopse completa' })).getByText(LONG)).toBeInTheDocument()
    press('Escape')
    expect(screen.queryByRole('dialog', { name: 'Sinopse completa' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ver mais/ }).className).toContain('tv-focus')

    press('ArrowDown')
    expect(screen.getByText(/Assistir/).className).toContain('tv-focus')
  })

  it('backdrop é <img> dentro do hero e some se falhar ao carregar (D-008, FR-008)', () => {
    metadata({ backdropUrl: { value: 'http://img.test/bd.jpg', origin: 'provider' } })
    renderScreen()
    const img = document.querySelector<HTMLImageElement>('.vod-detail-hero .vod-detail-backdrop img')
    expect(img?.getAttribute('src')).toBe('http://img.test/bd.jpg')
    expect(document.querySelector('.screen.vod-detail')?.getAttribute('style') ?? '').not.toContain('background')

    fireEvent.error(img!)
    expect(document.querySelector('.vod-detail-backdrop')).toBeNull()
  })

  it('backdrop do TMDB leva o selo "Dados: TMDB" (FR-022, T046); o do provedor não leva', () => {
    metadata({ backdropUrl: { value: 'http://img.test/tmdb.jpg', origin: 'tmdb' } })
    renderScreen()
    expect(document.querySelector('.vod-detail-hero .vod-detail-backdrop-origin')?.textContent).toBe('Dados: TMDB')

    cleanup()
    metadata({ backdropUrl: { value: 'http://img.test/provedor.jpg', origin: 'provider' } })
    renderScreen()
    expect(document.querySelector('.vod-detail-backdrop img')).not.toBeNull()
    expect(document.querySelector('.vod-detail-backdrop-origin')).toBeNull()
  })

  it('aba Detalhes: só campos com valor, duração "por episódio", sem país; selo TMDB só no que veio de lá (FR-022)', () => {
    metadata({
      genres: { value: 'Animação, Drama', origin: 'provider' },
      durationSeconds: { value: 1500, origin: 'provider' },
      cast: { value: 'A, B', origin: 'tmdb' },
    })
    renderScreen()
    press('ArrowDown')
    press('ArrowRight')
    press('Enter')

    expect(screen.getByText('Gênero').nextSibling?.textContent).toBe('Animação, Drama')
    expect(screen.getByText('Duração por episódio').nextSibling?.textContent).toBe('~25 min')
    expect(screen.queryByText('País')).not.toBeInTheDocument()
    expect(screen.queryByText('Direção')).not.toBeInTheDocument()
    // "Elenco" também é o nome de uma aba: procura só dentro da lista de fatos.
    const cast = within(document.querySelector('dl') as HTMLElement).getByText('Elenco').nextSibling as HTMLElement
    expect(within(cast).getByText('Dados: TMDB')).toBeInTheDocument()
    expect(within(screen.getByText('Gênero').nextSibling as HTMLElement).queryByText('Dados: TMDB')).toBeNull()
  })

  it('aba Elenco (ad-hoc T044): lista os nomes do provedor; sem elenco, diz que não foi informado', () => {
    metadata({ cast: { value: 'Voz A, Voz B', origin: 'provider' } })
    renderScreen()
    press('ArrowDown') // ações → abas (Episódios)
    press('ArrowRight') // Detalhes
    press('ArrowRight') // Elenco
    press('Enter')

    expect(screen.getByRole('tab', { name: 'Elenco' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('list', { name: 'Elenco' })).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Voz A', 'Voz B'])
    expect(document.querySelector('.vod-episode-list')).toBeNull() // trocou o painel: a lista de episódios sai

    cleanup()
    metadata({ synopsis: { value: 'Só sinopse.', origin: 'provider' } })
    renderScreen()
    press('ArrowDown')
    press('ArrowRight')
    press('ArrowRight')
    press('Enter')
    expect(screen.getByText('O elenco deste título não foi informado.')).toBeInTheDocument()
  })

  it('todo controle novo tem nome acessível (feature 028, FR-015)', () => {
    metadata({ synopsis: { value: LONG, origin: 'provider' }, backdropUrl: { value: 'http://img.test/bd.jpg', origin: 'provider' } })
    renderScreen()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })
})

describe('SeriesDetailScreen — sinopse por episódio (FR-028)', () => {
  function enterEpisodes() {
    press('ArrowDown') // tabs
    press('ArrowDown') // temporada
    press('ArrowDown') // 1º episódio
  }

  it('mostra a sinopse do episódio focado, some no que não tem, e NUNCA usa a da série no lugar', () => {
    metadata({ synopsis: { value: 'SINOPSE DA SÉRIE', origin: 'provider' } })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderScreen()

    const box = () => document.querySelector('.vod-episode-synopsis')
    expect(box()?.textContent).toBe('') // fora da lista, nada é anunciado

    enterEpisodes()
    expect(box()?.textContent).toBe('Sinopse do episódio um.')
    press('ArrowDown')
    expect(box()?.textContent).toBe('') // episódio 2 não tem — nada de texto de preenchimento
    expect(box()?.textContent).not.toContain('SINOPSE DA SÉRIE')
    press('ArrowDown')
    expect(box()?.textContent).toBe('Sinopse do episódio três.')

    expect(fetchSpy).not.toHaveBeenCalled() // mover o foco nunca dispara consulta
  })

  it('temporada em que nenhum episódio tem sinopse não reserva faixa nenhuma', () => {
    vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
      data: { episodes: [episode('1', 'A', 1), episode('2', 'B', 2)], outcome: 'fetched' },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
    renderScreen()
    expect(document.querySelector('.vod-episode-synopsis')).toBeNull()
  })
})
