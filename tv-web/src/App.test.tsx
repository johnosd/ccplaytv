import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import type { CategoryScreenSnapshot } from './features/catalog/categoryScreenSnapshot'

/**
 * T025 (feature 017): confirma que o `App` grava, na entrada de histórico da
 * tela de origem, o snapshot que `MoviesScreen`/`SeriesScreen` entregam ao
 * abrir um detalhe — e o devolve em `restore` quando a pessoa volta (D-006,
 * fecha o bug de backlog "Voltar do detalhe pra grade não restaura foco nem
 * posição"). As telas reais são pesadas (IndexedDB, virtualização, foco) e
 * já têm cobertura própria; aqui só o roteamento do `App` está sob teste.
 */

vi.mock('./lib/tizenColorKey', () => ({ registerFavoriteColorKey: vi.fn() }))

vi.mock('./features/splash/SplashScreen', () => ({
  SplashScreen: ({ onFinished }: { onFinished: () => void }) => {
    onFinished()
    return null
  },
}))

vi.mock('./features/home/HomeScreen', () => ({
  HomeScreen: ({ onOpenSource }: { onOpenSource: (source: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onOpenSource({
          id: 'src-1',
          type: 'xtream',
          display_name: 'Fonte 1',
          connection_state: 'connected',
          last_successful_sync_at: null,
          provider_import_mode: 'on_demand',
          limited_reason: null,
          provider_dns: null,
          last_truncated_by_storage: false,
          last_discarded_by_type: 0,
        })
      }
    >
      abrir-fonte
    </button>
  ),
}))

vi.mock('./features/list-home/ListHomeScreen', () => ({
  ListHomeScreen: ({ onSelect }: { onSelect: (destination: string) => void }) => (
    <button type="button" onClick={() => onSelect('movies')}>
      ir-para-filmes
    </button>
  ),
}))

const fakeSnapshot: CategoryScreenSnapshot = {
  trailKey: { kind: 'category', name: 'Ação' },
  entered: { kind: 'category', id: 1 },
  col: 1,
  focusedItemId: 'filme-1',
  searchTerm: '',
  searchActive: false,
}

vi.mock('./features/movies/MoviesScreen', () => ({
  MoviesScreen: ({
    restore,
    onOpenMovie,
  }: {
    restore?: CategoryScreenSnapshot
    onOpenMovie: (movieId: string, snapshot?: CategoryScreenSnapshot) => void
  }) => (
    <div>
      <span data-testid="movies-restore">{restore ? JSON.stringify(restore) : 'sem-restore'}</span>
      <button type="button" onClick={() => onOpenMovie('filme-1', fakeSnapshot)}>
        abrir-filme
      </button>
    </div>
  ),
}))

vi.mock('./features/movies/MovieDetailScreen', () => ({
  MovieDetailScreen: ({ movieId, onBack }: { movieId: string; onBack: () => void }) => (
    <div>
      <span data-testid="detail-movie-id">{movieId}</span>
      <button type="button" onClick={onBack}>
        voltar
      </button>
    </div>
  ),
}))

function renderApp() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

describe('App — navegação e snapshot de volta do detalhe (feature 017, T025)', () => {
  it('abrir um filme grava o snapshot na tela de origem; voltar do detalhe o devolve em restore', async () => {
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: 'abrir-fonte' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ir-para-filmes' }))

    expect(screen.getByTestId('movies-restore').textContent).toBe('sem-restore')

    fireEvent.click(screen.getByRole('button', { name: 'abrir-filme' }))
    expect(await screen.findByTestId('detail-movie-id')).toHaveTextContent('filme-1')

    fireEvent.click(screen.getByRole('button', { name: 'voltar' }))

    expect(await screen.findByTestId('movies-restore')).toHaveTextContent(JSON.stringify(fakeSnapshot))
  })
})
