import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesDetailScreen } from './SeriesDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, EpisodeOut } from '../catalog/catalogApi'

/**
 * Bug `foco-some-ao-descer-na-lista`: com o hero Cinema (059) a lista de episódios fica abaixo da dobra e tem o
 * tamanho do próprio conteúdo — quem rola é a página, e ninguém a rolava ao descer: o foco saía da tela. O foco é
 * estado + `tv-focus` (não foco de DOM), então a tela precisa trazer a linha focada à vista.
 */
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useSeriesEpisodes: vi.fn(), useTitleMetadata: vi.fn(), useSimilarTitles: vi.fn() }
})
vi.mock('../../components/PlayerLayer', () => ({ PlayerLayer: () => <div role="dialog" aria-label="Reproduzindo" /> }))

const SERIES: CatalogItemOut = {
  id: 'series-1',
  kind: 'series',
  name: 'Dark',
  original_group: 'Drama',
  published: true,
  playable: false,
  source_id: 'src1',
  original_name: 'Dark',
  series_id: '200',
}

function episode(n: number): EpisodeOut {
  return {
    id: String(1000 + n),
    name: `Episodio ${n}`,
    season_number: 1,
    episode_number: n,
    playable: true,
    source_id: 'src1',
    provider_stream_id: String(1000 + n),
    series_id: '200',
    original_name: `Episodio ${n}`,
  }
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

let restoreOffsetHeight: PropertyDescriptor | undefined
let restoreClientHeight: PropertyDescriptor | undefined

beforeEach(() => {
  // Sem layout no jsdom o virtualizador não renderiza linhas: mesma medida de `SeriesDetailScreen.test.tsx`.
  restoreOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  restoreClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: SERIES, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>)
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue({ status: 'loading', titles: [] })
  vi.mocked(catalogApi.useSeriesEpisodes).mockReturnValue({
    data: { episodes: [1, 2, 3, 4].map(episode), outcome: 'fetched' },
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useSeriesEpisodes>)
})

afterEach(() => {
  if (restoreOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', restoreOffsetHeight)
  if (restoreClientHeight) Object.defineProperty(Element.prototype, 'clientHeight', restoreClientHeight)
  cleanup()
  vi.restoreAllMocks()
})

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SeriesDetailScreen seriesId="series-1" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

describe('SeriesDetailScreen — foco da lista de episódios fica à vista', () => {
  it('descer pelos episódios traz cada linha focada à vista; nas abas não rola', () => {
    const seen: string[] = []
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      seen.push(`${this.className}|${this.textContent ?? ''}`)
    })
    renderScreen()

    press('ArrowDown') // ações → abas
    expect(seen).toEqual([])

    press('ArrowDown') // abas → 1º episódio
    expect(seen.at(-1)).toMatch(/vod-episode-row.*tv-focus\|.*Episodio 1/)

    press('ArrowDown')
    expect(seen.at(-1)).toMatch(/vod-episode-row.*tv-focus\|.*Episodio 2/)
    press('ArrowDown')
    expect(seen.at(-1)).toMatch(/vod-episode-row.*tv-focus\|.*Episodio 3/)

    press('ArrowUp')
    expect(seen.at(-1)).toMatch(/vod-episode-row.*tv-focus\|.*Episodio 2/)
  })

  it('rolar só mexe na posição: nenhuma reprodução inicia ao descer pelos episódios', () => {
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const { queryByRole } = renderScreen()
    for (let i = 0; i < 5; i += 1) press('ArrowDown')
    expect(queryByRole('dialog', { name: 'Reproduzindo' })).toBeNull()
  })
})
