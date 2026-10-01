import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { CategoryScreenSnapshot } from './features/catalog/categoryScreenSnapshot'
import type { VodShellProps } from './features/vod/vodShell'

/**
 * T025 (feature 017), atualizado na feature 023 para o caminho de entrada
 * novo (perfis → Início → destinos): confirma que o `App` grava, na entrada
 * de histórico da tela de origem, o snapshot que `MoviesScreen`/
 * `SeriesScreen` entregam ao abrir um detalhe — e o devolve em `restore`
 * quando a pessoa volta (D-006, fecha o bug de backlog "Voltar do detalhe
 * pra grade não restaura foco nem posição"). As telas pesadas (IndexedDB,
 * virtualização, foco) continuam mockadas e já têm cobertura própria; aqui
 * só o roteamento do `App` está sob teste. O `HomeScreen` (Início) não é
 * mockado: é uma casca fina sobre `AppShell`/`TopBar`/`HomeContent` (feature
 * 026) sem IndexedDB própria — mockar `HomeContent` já basta.
 */

vi.mock('./lib/tizenColorKey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/tizenColorKey')>()),
  registerFavoriteColorKey: vi.fn(),
  registerRemoveColorKey: vi.fn(() => false),
}))

vi.mock('./features/splash/SplashScreen', () => ({
  SplashScreen: ({ onFinished }: { onFinished: () => void }) => {
    onFinished()
    return null
  },
}))

vi.mock('./features/profiles/ProfilesScreen', () => ({
  ADD_LIST_FOCUS_ID: '__add__',
  ProfilesScreen: ({
    onChooseSource,
    onAddSource,
    initialFocusSourceId,
  }: {
    onChooseSource: (source: unknown) => void
    onAddSource: () => void
    initialFocusSourceId?: string | null
  }) => (
    <div>
      <span data-testid="profiles-initial-focus">{String(initialFocusSourceId ?? 'sem-foco')}</span>
      <button type="button" onClick={onAddSource}>
        adicionar-lista
      </button>
      <button
        type="button"
        onClick={() =>
          onChooseSource({
            id: 'src-1',
            type: 'm3u_url',
            display_name: 'Fonte 1',
            connection_state: 'synced',
            last_successful_sync_at: null,
            provider_import_mode: null,
            limited_reason: null,
            provider_dns: null,
            last_truncated_by_storage: false,
            last_discarded_by_type: 0,
          })
        }
      >
        escolher-fonte
      </button>
    </div>
  ),
}))

vi.mock('./features/import/AddSourceScreen', () => ({
  AddSourceScreen: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      voltar-cadastro
    </button>
  ),
}))

vi.mock('./features/home/HomeContent', () => ({
  HomeContent: ({ onNavigate }: { onNavigate: (destination: string, from: unknown) => void }) => (
    <button type="button" onClick={() => onNavigate('movies', { zone: 'hero', action: 'primary' })}>
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
    onBack,
    shell,
  }: {
    restore?: CategoryScreenSnapshot
    onOpenMovie: (movieId: string, snapshot?: CategoryScreenSnapshot) => void
    onBack: () => void
    shell?: VodShellProps
  }) => (
    <div>
      <span data-testid="movies-restore">{restore ? JSON.stringify(restore) : 'sem-restore'}</span>
      <button type="button" onClick={() => onOpenMovie('filme-1', fakeSnapshot)}>
        abrir-filme
      </button>
      <button type="button" onClick={onBack}>
        voltar-filmes
      </button>
      {shell && (
        <>
          <button type="button" onClick={shell.onGoHome}>
            shell-go-home
          </button>
          <button type="button" onClick={() => shell.onSwitchTop('series')}>
            shell-switch-series
          </button>
        </>
      )}
    </div>
  ),
}))

vi.mock('./features/series/SeriesScreen', () => ({
  SeriesScreen: ({ onBack }: { onBack: () => void }) => (
    <div>
      <span data-testid="series-screen">séries</span>
      <button type="button" onClick={onBack}>
        voltar-series
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

describe('App — navegação e snapshot de volta do detalhe (feature 017, T025; feature 023, entrada nova)', () => {
  afterEach(cleanup)

  it('abrir um filme grava o snapshot na tela de origem; voltar do detalhe o devolve em restore', async () => {
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: 'escolher-fonte' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ir-para-filmes' }))

    expect(screen.getByTestId('movies-restore').textContent).toBe('sem-restore')

    fireEvent.click(screen.getByRole('button', { name: 'abrir-filme' }))
    expect(await screen.findByTestId('detail-movie-id')).toHaveTextContent('filme-1')

    fireEvent.click(screen.getByRole('button', { name: 'voltar' }))

    expect(await screen.findByTestId('movies-restore')).toHaveTextContent(JSON.stringify(fakeSnapshot))
  })

  // T036 (feature 025, D-003 do plan.md): `App` passa `shell` a
  // `MoviesScreen`/`SeriesScreen` — `onSwitchTop` troca de destino sem
  // empilhar (mesmo padrão da Live, feature 024), e `onGoHome`/RETURN volta
  // ao Início.
  it('shell.onSwitchTop troca de Filmes para Séries sem empilhar; shell.onGoHome volta ao Início', async () => {
    renderApp()

    fireEvent.click(await screen.findByRole('button', { name: 'escolher-fonte' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ir-para-filmes' }))

    fireEvent.click(await screen.findByRole('button', { name: 'shell-switch-series' }))
    expect(await screen.findByTestId('series-screen')).toBeInTheDocument()

    // Sem pilha: RETURN em Séries (chamando o mesmo onBack que a tela usa)
    // volta direto ao Início, não a Filmes — switch-top nunca empilha.
    fireEvent.click(screen.getByRole('button', { name: 'voltar-series' }))
    expect(await screen.findByRole('button', { name: 'ir-para-filmes' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ir-para-filmes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'shell-go-home' }))
    expect(await screen.findByRole('button', { name: 'ir-para-filmes' })).toBeInTheDocument()
  })

  // Feature 037, FR-019/D-007: o cadastro aberto pela tela de listas volta
  // com o foco em "Adicionar lista", não na última lista usada.
  it('abrir o cadastro pela tela de listas e voltar deixa o foco em "Adicionar lista"', async () => {
    renderApp()

    expect(await screen.findByTestId('profiles-initial-focus')).not.toHaveTextContent('__add__')
    fireEvent.click(screen.getByRole('button', { name: 'adicionar-lista' }))
    fireEvent.click(await screen.findByRole('button', { name: 'voltar-cadastro' }))

    expect(await screen.findByTestId('profiles-initial-focus')).toHaveTextContent('__add__')
  })
})
