import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListHomeScreen } from './ListHomeScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'

afterEach(cleanup)

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogCounts: vi.fn() }
})

function makeSource(overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id: 'src-1',
    type: 'm3u_url',
    display_name: 'Minha fonte',
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: null,
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

function renderScreen(source: SourceOut = makeSource(), onSelect = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ListHomeScreen source={source} onSelect={onSelect} onBack={vi.fn()} />
    </QueryClientProvider>,
  )
  return { onSelect }
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

describe('ListHomeScreen — explicação do Modo limitado (feature 014, US2)', () => {
  beforeEach(() => {
    vi.mocked(catalogApi.useCatalogCounts).mockReturnValue({
      data: {
        channels: { categories: 1 },
        movies: { categories: 0 },
        series: { categories: 0 },
      },
    } as unknown as ReturnType<typeof catalogApi.useCatalogCounts>)
  })

  it('a explicação aparece quando a fonte está em Modo limitado', () => {
    renderScreen(makeSource({ provider_import_mode: 'legacy_m3u', limited_reason: 'protocol_unavailable' }))

    expect(screen.getByText('Modo limitado')).toBeInTheDocument()
  })

  it('a explicação não aparece para fonte normal (protocolo completo, ou nunca sincronizada)', () => {
    renderScreen(makeSource({ provider_import_mode: 'xtream_api' }))

    expect(screen.queryByText('Modo limitado')).not.toBeInTheDocument()
  })

  it('a explicação não aparece para URL M3U avulsa (sem modo)', () => {
    renderScreen(makeSource({ provider_import_mode: null }))

    expect(screen.queryByText('Modo limitado')).not.toBeInTheDocument()
  })

  it('as três tiles continuam navegáveis e SELECT ainda abre o destino, mesmo com a explicação na tela', () => {
    const { onSelect } = renderScreen(
      makeSource({ provider_import_mode: 'legacy_m3u', limited_reason: 'protocol_unavailable' }),
    )

    expect(screen.getByText('Modo limitado')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('movies')
  })
})
