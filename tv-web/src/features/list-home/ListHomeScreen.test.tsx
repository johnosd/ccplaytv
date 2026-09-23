import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListHomeScreen } from './ListHomeScreen'
import * as catalogApi from '../catalog/catalogApi'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogCounts: vi.fn() }
})

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ListHomeScreen sourceId="src-1" sourceName="Minha fonte" onSelect={vi.fn()} onBack={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('ListHomeScreen — contagem honesta por seção (sdd-converge C-001)', () => {
  it('mostra a contagem real de Live TV, não mais o rótulo fixo antigo', () => {
    vi.mocked(catalogApi.useCatalogCounts).mockReturnValue({
      data: {
        channels: { items: 42, categories: 5 },
        movies: { categories: 0 },
        series: { categories: 0 },
      },
    } as unknown as ReturnType<typeof catalogApi.useCatalogCounts>)

    renderScreen()

    expect(screen.getByText('42 títulos')).toBeInTheDocument()
    expect(screen.queryByText('Canais em tempo real')).not.toBeInTheDocument()
  })

  it('sem contagem de itens conhecida, Live TV cai no piso de categorias — nunca "0" (FR-014)', () => {
    vi.mocked(catalogApi.useCatalogCounts).mockReturnValue({
      data: {
        channels: { categories: 7 },
        movies: { categories: 0 },
        series: { categories: 0 },
      },
    } as unknown as ReturnType<typeof catalogApi.useCatalogCounts>)

    renderScreen()

    expect(screen.getByText('7 categorias')).toBeInTheDocument()
  })
})
