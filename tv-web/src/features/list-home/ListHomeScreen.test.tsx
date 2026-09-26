import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListHomeScreen } from './ListHomeScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'
import { db } from '../../lib/catalog/db'
import { buildStableId, markCompleted, updateProgress } from '../../lib/catalog/userStateRepository'

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

function renderScreen(source: SourceOut = makeSource(), onSelect = vi.fn(), onOpenContinueWatching = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ListHomeScreen
        source={source}
        onSelect={onSelect}
        onOpenContinueWatching={onOpenContinueWatching}
        onBack={vi.fn()}
      />
    </QueryClientProvider>,
  )
  return { onSelect, onOpenContinueWatching }
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

describe('ListHomeScreen — "Continuar assistindo" (feature 019, US4)', () => {
  const SOURCE_ID = 'src-1' // mesmo id de makeSource()

  beforeEach(() => {
    vi.mocked(catalogApi.useCatalogCounts).mockReturnValue({
      data: { channels: { categories: 0 }, movies: { categories: 0 }, series: { categories: 0 } },
    } as unknown as ReturnType<typeof catalogApi.useCatalogCounts>)
  })

  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  async function seedMovie(providerStreamId: string, name: string): Promise<number> {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte de teste',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    const [id] = await db.channels.bulkAdd(
      [
        {
          sourceId: SOURCE_ID,
          generation: 1,
          kind: 'movie',
          name,
          originalName: name,
          groupOrder: 0,
          providerStreamId,
        },
      ],
      { allKeys: true },
    )
    return id as number
  }

  it('aparece com item em progresso na seção', async () => {
    await seedMovie('1', 'Duna')
    await updateProgress(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '1' }), SOURCE_ID, 300)

    renderScreen()

    expect(await screen.findByText('Duna')).toBeInTheDocument()
  })

  it('sem nenhum item em progresso, a seção não aparece', () => {
    renderScreen()

    expect(screen.queryByText('Duna')).not.toBeInTheDocument()
  })

  it('item concluído (assistido, sem progresso) não aparece na seção', async () => {
    await seedMovie('2', 'Arrival')
    await markCompleted(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '2' }), SOURCE_ID)

    renderScreen()
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(screen.queryByText('Arrival')).not.toBeInTheDocument()
  })

  it('SELECT num item da seção abre pelo mesmo caminho da navegação normal (onOpenContinueWatching)', async () => {
    const movieId = await seedMovie('3', 'Interstellar')
    await updateProgress(
      buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: '3' }),
      SOURCE_ID,
      300,
    )

    const { onOpenContinueWatching } = renderScreen()
    await screen.findByText('Interstellar')

    fireEvent.keyDown(document, { key: 'ArrowUp' }) // tiles -> "Continuar assistindo"
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(onOpenContinueWatching).toHaveBeenCalledWith(expect.objectContaining({ id: String(movieId), kind: 'movie' }))
  })
})
