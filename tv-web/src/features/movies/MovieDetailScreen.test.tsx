import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MovieDetailScreen } from './MovieDetailScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut } from '../catalog/catalogApi'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCatalogItem: vi.fn(),
    // Nunca resolve: mantém a camada de reprodução em "resolving" (mostrando
    // o diálogo), sem precisar de um adaptador de motor real nestes testes —
    // o que importa aqui é a navegação da tela, não a máquina de estados do
    // player (já coberta em PlayerLayer.test.tsx).
    fetchPlayback: vi.fn(() => new Promise(() => {})),
  }
})

const MOVIE: CatalogItemOut = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Duna',
  original_group: 'Ficção científica',
  published: true,
  playable: true,
}

function queryResult(data: CatalogItemOut | null, isLoading = false) {
  return { data, isLoading } as ReturnType<typeof catalogApi.useCatalogItem>
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('MovieDetailScreen', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(MOVIE))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('a ação primária "Assistir" é focada por padrão (FR-015, logic §5)', () => {
    render(<MovieDetailScreen movieId="movie-1" onBack={() => {}} />)

    expect(screen.getByText('▶ Assistir').className).toContain('tv-focus')
    expect(screen.getByText('▶ Trailer').className).not.toContain('tv-focus')
  })

  it('SELECT em Assistir abre a camada de reprodução', () => {
    render(<MovieDetailScreen movieId="movie-1" onBack={() => {}} />)

    press('Enter')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('SELECT repetido (ou tecla mantida) não abre uma segunda camada (FR-010)', () => {
    render(<MovieDetailScreen movieId="movie-1" onBack={() => {}} />)

    press('Enter')
    press('Enter')
    press('Enter')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('Trailer continua como placeholder — fora de escopo desta feature', () => {
    render(<MovieDetailScreen movieId="movie-1" onBack={() => {}} />)

    press('ArrowLeft') // move o foco pra Trailer (índice 0)
    press('Enter')

    expect(screen.getByText('Reproduzindo trailer...')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('o botão "Voltar" do estado de erro é ativável por OK do controle (R-005)', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null))
    const onBack = vi.fn()
    render(<MovieDetailScreen movieId="movie-1" onBack={onBack} />)

    expect(screen.getByText('Este filme não está mais no catálogo.')).toBeInTheDocument()
    press('Enter')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('o botão "Voltar" do estado de carregando também é ativável por OK (R-005)', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null, true))
    const onBack = vi.fn()
    render(<MovieDetailScreen movieId="movie-1" onBack={onBack} />)

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    press('Enter')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('RETURN sempre volta, mesmo no estado de erro', () => {
    vi.mocked(catalogApi.useCatalogItem).mockReturnValue(queryResult(null))
    const onBack = vi.fn()
    render(<MovieDetailScreen movieId="movie-1" onBack={onBack} />)

    press('Escape')

    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
