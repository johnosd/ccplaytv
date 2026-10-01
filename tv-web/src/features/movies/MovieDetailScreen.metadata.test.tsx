import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'
import type { TitleMetadataView } from '../../lib/metadata/types'
import { db } from '../../lib/catalog/db'
import { findUnnamedControls } from '../../testing/accessibleNames'

/** Feature 032 — casos extras do detalhe de filme (o contrato cobre o caminho principal). */
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogItem: vi.fn(), useTitleMetadata: vi.fn() }
})
vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(() => <div role="dialog" aria-label="Reproduzindo" />),
}))

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
  year: 2021,
}

const LONG = `${'Uma frase longa para a sinopse passar do limite. '.repeat(6)}Fim.`
const EXACTLY_LIMIT = 'x'.repeat(220)

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
      <MovieDetailScreen movieId="movie-1" onBack={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await db.userStates.clear()
  vi.mocked(catalogApi.useCatalogItem).mockReturnValue({ data: MOVIE, isLoading: false } as ReturnType<typeof catalogApi.useCatalogItem>)
  metadata(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MovieDetailScreen — metadata (feature 032)', () => {
  it('sinopse até 220 caracteres não tem "Ver mais" e ↑ nas ações não move o foco para lugar nenhum (D-007)', () => {
    metadata({ synopsis: { value: EXACTLY_LIMIT, origin: 'provider' } })
    renderScreen()
    expect(screen.queryByRole('button', { name: /Ver mais/ })).not.toBeInTheDocument()
    press('ArrowUp')
    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
  })

  it('a sinopse some enquanto "Ver mais" está focado: o foco cai nas ações, nunca em nada', () => {
    metadata({ synopsis: { value: LONG, origin: 'provider' } })
    const view = renderScreenWithRerender()
    press('ArrowUp')
    expect(screen.getByRole('button', { name: /Ver mais/ }).className).toContain('tv-focus')

    metadata(undefined)
    view.rerender()
    expect(screen.queryByRole('button', { name: /Ver mais/ })).not.toBeInTheDocument()
    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
  })

  it('sinopse do TMDB em idioma original mostra o selo com o idioma; a do provedor não tem selo (FR-021/FR-022)', () => {
    metadata({ synopsis: { value: 'A story.', origin: 'tmdb', language: 'en' } })
    renderScreen()
    expect(screen.getByText('Dados: TMDB · em inglês')).toBeInTheDocument()

    cleanup()
    metadata({ synopsis: { value: 'Uma história.', origin: 'provider' } })
    renderScreen()
    expect(screen.queryByText(/Dados: TMDB/)).not.toBeInTheDocument()
  })

  it('aba Detalhes: Gênero, Duração, Direção, País e Elenco só com valor real, sem trocar a categoria da fonte (FR-003/FR-007)', () => {
    metadata({
      genres: { value: 'Terror', origin: 'provider' },
      durationSeconds: { value: 6631, origin: 'provider' },
      director: { value: 'Fulano', origin: 'provider' },
      country: { value: 'United States of America', origin: 'provider' },
      cast: { value: 'A, B, C', origin: 'provider' },
    })
    renderScreen()
    expect(screen.getByText('Duração').nextSibling?.textContent).toBe('1 h 50 min')
    expect(screen.getByText('Gênero').nextSibling?.textContent).toBe('Terror')
    expect(screen.getByText('Direção').nextSibling?.textContent).toBe('Fulano')
    expect(screen.getByText('País').nextSibling?.textContent).toBe('United States of America')
    const facts = within(document.querySelector('dl') as HTMLElement)
    expect(facts.getByText('Elenco').nextSibling?.textContent).toBe('A, B, C')
    // A categoria continua a declarada pela fonte.
    expect(screen.getByText('Categoria').nextSibling?.textContent).toBe('Ficção científica')
  })

  function openCastTab() {
    press('ArrowDown') // ações → abas (foco em Detalhes)
    press('ArrowRight') // Elenco
    press('Enter')
  }

  it('aba Elenco (ad-hoc T044): lista os nomes, sem repetir nem deixar nome vazio, com o selo só se veio do TMDB', () => {
    metadata({ cast: { value: 'Atriz Um, Ator Dois; Atriz Um,  , Terceira Pessoa', origin: 'provider' } })
    renderScreen()
    openCastTab()

    const list = screen.getByRole('list', { name: 'Elenco' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Atriz Um', 'Ator Dois', 'Terceira Pessoa'])
    expect(screen.queryByText(/Dados: TMDB/)).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Elenco' })).toHaveClass('tv-focus') // o foco continua na fileira de abas

    cleanup()
    metadata({ cast: { value: 'Atriz TMDB', origin: 'tmdb' } })
    renderScreen()
    openCastTab()
    expect(screen.getByText('Dados: TMDB')).toBeInTheDocument()
  })

  it('aba Elenco sem elenco informado: mensagem honesta (ou "Carregando" enquanto a metadata não chegou), nunca nome inventado', () => {
    metadata({ synopsis: { value: 'Só sinopse.', origin: 'provider' } })
    renderScreen()
    openCastTab()
    expect(screen.getByText('O elenco deste título não foi informado.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Elenco' })).not.toBeInTheDocument()

    cleanup()
    vi.mocked(catalogApi.useTitleMetadata).mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof catalogApi.useTitleMetadata>)
    renderScreen()
    openCastTab()
    expect(screen.getByText('Carregando o elenco…')).toBeInTheDocument()
  })

  it('voltar de Elenco para Detalhes mostra os fatos de novo (a aba é só troca de painel)', () => {
    metadata({ genres: { value: 'Terror', origin: 'provider' }, cast: { value: 'A, B', origin: 'provider' } })
    renderScreen()
    openCastTab()
    press('ArrowLeft') // Detalhes
    press('Enter')
    expect(screen.getByRole('tab', { name: 'Detalhes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Gênero')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Elenco' })).not.toBeInTheDocument()
  })

  it('backdrop do TMDB leva o selo "Dados: TMDB" (FR-022, T046); o do provedor não; imagem que falha some com o selo', () => {
    metadata({ backdropUrl: { value: 'http://img.test/tmdb.jpg', origin: 'tmdb' } })
    renderScreen()
    const tag = document.querySelector('.vod-detail-hero .vod-detail-backdrop-origin')
    expect(tag?.textContent).toBe('Dados: TMDB')
    expect(tag?.closest('[aria-hidden="true"]')).toBeNull() // fora do contêiner decorativo: a origem é lida
    fireEvent.error(document.querySelector('.vod-detail-backdrop img')!)
    expect(document.querySelector('.vod-detail-backdrop-origin')).toBeNull()

    cleanup()
    metadata({ backdropUrl: { value: 'http://img.test/provedor.jpg', origin: 'provider' } })
    renderScreen()
    expect(document.querySelector('.vod-detail-backdrop img')).not.toBeNull()
    expect(document.querySelector('.vod-detail-backdrop-origin')).toBeNull()
    expect(screen.queryByText(/Dados: TMDB/)).not.toBeInTheDocument()
  })

  it('backdrop com falha de carga some; sem falha, é <img> dentro do hero', () => {
    metadata({ backdropUrl: { value: 'http://img.test/bd.jpg', origin: 'provider' } })
    renderScreen()
    const img = document.querySelector<HTMLImageElement>('.vod-detail-hero .vod-detail-backdrop img')
    expect(img).not.toBeNull()
    fireEvent.error(img!)
    expect(document.querySelector('.vod-detail-backdrop')).toBeNull()
  })

  it('o modal da sinopse rola por ↑/↓ e OK fecha; todo controle tem nome acessível (feature 028, FR-015)', () => {
    metadata({ synopsis: { value: LONG, origin: 'provider' } })
    renderScreen()
    press('ArrowUp')
    press('Enter')
    const dialog = screen.getByRole('dialog', { name: 'Sinopse completa' })
    const text = dialog.querySelector('.synopsis-modal-text') as HTMLElement
    press('ArrowDown')
    expect(text.scrollTop).toBeGreaterThan(0)
    press('ArrowUp')
    expect(text.scrollTop).toBe(0)
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
    press('Enter')
    expect(within(document.body).queryByRole('dialog', { name: 'Sinopse completa' })).not.toBeInTheDocument()
  })
})

/** `render` que devolve um `rerender()` com o mesmo provider — o hook mockado é relido a cada render. */
function renderScreenWithRerender() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Elemento NOVO a cada render: reusar o mesmo elemento faria o React pular a reconciliação.
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen movieId="movie-1" onBack={() => {}} />
    </QueryClientProvider>
  )
  const { rerender } = render(tree())
  return { rerender: () => rerender(tree()) }
}
