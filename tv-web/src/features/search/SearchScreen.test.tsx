import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SearchScreen, type SearchScreenProps } from './SearchScreen'
import type { SearchSnapshot } from './searchSnapshot'
import { db } from '../../lib/catalog/db'

/**
 * Testes de comportamento de `SearchScreen` (feature 026, T035) — contra
 * `fake-indexeddb` de verdade (mesmo padrão de `HomeContent.test.tsx`):
 * `useGlobalSearchResult`/`useGlobalSearchIndex` não são mockados.
 */

const SOURCE_ID = 'source-search'

let restoreOffsetWidth: PropertyDescriptor | undefined
beforeAll(() => {
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1600 })
})
afterAll(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
})

async function seedSource(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
}

async function seedCategory(kind: 'channel' | 'movie' | 'series', order = 0): Promise<void> {
  await db.categories.add({ sourceId: SOURCE_ID, generation: 1, kind, fetchMode: 'eager', order, name: 'Grupo' })
}

async function seedMovie(name: string, streamId: string): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name, originalName: name, groupOrder: 0, providerStreamId: streamId }],
    { allKeys: true },
  )
  return id as number
}

async function seedSeries(name: string, seriesId: string): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', name, originalName: name, groupOrder: 0, seriesId }],
    { allKeys: true },
  )
  return id as number
}

async function seedChannel(name: string, streamId: string): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', name, originalName: name, groupOrder: 0, providerStreamId: streamId }],
    { allKeys: true },
  )
  return id as number
}

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

function renderSearch(overrides: Partial<SearchScreenProps> = {}) {
  const props: SearchScreenProps = {
    sourceId: SOURCE_ID,
    onOpenItem: vi.fn(),
    onOpenChannel: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<SearchScreen {...props} />, { wrapper: Wrapper })
  return props
}

async function typeTerm(value: string) {
  const field = screen.getByLabelText('Buscar nesta lista') as HTMLInputElement
  await act(async () => fireEvent.change(field, { target: { value } }))
}

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
})

describe('SearchScreen — abertura e digitação (US3/AC1-AC3)', () => {
  it('abre com o campo focado, sem abrir o teclado sozinho; aviso de cobertura sempre visível', async () => {
    await seedSource()
    await seedCategory('channel')
    await seedCategory('movie')
    renderSearch()

    const field = screen.getByLabelText('Buscar nesta lista')
    expect(field.closest('.text-field')).toHaveClass('tv-focus')
    expect(document.activeElement).not.toBe(field)
    await waitFor(() => expect(screen.getByText('Busca em 2 de 2 categorias')).toBeInTheDocument())
  })

  it('menos de 2 caracteres: nenhum resultado, mesmo com itens que combinam', async () => {
    await seedSource()
    await seedCategory('movie')
    await seedMovie('Duna', 'd1')
    renderSearch()

    await typeTerm('d')
    expect(screen.queryByText(/Filmes \(/)).not.toBeInTheDocument()
    expect(screen.queryByText('Duna')).not.toBeInTheDocument()
  })

  it('rails só aparecem para os tipos com resultado, na ordem Canais/Filmes/Séries', async () => {
    await seedSource()
    await seedCategory('channel')
    await seedCategory('movie')
    await seedCategory('series')
    await seedMovie('Duna', 'd1')
    await seedChannel('Globo', 'c1')
    renderSearch()

    await typeTerm('du')
    await waitFor(() => expect(screen.getByText('Filmes (1)')).toBeInTheDocument())
    expect(screen.queryByText(/Canais \(/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Séries \(/)).not.toBeInTheDocument()
    expect(screen.getByText('Duna')).toBeInTheDocument()
  })

  it('sem resultado: estado vazio com a cobertura repetida e "Editar busca" focável', async () => {
    await seedSource()
    await seedCategory('movie')
    await seedMovie('Duna', 'd1')
    renderSearch()

    await typeTerm('zzz')
    await waitFor(() => {
      expect(screen.getByText('Nada encontrado para "zzz"')).toBeInTheDocument()
      expect(screen.getAllByText('Busca em 1 de 1 categorias').length).toBeGreaterThan(0)
    })
    expect(screen.getByRole('button', { name: 'Editar busca' })).toHaveClass('tv-focus')
  })
})

describe('SearchScreen — RETURN em camadas (FR-036, FR-044)', () => {
  it('OK no campo abre o teclado; RETURN com o teclado aberto só fecha, sem sair da tela', async () => {
    await seedSource()
    const props = renderSearch()

    press('Enter') // abre o teclado
    const field = screen.getByLabelText('Buscar nesta lista') as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(field))

    press('Escape')
    await waitFor(() => expect(document.activeElement).not.toBe(field))
    expect(props.onBack).not.toHaveBeenCalled()

    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })
})

describe('SearchScreen — abrir resultado (US3/AC5-AC6, FR-041/FR-042)', () => {
  it('OK num filme chama onOpenItem com o item e o snapshot de origem', async () => {
    await seedSource()
    await seedCategory('movie')
    const id = await seedMovie('Duna', 'd1')
    const props = renderSearch()

    await typeTerm('du')
    await waitFor(() => expect(screen.getByText('Duna')).toBeInTheDocument())
    press('ArrowDown') // campo -> rail de filmes
    press('Enter')

    expect(props.onOpenItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: String(id), name: 'Duna' }),
      { term: 'du', focus: { row: 'results', kind: 'movie', itemId: String(id) } },
    )
  })

  it('OK num canal chama onOpenChannel', async () => {
    await seedSource()
    await seedCategory('channel')
    const id = await seedChannel('Globo', 'c1')
    const props = renderSearch()

    await typeTerm('glo')
    await waitFor(() => expect(screen.getByText('Globo')).toBeInTheDocument())
    press('ArrowDown')
    press('Enter')

    expect(props.onOpenChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: String(id), name: 'Globo' }),
      { term: 'glo', focus: { row: 'results', kind: 'channel', itemId: String(id) } },
    )
  })
})

describe('SearchScreen — restauração por id (FR-042)', () => {
  it('restaura o termo e o foco no resultado certo, sem reabrir o teclado', async () => {
    await seedSource()
    await seedCategory('series')
    const alfaId = await seedSeries('Alfa', 's1')
    const betaId = await seedSeries('Beta', 's2')
    void alfaId

    const restore: SearchSnapshot = { term: 'be', focus: { row: 'results', kind: 'series', itemId: String(betaId) } }
    renderSearch({ restore })

    const field = screen.getByLabelText('Buscar nesta lista') as HTMLInputElement
    expect(field.value).toBe('be')
    expect(document.activeElement).not.toBe(field)

    await waitFor(() => {
      const focused = document.querySelector('.search-row .tv-focus')
      expect(focused?.closest('.content-card')?.querySelector('.content-card-title')?.textContent).toBe('Beta')
    })
  })
})
