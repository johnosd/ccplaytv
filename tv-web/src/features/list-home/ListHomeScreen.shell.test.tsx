import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListHomeScreen, type ListHomeScreenProps } from './ListHomeScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'
import { db } from '../../lib/catalog/db'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'

// Feature 023 (T018): o que o conteúdo do Início ganhou ao virar um dos dois
// escopos do shell — `active`, `onExitUp` e `initialFocus`. As regras
// anteriores (contagens honestas, Modo limitado, "Continuar assistindo") ficam
// em `ListHomeScreen.test.tsx`.

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogCounts: vi.fn() }
})

const SOURCE_ID = 'src-1'

function makeSource(): SourceOut {
  return {
    id: SOURCE_ID,
    type: 'm3u_url',
    display_name: 'Minha fonte',
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: null,
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
  }
}

function renderScreen(overrides: Partial<ListHomeScreenProps> = {}) {
  const props: ListHomeScreenProps = {
    source: makeSource(),
    onSelect: vi.fn(),
    onOpenContinueWatching: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ListHomeScreen {...props} />
    </QueryClientProvider>,
  )
  return { ...props, queryClient }
}

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

const tile = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(() => {
  vi.mocked(catalogApi.useCatalogCounts).mockReturnValue({
    data: { channels: { categories: 1 }, movies: { categories: 1 }, series: { categories: 1 } },
  } as unknown as ReturnType<typeof catalogApi.useCatalogCounts>)
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
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
  await updateProgress(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId }), SOURCE_ID, 300)
  return id as number
}

describe('ListHomeScreen — conteúdo do Início (feature 023)', () => {
  it('os atalhos são botões com nome acessível e rótulo "TV ao vivo" (não mais "Live TV")', () => {
    renderScreen()

    expect(tile(/TV ao vivo/)).toBeInTheDocument()
    expect(tile(/Filmes/)).toBeInTheDocument()
    expect(tile(/Séries/)).toBeInTheDocument()
    expect(screen.queryByText('Live TV')).not.toBeInTheDocument()
  })

  it('sem topbar por perto o conteúdo se comporta como antes: active padrão true, foco em "TV ao vivo"', () => {
    const props = renderScreen()

    expect(tile(/TV ao vivo/)).toHaveClass('tv-focus')
    press('Enter')
    expect(props.onSelect).toHaveBeenCalledWith('live')
  })

  it('active=false é inerte: nenhuma tecla age e nenhum foco é desenhado, mas o estado fica guardado (D-004)', () => {
    const props = renderScreen({ active: false, onExitUp: vi.fn() })

    expect(document.querySelectorAll('.tv-focus')).toHaveLength(0)
    press('ArrowRight')
    press('ArrowUp')
    press('Enter')
    press('Escape')

    expect(props.onSelect).not.toHaveBeenCalled()
    expect(props.onExitUp).not.toHaveBeenCalled()
    expect(props.onBack).not.toHaveBeenCalled()
  })

  it('UP na linha mais alta (sem "Continuar assistindo") chama onExitUp uma única vez e não muda o foco interno', () => {
    const props = renderScreen({ onExitUp: vi.fn() })

    press('ArrowRight') // -> Filmes
    press('ArrowUp')

    expect(props.onExitUp).toHaveBeenCalledTimes(1)
    expect(tile(/Filmes/)).toHaveClass('tv-focus')
  })

  it('UP sem onExitUp não faz nada (quem monta sem topbar não é afetado)', () => {
    renderScreen()
    expect(() => press('ArrowUp')).not.toThrow()
    expect(tile(/TV ao vivo/)).toHaveClass('tv-focus')
  })

  it('com "Continuar assistindo", o primeiro UP vai à rail e só o segundo chama onExitUp', async () => {
    await seedMovie('1', 'Duna')
    const props = renderScreen({ onExitUp: vi.fn() })
    await screen.findByText('Duna')

    press('ArrowUp')
    expect(props.onExitUp).not.toHaveBeenCalled()
    expect(document.querySelector('.continue-watching-card .tv-focus')).not.toBeNull()

    press('ArrowUp')
    expect(props.onExitUp).toHaveBeenCalledTimes(1)
  })

  it('initialFocus em atalho começa no atalho pedido', () => {
    renderScreen({ initialFocus: { zone: 'shortcuts', destination: 'series' } })

    expect(tile(/Séries/)).toHaveClass('tv-focus')
    expect(tile(/TV ao vivo/)).not.toHaveClass('tv-focus')
  })

  it('initialFocus em "Continuar assistindo" acha o item pelo id, depois que a consulta termina', async () => {
    const id = await seedMovie('7', 'Interstellar')
    renderScreen({ initialFocus: { zone: 'continue', itemId: String(id) } })

    await screen.findByText('Interstellar')
    await waitFor(() => expect(document.querySelector('.continue-watching-card .tv-focus')).not.toBeNull())
    expect(document.querySelectorAll('.tile.tv-focus')).toHaveLength(0)
  })

  it('o item em foco desaparece da rail com a tela já montada (concluído em outra tela, consulta revalida) — o foco cai no atalho, nunca fica sem nenhum .tv-focus (achado E2E, constitution: Foco Visível e Sem Becos Sem Saída)', async () => {
    const id = await seedMovie('9', 'Arrival')
    const { queryClient } = renderScreen({ initialFocus: { zone: 'continue', itemId: String(id) } })

    await screen.findByText('Arrival')
    await waitFor(() => expect(document.querySelector('.continue-watching-card .tv-focus')).not.toBeNull())

    // O item é concluído em outra tela (sai do filtro de "em progresso") — a
    // consulta revalida e a rail esvazia com o componente já montado, sem
    // nenhuma tecla ter sido apertada. `invalidateQueries` reproduz o mesmo
    // caminho que `useToggleWatched` (feature 019) dispara de verdade.
    await db.userStates.where('sourceId').equals(SOURCE_ID).modify({ progressSeconds: 0, completedAt: Date.now() })
    await queryClient.invalidateQueries({ queryKey: ['continue-watching', SOURCE_ID] })
    await waitFor(() => expect(screen.queryByText('Arrival')).not.toBeInTheDocument())

    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
    expect(tile(/TV ao vivo/)).toHaveClass('tv-focus')
    // DOWN/UP continuam funcionando depois da corrida — não ficou preso na rail inexistente.
    press('ArrowRight')
    expect(tile(/Filmes/)).toHaveClass('tv-focus')
  })

  it('initialFocus com id ausente deixa o foco no padrão, sem apontar para outro item', async () => {
    await seedMovie('8', 'Arrival')
    renderScreen({ initialFocus: { zone: 'continue', itemId: 'nao-existe' } })

    await screen.findByText('Arrival')
    expect(document.querySelector('.continue-watching-card .tv-focus')).toBeNull()
    expect(tile(/TV ao vivo/)).toHaveClass('tv-focus')
  })
})
