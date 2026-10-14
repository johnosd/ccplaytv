import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { VodCategoryRestore, VodShowcaseFocus, VodTarget } from './features/vod/vodTarget'
import type { LiveScreenProps } from './features/live/LiveScreen'
import type { ListSettingsFocus } from './features/settings/tabs/settingsTab'

/**
 * T025 (feature 017), atualizado na feature 023 para o caminho de entrada
 * novo (perfis → Início → destinos): confirma que o `App` grava, na entrada
 * de histórico da tela de origem, o snapshot que `MoviesScreen`/
 * `SeriesScreen` entregam ao abrir um detalhe — e o devolve em `restore`
 * quando a pessoa volta (D-006, fecha o bug de backlog "Voltar do detalhe
 * pra grade não restaura foco nem posição"). As telas pesadas (IndexedDB,
 * virtualização, foco) continuam mockadas e já têm cobertura própria; aqui
 * só o roteamento do `App` está sob teste. O comportamento de teclas do
 * `HomeScreen` fica nos testes próprios; aqui a tela é uma casca controlável.
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

vi.mock('./features/home/HomeScreen', () => ({
  HomeScreen: ({ onNavigate, onOpenFavorites, onLeaveList }: {
    onNavigate: (destination: string, from: unknown) => void
    onOpenFavorites: (destination: string, from: unknown) => void
    onLeaveList: () => void
  }) => <div>
    <button type="button" onClick={() => onLeaveList()}>sair-da-lista</button>
    <button type="button" onClick={() => onNavigate('live', { zone: 'hero', action: 'primary' })}>ir-para-live</button>
    <button type="button" onClick={() => onNavigate('movies', { zone: 'hero', action: 'primary' })}>ir-para-filmes</button>
    <button type="button" onClick={() => onOpenFavorites('movies', { zone: 'rail', rail: 'mylist', itemId: 'x' })}>filmes-n</button>
  </div>,
}))

vi.mock('./features/home/HomeContent', () => ({
  HomeContent: ({
    onNavigate,
    onOpenFavorites,
  }: {
    onNavigate: (destination: string, from: unknown) => void
    onOpenFavorites: (destination: string, from: unknown) => void
  }) => (
    <div>
      <button type="button" onClick={() => onNavigate('live', { zone: 'hero', action: 'primary' })}>
        ir-para-live
      </button>
      <button type="button" onClick={() => onNavigate('movies', { zone: 'hero', action: 'primary' })}>
        ir-para-filmes
      </button>
      <button type="button" onClick={() => onOpenFavorites('movies', { zone: 'rail', rail: 'mylist', itemId: 'x' })}>
        filmes-n
      </button>
    </div>
  ),
}))

const fakeFocus: VodShowcaseFocus = { row: 'categories', id: 'cat:Ação' }
const fakeRestore: VodCategoryRestore = { focusedItemId: 'filme-1', searchTerm: '', searchActive: false, focusedIndexHint: 0 }

// Feature 068: testa a ligação do App; o teclado e o vazio real têm contrato na Live.
vi.mock('./features/live/LiveScreen', () => ({
  LiveScreen: ({ shell, sourceId, onManageCategories, onBack }: LiveScreenProps) => (
    <div data-testid="live-route" data-source-id={sourceId} data-has-shell={String(Boolean(shell))}>
      <button type="button" onClick={onManageCategories}>Gerenciar categorias</button>
      <button type="button" onClick={onBack}>voltar-live</button>
    </div>
  ),
}))

vi.mock('./features/settings/list/ListSettingsScreen', () => ({
  ListSettingsScreen: ({ sourceId, initialFocus, onBack }: {
    sourceId: string
    initialFocus?: ListSettingsFocus
    onBack: () => void
  }) => (
    <div data-testid="list-settings-route" data-source-id={sourceId} data-tab={initialFocus?.tab}>
      <button type="button" onClick={onBack}>voltar-lista</button>
    </div>
  ),
}))

/** Vitrine de Filmes/Séries (feature 052): só o roteamento do `App` está sob teste. */
vi.mock('./features/vod/VodShowcaseScreen', () => ({
  VodShowcaseScreen: ({
    section,
    restore,
    onOpenItem,
    onOpenTarget,
    onBack,
  }: {
    section: 'movies' | 'series'
    restore?: VodShowcaseFocus
    onOpenItem: (itemId: string, from: VodShowcaseFocus) => void
    onOpenTarget: (target: VodTarget, from: VodShowcaseFocus) => void
    onBack: () => void
  }) => (
    <div>
      <span data-testid="showcase-section">{section}</span>
      <span data-testid="showcase-restore">{restore ? JSON.stringify(restore) : 'sem-restore'}</span>
      <button type="button" onClick={() => onOpenItem('filme-1', { row: 'continue', id: 'filme-1' })}>
        abrir-filme
      </button>
      <button type="button" onClick={() => onOpenTarget({ kind: 'category', name: 'Ação' }, fakeFocus)}>
        abrir-categoria
      </button>
      <button type="button" onClick={onBack}>
        voltar-vitrine
      </button>
    </div>
  ),
}))

