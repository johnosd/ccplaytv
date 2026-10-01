import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PersonScreen, type PersonScreenProps } from './PersonScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { PersonCreditsResult, ResolvedTitle } from '../../lib/metadata/types'
import { findUnnamedControls } from '../../testing/accessibleNames'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, usePersonCredits: vi.fn(), usePersonTitles: vi.fn() }
})

// `Rail` só precisa da largura do contêiner (jsdom não faz layout).
let restoreOffsetWidth: PropertyDescriptor | undefined
beforeAll(() => {
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1600 })
})
afterAll(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const FOUND_A: ResolvedTitle = { key: 'tmdb:movie:1', tmdbId: 1, kind: 'movie', title: 'Achado A', year: 1999, localItemId: '11' }
const FOUND_B: ResolvedTitle = { key: 'tmdb:series:2', tmdbId: 2, kind: 'series', title: 'Achada B', year: 2005, localItemId: '12' }
const MISSING: ResolvedTitle = { key: 'tmdb:movie:3', tmdbId: 3, kind: 'movie', title: 'Perdido', year: 2010, overview: 'Resumo do perdido.' }

const OK: PersonCreditsResult = {
  status: 'ok',
  person: { personId: 6384, name: 'Keanu Reeves', credits: [FOUND_A, FOUND_B, MISSING] },
}

function credits(data: PersonCreditsResult | undefined, isLoading = false) {
  const refetch = vi.fn()
  vi.mocked(catalogApi.usePersonCredits).mockReturnValue({ data, isLoading, refetch } as unknown as ReturnType<typeof catalogApi.usePersonCredits>)
  return refetch
}

function titles(list: ResolvedTitle[] | undefined) {
  vi.mocked(catalogApi.usePersonTitles).mockReturnValue({
    data: list && { titles: list, coverage: { movie: { covered: 2, total: 5 }, series: { covered: 1, total: 3 } } },
    isLoading: list === undefined,
  } as unknown as ReturnType<typeof catalogApi.usePersonTitles>)
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function renderScreen(props: Partial<PersonScreenProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonScreen personId={6384} personName="Keanu" sourceId="src1" onOpenTitle={() => {}} onBack={() => {}} {...props} />
    </QueryClientProvider>,
  )
}

describe('PersonScreen', () => {
  it('carregando: mostra o nome já conhecido e "Voltar" focado, ativável por OK', () => {
    credits(undefined, true)
    titles(undefined)
    const onBack = vi.fn()
    const { container } = renderScreen({ onBack })
    expect(screen.getByText('Keanu')).toBeInTheDocument()
    expect(screen.getByText('Carregando a filmografia…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' }).className).toContain('tv-focus')
    expect(findUnnamedControls(container)).toEqual([])
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('erro de serviço: "Tentar de novo" focado só refaz a consulta; ←/→ chegam a "Voltar"', () => {
    const refetch = credits({ status: 'error', reason: 'offline' })
    titles(undefined)
    const onBack = vi.fn()
    const { container } = renderScreen({ onBack })
    expect(screen.getByText('Não foi possível carregar a filmografia agora.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' }).className).toContain('tv-focus')
    press('Enter')
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(onBack).not.toHaveBeenCalled()
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Voltar' }).className).toContain('tv-focus')
    press('Enter')
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(findUnnamedControls(container)).toEqual([])
  })

  it('sem chave e vazio: mensagem própria, só "Voltar" focável', () => {
    credits({ status: 'error', reason: 'no_key' })
    titles(undefined)
    renderScreen()
    expect(screen.getByText('A chave do TMDB foi removida.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' }).className).toContain('tv-focus')

    cleanup()
    credits({ status: 'ok', person: { personId: 1, name: 'X', credits: [] } })
    titles([])
    renderScreen()
    expect(screen.getByText('O TMDB não tem filmes nem séries com esta pessoa.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' }).className).toContain('tv-focus')
  })

  it('dois rails na ordem (encontrados, depois fora da lista), cobertura com os dois tipos e chip só nos não encontrados', () => {
    credits(OK)
    titles([FOUND_A, FOUND_B, MISSING])
    const { container } = renderScreen()
    expect(screen.getByText('Procurado em 2 de 5 categorias de filmes e 1 de 3 de séries')).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Na sua lista (2)', 'Fora da sua lista (1)'])
    expect(screen.getAllByText('Não encontrado na sua lista')).toHaveLength(1)
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(1)
    expect(findUnnamedControls(container)).toEqual([])
  })

  it('OK num encontrado abre o detalhe com a chave; num não encontrado abre o resumo e RETURN o fecha sem sair', () => {
    credits(OK)
    titles([FOUND_A, FOUND_B, MISSING])
    const onOpenTitle = vi.fn()
    const onBack = vi.fn()
    renderScreen({ onOpenTitle, onBack })

    press('ArrowRight')
    press('Enter')
    expect(onOpenTitle).toHaveBeenCalledWith({ kind: 'series', itemId: '12' }, { focusKey: 'tmdb:series:2' })

    press('ArrowDown')
    press('Enter')
    expect(within(screen.getByRole('dialog')).getByText('Resumo do perdido.')).toBeInTheDocument()
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onBack).not.toHaveBeenCalled()
    press('Escape')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('restore por chave: monta já no item; chave ausente cai no primeiro item do primeiro rail', () => {
    credits(OK)
    titles([FOUND_A, FOUND_B, MISSING])
    const onOpenTitle = vi.fn()
    renderScreen({ onOpenTitle, restore: { focusKey: 'tmdb:series:2' } })
    press('Enter')
    expect(onOpenTitle).toHaveBeenLastCalledWith({ kind: 'series', itemId: '12' }, { focusKey: 'tmdb:series:2' })

    cleanup()
    onOpenTitle.mockClear()
    renderScreen({ onOpenTitle, restore: { focusKey: 'tmdb:movie:999' } })
    press('Enter')
    expect(onOpenTitle).toHaveBeenCalledWith({ kind: 'movie', itemId: '11' }, { focusKey: 'tmdb:movie:1' })
  })
})
