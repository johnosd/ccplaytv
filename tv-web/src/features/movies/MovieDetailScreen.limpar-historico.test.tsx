/** Feature 036 (T022): "Remover do histórico" no detalhe de filme. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { buildStableId, getUserState, listPlayed, markCompleted, toggleFavorite, updateProgress } from '../../lib/catalog/userStateRepository'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({ PlayerLayer: () => null }))

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
}

const STABLE_ID = buildStableId({ sourceId: 'src1', kind: 'movie', providerStreamId: '100' })

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen movieId="movie-1" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

const actionLabels = () => [...document.querySelectorAll('.vod-detail-action')].map((el) => el.textContent)

describe('MovieDetailScreen — Remover do histórico (feature 036)', () => {
  beforeEach(async () => {
    await db.userStates.clear()
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<
      typeof catalogApi.useCatalogItem
    >)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('fora do Histórico a ação não existe (US1/AC8)', async () => {
    await toggleFavorite(STABLE_ID, 'src1', true)
    renderScreen()
    await waitFor(() => expect(actionLabels()).toContain('✓ Na Minha Lista'))
    expect(actionLabels()).not.toContain('Remover do histórico')
  })

  it('no Histórico: ação por último, índice 0 continua a primária; remover mantém favorito e "assistido"', async () => {
    await updateProgress(STABLE_ID, 'src1', 600)
    await toggleFavorite(STABLE_ID, 'src1', true)
    await markCompleted(STABLE_ID, 'src1')
    await updateProgress(STABLE_ID, 'src1', 600) // volta a ter retomada depois do "assistido"
    renderScreen()

    await waitFor(() => expect(actionLabels().at(-1)).toBe('Remover do histórico'))
    expect(document.querySelector('.vod-detail-action.tv-focus')?.textContent).toMatch(/^▶ Continuar/)

    for (let i = 0; i < 10; i += 1) press('ArrowRight')
    expect(document.querySelector('.vod-detail-action.tv-focus')?.textContent).toBe('Remover do histórico')
    press('Enter')

    const dialog = await screen.findByRole('dialog', { name: 'Remover "Duna" do histórico?' })
    expect(within(dialog).getByRole('button', { name: 'Remover e apagar progresso' })).toBeInTheDocument()
    // SC-004: um foco só — o da confirmação; RETURN devolve à mesma ação (FR-010).
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.vod-detail-action.tv-focus')?.textContent).toBe('Remover do histórico')
    press('Enter')
    await screen.findByRole('dialog', { name: 'Remover "Duna" do histórico?' })
    press('ArrowRight')
    press('Enter')

    await waitFor(() => expect(actionLabels()).not.toContain('Remover do histórico'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await listPlayed('src1', 'movie', db)).toEqual([])
    expect(await getUserState(STABLE_ID, db)).toMatchObject({ isFavorite: true, progressSeconds: 600 })
    expect((await getUserState(STABLE_ID, db))?.completedAt).toBeDefined()
    // A ação sumiu: o foco cai na anterior, nunca em nada.
    expect(document.querySelector('.vod-detail-action.tv-focus')).not.toBeNull()
  })
})