/** Tela de categoria (grade em tela cheia). */
vi.mock('./features/vod/VodCategoryScreen', () => ({
  VodCategoryScreen: ({
    target,
    restore,
    onOpenItem,
    onBack,
  }: {
    target: VodTarget
    restore?: VodCategoryRestore
    onOpenItem: (itemId: string, restore: VodCategoryRestore) => void
    onBack: () => void
  }) => (
    <div>
      <span data-testid="category-target">{JSON.stringify(target)}</span>
      <span data-testid="category-restore">{restore ? JSON.stringify(restore) : 'sem-restore'}</span>
      <button type="button" onClick={() => onOpenItem('filme-1', fakeRestore)}>
        abrir-filme-da-categoria
      </button>
      <button type="button" onClick={onBack}>
        voltar-categoria
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

describe('App — navegação e foco de volta (feature 017, T025; 023; 052)', () => {
  afterEach(cleanup)

  it('Live sem topbar abre Gerenciar categorias na lista ativa e RETURN restaura Live e Início (068)', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'escolher-fonte' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ir-para-live' }))
    expect(await screen.findByTestId('live-route')).toHaveAttribute('data-has-shell', 'false')
    expect(document.querySelector('.topbar')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar categorias' }))
    const settings = await screen.findByTestId('list-settings-route')
    expect(settings).toHaveAttribute('data-source-id', 'src-1')
    expect(settings).toHaveAttribute('data-tab', 'parental')

    fireEvent.click(screen.getByRole('button', { name: 'voltar-lista' }))
    expect(await screen.findByTestId('live-route')).toHaveAttribute('data-source-id', 'src-1')
    expect(document.querySelector('.topbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'voltar-live' }))
    expect(await screen.findByRole('button', { name: 'ir-para-live' })).toBeInTheDocument()
  })

  async function openMovies() {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'escolher-fonte' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ir-para-filmes' }))
  }

  it('abrir um filme na vitrine guarda o foco na tela de origem; voltar do detalhe o devolve em restore', async () => {
    await openMovies()
    expect(await screen.findByTestId('showcase-restore')).toHaveTextContent('sem-restore')

    fireEvent.click(screen.getByRole('button', { name: 'abrir-filme' }))
    expect(await screen.findByTestId('detail-movie-id')).toHaveTextContent('filme-1')
    fireEvent.click(screen.getByRole('button', { name: 'voltar' }))

    expect(await screen.findByTestId('showcase-restore')).toHaveTextContent(JSON.stringify({ row: 'continue', id: 'filme-1' }))
  })

  // Feature 052: vitrine → categoria → detalhe → voltar ×2 restaura cada tela (foco por id).
  it('vitrine → categoria → detalhe: cada RETURN restaura a tela anterior com o foco que ela guardou', async () => {
    await openMovies()

    fireEvent.click(await screen.findByRole('button', { name: 'abrir-categoria' }))
    expect(await screen.findByTestId('category-target')).toHaveTextContent(JSON.stringify({ kind: 'category', name: 'Ação' }))
    expect(await screen.findByTestId('category-restore')).toHaveTextContent('sem-restore')

    fireEvent.click(screen.getByRole('button', { name: 'abrir-filme-da-categoria' }))
    expect(await screen.findByTestId('detail-movie-id')).toHaveTextContent('filme-1')
    fireEvent.click(screen.getByRole('button', { name: 'voltar' }))

    // Detalhe → categoria, com o estado da grade.
    expect(await screen.findByTestId('category-restore')).toHaveTextContent(JSON.stringify(fakeRestore))
    fireEvent.click(screen.getByRole('button', { name: 'voltar-categoria' }))

    // Categoria → vitrine, com o foco por id do cartão de origem.
    expect(await screen.findByTestId('showcase-restore')).toHaveTextContent(JSON.stringify(fakeFocus))
  })

  // Início → "Filmes (N)" (feature 026, FR-014): abre a grade de ★ Favoritos; RETURN volta ao Início.
  it('"Filmes (N)" do Início abre a categoria ★ Favoritos e RETURN volta ao Início', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'escolher-fonte' }))
    fireEvent.click(await screen.findByRole('button', { name: 'filmes-n' }))

    expect(await screen.findByTestId('category-target')).toHaveTextContent(JSON.stringify({ kind: 'favorites' }))
    fireEvent.click(screen.getByRole('button', { name: 'voltar-categoria' }))
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

  it('RETURN no Início encerra a lista e volta aos perfis com foco por id (070/US4)', async () => {
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'escolher-fonte' }))
    fireEvent.click(await screen.findByRole('button', { name: 'sair-da-lista' }))
    expect(await screen.findByTestId('profiles-initial-focus')).toHaveTextContent('src-1')
  })
})

