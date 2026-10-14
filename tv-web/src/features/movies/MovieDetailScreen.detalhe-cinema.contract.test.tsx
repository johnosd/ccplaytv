/**
 * Contrato da feature 059 (detalhe Cinema) — travado em
 * `sdd/specs/059-detalhe-cinema-filme-serie/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/hero-cinema.md` e `logic/semelhantes-duas-linhas.md`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen, type MovieDetailScreenProps } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { ResolvedTitle, SimilarTabView, TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn(), useSimilarTitles: vi.fn(), useTmdbStatus: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
}))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Matrix',
  original_group: 'Lançamentos 2024',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Matrix',
  year: 1999,
}

const STABLE_ID = buildStableId({ sourceId: 'src1', kind: 'movie', providerStreamId: '100' })

const RELOADED: ResolvedTitle = { key: 'tmdb:movie:604', tmdbId: 604, kind: 'movie', title: 'Matrix Reloaded', year: 2003, localItemId: 'movie-2' }
const ANIMATRIX: ResolvedTitle = { key: 'tmdb:movie:55931', tmdbId: 55931, kind: 'movie', title: 'Animatrix', year: 2003, localItemId: 'movie-3' }
const REVOLUTIONS: ResolvedTitle = {
  key: 'tmdb:movie:605',
  tmdbId: 605,
  kind: 'movie',
  title: 'Matrix Revolutions',
  year: 2003,
  overview: 'A guerra final entre homens e máquinas.',
}

function metadata(data: TitleMetadataView) {
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data, isLoading: false, isFetching: false } as unknown as ReturnType<
    typeof catalogApi.useTitleMetadata
  >)
}

function similarView(view: SimilarTabView) {
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue(view)
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function renderScreen(props: Partial<MovieDetailScreenProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen movieId="movie-1" onBack={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

/** Das ações (foco inicial) até a aba "Semelhantes" ativa: ↓ abas, → Elenco, → Semelhantes, OK. */
function openSimilarTab() {
  press('ArrowDown')
  press('ArrowRight')
  press('ArrowRight')
  press('Enter')
}

const focused = (text: string) => screen.getByText(text).className.includes('tv-focus')

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<
    typeof catalogApi.useCatalogItem
  >)
  vi.mocked(catalogApi.useTmdbStatus).mockReturnValue({ data: { state: 'connected' } } as unknown as ReturnType<
    typeof catalogApi.useTmdbStatus
  >)
  similarView({ status: 'loading', titles: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MovieDetailScreen — contrato da feature 059 (detalhe Cinema)', () => {
  // US1/AC3+AC4+AC5+AC6; FR-004, FR-006, FR-007, FR-008, FR-009; Constitution: "Progresso e Capacidades São Reais, Nunca Prometidos"
  it('retomada com duração conhecida: primária focada com barra e "faltam"; categoria em chip próprio antes dos gêneros; ações em botões de ícone na ordem fixa; sem duração, nada de barra', async () => {
    await updateProgress(STABLE_ID, 'src1', 2530) // 42:10 — também põe o filme no Histórico
    metadata({
      durationSeconds: { value: 7680, origin: 'tmdb' },
      genres: { value: 'Ação, Ficção científica', origin: 'tmdb' },
    })
    renderScreen()

    const primary = await screen.findByText('▶ Continuar de 42:10')
    expect(primary.className).toContain('tv-focus')
    expect(within(primary).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    expect(within(primary).getByText('faltam 1 h 25 min')).toBeInTheDocument()

    const chips = within(screen.getByRole('list', { name: 'Categoria e gêneros' })).getAllByRole('listitem')
    expect(chips).toHaveLength(3)
    expect(chips[0]?.textContent).toContain('Lançamentos 2024')
    expect(chips[0]?.textContent).not.toContain('Ação')
    expect(chips[1]?.textContent).toBe('Ação')
    expect(chips[2]?.textContent).toBe('Ficção científica')

    const order = ['↺ Reiniciar', '+ Minha Lista', 'Trailer — indisponível', '☰ Semelhantes', '✓ Marcar como assistido', 'Remover do histórico']
    for (const label of order) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
      press('ArrowRight')
      expect(focused(label)).toBe(true)
    }
    press('ArrowRight') // para na ponta, nunca dá a volta
    expect(focused('Remover do histórico')).toBe(true)

    cleanup()
    metadata({ genres: { value: 'Ação', origin: 'tmdb' } }) // sem duração
    renderScreen()
    const withoutDuration = await screen.findByText('▶ Continuar de 42:10')
    expect(within(withoutDuration).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/^faltam/)).not.toBeInTheDocument()
  })

  // US3/AC4+AC5+AC6; FR-014, FR-015, FR-016; Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('Semelhantes em duas linhas tituladas: ←/→ param na ponta da linha, ↓/↑ trocam de linha, ↑ na primeira volta à aba; sem nenhum na lista, a 1ª linha é só uma frase e ↓ cai na 2ª', () => {
    metadata({ tmdbMatch: 'matched' })
    similarView({ status: 'ready', titles: [RELOADED, ANIMATRIX, REVOLUTIONS], coverage: { covered: 2, total: 3 } })
    const onOpenTitle = vi.fn()
    renderScreen({ onOpenTitle })

    openSimilarTab()
    expect(screen.getByRole('heading', { name: 'Na sua lista' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Não encontrados na sua lista' })).toBeInTheDocument()
    expect(screen.getByText('Procurado em 2 de 3 categorias de filmes')).toBeInTheDocument()

    press('ArrowDown') // Matrix Reloaded
    press('ArrowRight') // Animatrix
    press('ArrowRight') // fim da linha: continua em Animatrix
    press('Enter')
    expect(onOpenTitle).toHaveBeenLastCalledWith({ kind: 'movie', itemId: 'movie-3' }, { tab: 'similar', focusKey: 'tmdb:movie:55931' })

    press('ArrowDown') // linha "Não encontrados": Matrix Revolutions
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Matrix Revolutions')).toBeInTheDocument()
    press('Escape')

    press('ArrowUp') // volta à linha "Na sua lista"
    press('Enter')
    expect(onOpenTitle).toHaveBeenLastCalledWith({ kind: 'movie', itemId: 'movie-2' }, { tab: 'similar', focusKey: 'tmdb:movie:604' })
    press('ArrowUp') // primeira linha → aba ativa
    expect(screen.getByRole('tab', { name: 'Semelhantes' }).className).toContain('tv-focus')

    cleanup()
    similarView({ status: 'ready', titles: [REVOLUTIONS], coverage: { covered: 3, total: 3 } })
    renderScreen({ onOpenTitle })
    openSimilarTab()
    expect(screen.getByText('Nenhum título semelhante está na sua lista.')).toBeInTheDocument()
    press('ArrowDown')
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Matrix Revolutions')).toBeInTheDocument()
  })
})
