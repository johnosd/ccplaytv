/**
 * Contrato da feature 035 (aba Semelhantes no detalhe) — travado em
 * `sdd/specs/035-semelhantes-elenco-ator/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/aba-semelhantes.md` e `logic/navegacao-detalhe.md`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen, type MovieDetailScreenProps } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { ResolvedTitle, SimilarTabView, TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn(), useSimilarTitles: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
}))

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Matrix',
  original_group: 'Ação',
  published: true,
  playable: true,
  source_id: 'src1',
  provider_stream_id: '100',
  original_name: 'Matrix',
  year: 1999,
}

const RELOADED: ResolvedTitle = {
  key: 'tmdb:movie:604',
  tmdbId: 604,
  kind: 'movie',
  title: 'Matrix Reloaded',
  year: 2003,
  localItemId: 'movie-2',
}
const ANIMATRIX: ResolvedTitle = {
  key: 'tmdb:movie:55931',
  tmdbId: 55931,
  kind: 'movie',
  title: 'Animatrix',
  year: 2003,
  localItemId: 'movie-3',
}
const REVOLUTIONS: ResolvedTitle = {
  key: 'tmdb:movie:605',
  tmdbId: 605,
  kind: 'movie',
  title: 'Matrix Revolutions',
  year: 2003,
  overview: 'A guerra final entre homens e máquinas.',
}

const METADATA: TitleMetadataView = { tmdbMatch: 'matched' }

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function similarView(view: SimilarTabView) {
  vi.mocked(catalogApi.useSimilarTitles).mockReturnValue(view)
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

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<
    typeof catalogApi.useCatalogItem
  >)
  vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data: METADATA, isLoading: false } as unknown as ReturnType<
    typeof catalogApi.useTitleMetadata
  >)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MovieDetailScreen — contrato da feature 035', () => {
  // US1/AC2+AC3+AC4+AC5, FR-007/FR-008/FR-009/FR-010/FR-019; Constitution: "Voltar Restaura Foco e Posição" (por id, nunca por índice)
  it('encontrado abre o detalhe com o snapshot; não encontrado abre o resumo sem assistir e RETURN devolve o foco ao cartão; o snapshot restaura aba e cartão por identidade', () => {
    similarView({ status: 'ready', titles: [RELOADED, REVOLUTIONS], coverage: { covered: 2, total: 3 } })
    const onOpenTitle = vi.fn()
    const onBack = vi.fn()
    renderScreen({ onOpenTitle, onBack })

    openSimilarTab()
    expect(screen.getByRole('tab', { name: 'Semelhantes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Procurado em 2 de 3 categorias de filmes')).toBeInTheDocument()
    expect(screen.getAllByText('Não encontrado na sua lista')).toHaveLength(1)

    press('ArrowDown') // primeiro cartão: Matrix Reloaded (encontrado)
    press('Enter')
    expect(onOpenTitle).toHaveBeenCalledWith({ kind: 'movie', itemId: 'movie-2' }, { tab: 'similar', focusKey: 'tmdb:movie:604' })

    press('ArrowRight') // Matrix Revolutions (não encontrado)
    press('Enter')
    const summary = screen.getByRole('dialog')
    expect(within(summary).getByText('Matrix Revolutions')).toBeInTheDocument()
    expect(within(summary).getByText(/2003/)).toBeInTheDocument()
    expect(within(summary).getByText('A guerra final entre homens e máquinas.')).toBeInTheDocument()
    expect(within(summary).queryByText(/Assistir/)).not.toBeInTheDocument()

    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onBack).not.toHaveBeenCalled()
    press('Enter') // o foco voltou ao MESMO cartão
    expect(within(screen.getByRole('dialog')).getByText('Matrix Revolutions')).toBeInTheDocument()

    cleanup()
    // Outra ordem (um encontrado a mais antes): o foco segue a identidade, não o índice 1.
    similarView({ status: 'ready', titles: [RELOADED, ANIMATRIX, REVOLUTIONS], coverage: { covered: 3, total: 3 } })
    renderScreen({ onOpenTitle, restore: { tab: 'similar', focusKey: 'tmdb:movie:605' } })
    expect(screen.getByRole('tab', { name: 'Semelhantes' })).toHaveAttribute('aria-selected', 'true')
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Matrix Revolutions')).toBeInTheDocument()
  })

  // US2/AC1+AC2, FR-011/FR-012, SC-004; Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('sem chave: explica e oferece "Configurar TMDB" focável que abre Integrações; título sem casamento: mensagem própria e o foco nunca fica sem elemento', () => {
    similarView({ status: 'no_key', titles: [] })
    const onOpenTmdbSettings = vi.fn()
    renderScreen({ onOpenTmdbSettings })

    openSimilarTab()
    expect(screen.getByText(/Semelhantes vêm do TMDB/i)).toBeInTheDocument()
    const configure = screen.getByRole('button', { name: 'Configurar TMDB' })
    press('ArrowDown')
    expect(configure.className).toContain('tv-focus')
    press('Enter')
    expect(onOpenTmdbSettings).toHaveBeenCalledWith({ tab: 'similar' })

    cleanup()
    similarView({ status: 'no_match', titles: [] })
    renderScreen()
    openSimilarTab()
    expect(screen.getByText(/identificar este título no TMDB/i)).toBeInTheDocument()
    press('ArrowDown') // nada focável no painel: o foco fica na aba, nunca em lugar nenhum
    expect(screen.getByRole('tab', { name: 'Semelhantes' }).className).toContain('tv-focus')
  })
})
