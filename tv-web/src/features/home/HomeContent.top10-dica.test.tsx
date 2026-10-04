import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, DiscoveryPick } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'

/**
 * Linhas Top 10 e Dica de filmes e de séries no Início (feature 057, US3) — o conteúdo em si, com os hooks do TMDB simulados
 * (o cruzamento e o sorteio têm testes próprios) e o resto contra `fake-indexeddb`.
 */

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useWeeklyTop10: vi.fn(), useDailyTip: vi.fn() }
})

const SOURCE_ID = 'source-home-057'

let restoreOffsetWidth: PropertyDescriptor | undefined
beforeAll(() => {
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1600 })
})
afterAll(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
})

function title(kind: 'movie' | 'series', name: string): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind,
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: SOURCE_ID,
    provider_stream_id: name,
    original_name: name,
    added_at: null,
  }
}

interface Rows {
  top10Movies?: DiscoveryPick[]
  top10Series?: DiscoveryPick[]
  tipMovies?: CatalogItemOut[]
  tipSeries?: CatalogItemOut[]
  covered?: [number, number]
}

function mockRows(rows: Rows = {}) {
  const [covered, total] = rows.covered ?? [1, 1]
  vi.mocked(catalogApi.useWeeklyTop10).mockImplementation((_source, kind) => ({
    data: kind === 'movie' ? (rows.top10Movies ?? []) : (rows.top10Series ?? []),
    coveredCategories: covered,
    totalCategories: total,
    isLoading: false,
  }))
  vi.mocked(catalogApi.useDailyTip).mockImplementation((_source, kind) => ({
    data: kind === 'movie' ? (rows.tipMovies ?? []) : (rows.tipSeries ?? []),
    coveredCategories: covered,
    totalCategories: total,
    isLoading: false,
  }))
}

const pick = (kind: 'movie' | 'series', name: string, rank: number): DiscoveryPick => ({ item: title(kind, name), rank })

const ALL: Rows = {
  top10Movies: [pick('movie', 'Filme 1', 1), pick('movie', 'Filme 3', 3), pick('movie', 'Filme 4', 4)],
  top10Series: [pick('series', 'Série 2', 2), pick('series', 'Série 5', 5), pick('series', 'Série 6', 6)],
  tipMovies: [title('movie', 'Dica F1'), title('movie', 'Dica F2')],
  tipSeries: [title('series', 'Dica S1'), title('series', 'Dica S2')],
}

function renderHome(overrides: Partial<HomeContentProps> = {}) {
  const props: HomeContentProps = {
    sourceId: SOURCE_ID,
    onBack: vi.fn(),
    onNavigate: vi.fn(),
    onOpenItem: vi.fn(),
    onOpenChannel: vi.fn(),
    onOpenFavorites: vi.fn(),
    onPlay: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...render(<HomeContent {...props} />, { wrapper }), props }
}

const press = (key: string) => fireEvent.keyDown(document.body, { key, bubbles: true })
const focusedRow = () => document.querySelector('.home-content .tv-focus')?.closest('section.home-row')?.getAttribute('aria-label') ?? null
/** Hero de boas-vindas visível e nenhum esqueleto de rail (eles usam o mesmo título das rails de verdade). */
async function settled() {
  await waitFor(() => {
    expect(screen.getByText('Bem-vindo(a) ao CCPlayTV')).toBeInTheDocument()
    expect(document.querySelectorAll('.home-row[aria-busy="true"]')).toHaveLength(0)
  })
}
const rowEl = (label: string) => document.querySelector(`section.home-row[aria-label="${label}"]`)

beforeEach(async () => {
  await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('HomeContent — Top 10 e Dica (feature 057)', () => {
  it('as 4 linhas aparecem entre os canais e a "Curadoria IA", com a posição real, a fonte TMDB e o aviso de cobertura parcial', async () => {
    mockRows({ ...ALL, covered: [1, 3] })
    renderHome()
    await settled()

    const labels = [...document.querySelectorAll('.home-content section.home-row')].map((section) => section.getAttribute('aria-label'))
    expect(labels).toEqual(['Top 10 filmes da semana', 'Top 10 séries da semana', 'Dica de filme', 'Dica de série', 'Curadoria IA'])

    const movies = rowEl('Top 10 filmes da semana')!
    expect([...movies.querySelectorAll('.content-card-rank')].map((rank) => rank.textContent)).toEqual(['1', '3', '4'])
    expect([...rowEl('Top 10 séries da semana')!.querySelectorAll('.content-card-rank')].map((rank) => rank.textContent)).toEqual(['2', '5', '6'])
    expect(rowEl('Dica de filme')!.querySelector('.content-card-rank')).toBeNull()
    expect(movies.querySelector('.home-row-source')?.textContent).toContain('TMDB')
    expect(movies.querySelector('.home-row-coverage')?.textContent).toContain('Com base em 1 de 3 categorias')
    expect(rowEl('Dica de série')!.querySelector('.home-row-source')?.textContent).toContain('TMDB')
  })

  it('uma linha sem dado some sozinha e as demais seguem; sem nenhuma, nada do TMDB aparece (nem "Em breve") e o foco anda', async () => {
    mockRows({ ...ALL, tipMovies: [], top10Series: [] })
    renderHome()
    await settled()
    expect([...document.querySelectorAll('.home-content section.home-row')].map((s) => s.getAttribute('aria-label'))).toEqual([
      'Top 10 filmes da semana',
      'Dica de série',
      'Curadoria IA',
    ])
    cleanup()

    mockRows()
    renderHome()
    await settled()
    expect([...document.querySelectorAll('.home-content section.home-row')].map((s) => s.getAttribute('aria-label'))).toEqual(['Curadoria IA'])
    expect(document.body.textContent).not.toContain('Top 10')
    expect(document.body.textContent).not.toContain('Dica de')
    press('ArrowDown')
    expect(focusedRow()).toBe('Curadoria IA')
    expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(1)
  })

  it('↓ percorre as linhas na ordem, ← → andam pelos cards, OK abre o título com a origem certa e um só foco o tempo todo', async () => {
    mockRows(ALL)
    const { props } = renderHome()
    await settled()

    press('ArrowDown')
    expect(focusedRow()).toBe('Top 10 filmes da semana')
    press('ArrowRight')
    press('Enter')
    expect(props.onOpenItem).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'id-Filme 3' }), { zone: 'rail', rail: 'top10-movies', itemId: 'id-Filme 3' })

    press('ArrowDown')
    expect(focusedRow()).toBe('Top 10 séries da semana')
    press('ArrowDown')
    expect(focusedRow()).toBe('Dica de filme')
    press('ArrowDown')
    expect(focusedRow()).toBe('Dica de série')
    press('Enter')
    expect(props.onOpenItem).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'id-Dica S1' }), { zone: 'rail', rail: 'tip-series', itemId: 'id-Dica S1' })
    expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(1)

    press('ArrowDown')
    expect(focusedRow()).toBe('Curadoria IA')
    press('ArrowUp')
    expect(focusedRow()).toBe('Dica de série')
  })

  it('voltar restaura o foco no mesmo card por id; id que sumiu cai no 1º card da mesma linha', async () => {
    mockRows(ALL)
    renderHome({ initialFocus: { zone: 'rail', rail: 'tip-series', itemId: 'id-Dica S2' } })
    await waitFor(() => expect(focusedRow()).toBe('Dica de série'))
    expect(document.querySelector('.home-content .tv-focus')?.closest('.content-card')?.textContent).toContain('Dica S2')
    cleanup()

    mockRows(ALL)
    renderHome({ initialFocus: { zone: 'rail', rail: 'top10-series', itemId: 'id-sumiu' } })
    await waitFor(() => expect(focusedRow()).toBe('Top 10 séries da semana'))
    expect(document.querySelector('.home-content .tv-focus')?.closest('.content-card')?.textContent).toContain('Série 2')
  })

  it('focar e percorrer as linhas não consulta a rede', async () => {
    mockRows(ALL)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderHome()
    await settled()
    for (let i = 0; i < 4; i += 1) press('ArrowDown')
    press('ArrowRight')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
