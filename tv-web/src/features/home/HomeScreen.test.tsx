import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeScreen, type HomeScreenProps } from './HomeScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'
import { db } from '../../lib/catalog/db'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useCatalogCounts: vi.fn() }
})

const SOURCE_ID = 'src-1'

function makeSource(overrides: Partial<SourceOut> = {}): SourceOut {
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
    ...overrides,
  }
}

function renderHome(overrides: Partial<HomeScreenProps> = {}) {
  const props: HomeScreenProps = {
    source: makeSource(),
    onNavigate: vi.fn(),
    onOpenContinueWatching: vi.fn(),
    onOpenProfiles: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen {...props} />
    </QueryClientProvider>,
  )
  return props
}

// Teclas em `document.body` (nunca em `document`): só assim a captura de um
// `Modal` roda antes das telas por trás — mesmo cuidado dos contratos da 022.
function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

const shortcut = (name: RegExp | string) =>
  within(screen.getByRole('group', { name: 'Atalhos' })).getByRole('button', { name })
const topbarItem = (name: RegExp | string) =>
  within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name })
const profileIndicator = () => screen.getByRole('button', { name: /Lista ativa/ })
const focusedInTopbar = () => [...document.querySelectorAll('.topbar .tv-focus')]

beforeEach(() => {
  vi.mocked(catalogApi.useCatalogCounts).mockReturnValue({
    data: {
      channels: { items: 42, categories: 5 },
      movies: { categories: 3 },
      series: { categories: 2 },
    },
  } as unknown as ReturnType<typeof catalogApi.useCatalogCounts>)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HomeScreen (Início) — topbar e conteúdo', () => {
  it('mostra a topbar com o nome da lista ativa e "Início" como destino atual; foco inicial no atalho "TV ao vivo" (FR-013, FR-014, FR-024)', () => {
    renderHome()

    expect(profileIndicator()).toHaveAccessibleName('Lista ativa: Minha fonte. Trocar de lista')
    expect(topbarItem('Início')).toHaveAttribute('aria-current', 'page')
    expect(shortcut(/TV ao vivo/)).toHaveClass('tv-focus')
    expect(focusedInTopbar()).toHaveLength(0)
    // Contagem honesta do hub, sem mudança (feature 010).
    expect(screen.getByText('42 títulos')).toBeInTheDocument()
  })

  it('OK no atalho focado abre o destino e informa de onde saiu, para o RETURN devolver o foco (FR-016, FR-029)', () => {
    const props = renderHome()

    press('ArrowRight') // TV ao vivo -> Filmes
    press('Enter')

    expect(props.onNavigate).toHaveBeenCalledTimes(1)
    expect(props.onNavigate).toHaveBeenCalledWith('movies', { zone: 'shortcuts', destination: 'movies' })
  })

  it('UP no topo do conteúdo leva à topbar em "Início" sem mexer no foco dentro dela; DOWN devolve o foco ao MESMO atalho (FR-015, R-002)', () => {
    renderHome()

    press('ArrowRight') // -> Filmes
    press('ArrowUp')

    expect(focusedInTopbar()).toHaveLength(1)
    expect(topbarItem('Início')).toHaveClass('tv-focus')
    expect(document.querySelectorAll('.tile.tv-focus')).toHaveLength(0)

    press('ArrowDown')

    expect(focusedInTopbar()).toHaveLength(0)
    expect(shortcut(/Filmes/)).toHaveClass('tv-focus')
    expect(shortcut(/TV ao vivo/)).not.toHaveClass('tv-focus')
    expect(shortcut(/Séries/)).not.toHaveClass('tv-focus')
  })

  it('OK em "Filmes" na topbar abre o mesmo destino do atalho, com foco de origem na topbar (FR-016)', () => {
    const props = renderHome()

    press('ArrowUp')
    press('ArrowRight') // Início -> TV ao vivo
    press('ArrowRight') // -> Filmes
    expect(topbarItem('Filmes')).toHaveClass('tv-focus')
    press('Enter')

    expect(props.onNavigate).toHaveBeenCalledWith('movies', { zone: 'topbar', item: 'movies' })
  })

  it('OK no indicador da lista abre os perfis, com foco de origem no indicador (FR-017)', () => {
    const props = renderHome()

    press('ArrowUp')
    for (let i = 0; i < 4; i += 1) press('ArrowRight') // Início -> ... -> indicador
    expect(profileIndicator()).toHaveClass('tv-focus')
    press('Enter')

    expect(props.onOpenProfiles).toHaveBeenCalledWith({ zone: 'topbar', item: 'profile' })
    expect(props.onNavigate).not.toHaveBeenCalled()
  })

  it('Busca e Configurações são "Em breve": OK não navega nem abre nada (FR-018)', () => {
    const props = renderHome()

    press('ArrowUp')
    for (let i = 0; i < 5; i += 1) press('ArrowRight') // ... -> Buscar
    expect(screen.getByRole('button', { name: 'Buscar' })).toHaveClass('tv-focus')
    press('Enter')
    press('ArrowRight') // -> Configurações
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveClass('tv-focus')
    press('Enter')

    expect(props.onNavigate).not.toHaveBeenCalled()
    expect(props.onOpenProfiles).not.toHaveBeenCalled()
  })

  it('initialFocus na topbar restaura o item e deixa o conteúdo sem foco (FR-029)', () => {
    renderHome({ initialFocus: { zone: 'topbar', item: 'series' } })

    expect(topbarItem('Séries')).toHaveClass('tv-focus')
    expect(document.querySelectorAll('.tile.tv-focus')).toHaveLength(0)

    press('ArrowDown')
    // O conteúdo volta ao foco padrão (TV ao vivo), nunca a um item inexistente.
    expect(shortcut(/TV ao vivo/)).toHaveClass('tv-focus')
  })

  it('initialFocus em atalho restaura o atalho (FR-029)', () => {
    renderHome({ initialFocus: { zone: 'shortcuts', destination: 'series' } })

    expect(shortcut(/Séries/)).toHaveClass('tv-focus')
    expect(shortcut(/TV ao vivo/)).not.toHaveClass('tv-focus')
  })
})

describe('HomeScreen (Início) — RETURN e modal de saída', () => {
  it('RETURN abre "Sair do CCPlayTV?" com Cancelar em foco; com o modal aberto as setas não movem o Início; RETURN fecha e o foco fica onde estava (FR-027, FR-030)', () => {
    renderHome()

    press('ArrowRight') // -> Filmes
    press('Escape')

    const dialog = screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')

    press('ArrowRight') // move só o foco do modal (Cancelar -> Sair)
    expect(within(dialog).getByRole('button', { name: 'Sair' })).toHaveClass('tv-focus')
    press('ArrowLeft')
    expect(shortcut(/Séries/)).not.toHaveClass('tv-focus')

    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(shortcut(/Filmes/)).toHaveClass('tv-focus')
  })

  it('RETURN na topbar também abre o modal de saída, e o foco volta à topbar ao fechar (FR-030)', () => {
    renderHome()

    press('ArrowUp')
    press('ArrowRight') // -> TV ao vivo
    press('Escape')
    expect(screen.getByRole('dialog', { name: 'Sair do CCPlayTV?' })).toBeInTheDocument()

    press('Enter') // Cancelar
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(topbarItem('TV ao vivo')).toHaveClass('tv-focus')
  })
})

describe('HomeScreen (Início) — restauração de "Continuar assistindo" por id (FR-029)', () => {
  afterEach(async () => {
    await db.sources.delete(SOURCE_ID)
    await db.channels.where('sourceId').equals(SOURCE_ID).delete()
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  async function seedMovies(names: string[]): Promise<number[]> {
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte de teste',
      connectionState: 'synced',
      activeGeneration: 1,
      createdAt: 0,
      updatedAt: 0,
    })
    const ids = (await db.channels.bulkAdd(
      names.map((name, index) => ({
        sourceId: SOURCE_ID,
        generation: 1,
        kind: 'movie' as const,
        name,
        originalName: name,
        groupOrder: 0,
        providerStreamId: String(index + 1),
      })),
      { allKeys: true },
    )) as number[]
    for (let index = 0; index < names.length; index += 1) {
      await updateProgress(
        buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: String(index + 1) }),
        SOURCE_ID,
        300,
      )
    }
    return ids
  }

  const focusedContinueTitle = () =>
    document.querySelector('.continue-watching-card .tv-focus')?.closest('.continue-watching-card')?.querySelector('.continue-watching-title')
      ?.textContent

  it('volta ao item de "Continuar assistindo" de onde se saiu, achado pelo id — não pela posição', async () => {
    const [firstId] = await seedMovies(['Filme A', 'Filme B'])
    renderHome({ initialFocus: { zone: 'continue', itemId: String(firstId) } })

    await screen.findByText('Filme A')
    await waitFor(() => expect(focusedContinueTitle()).toBe('Filme A'))
    expect(document.querySelectorAll('.tile.tv-focus')).toHaveLength(0)
  })

  it('id que sumiu (item concluído enquanto se assistia) cai no atalho "TV ao vivo", nunca em outro item', async () => {
    await seedMovies(['Filme A'])
    renderHome({ initialFocus: { zone: 'continue', itemId: 'id-que-nao-existe-mais' } })

    await screen.findByText('Filme A')
    expect(focusedContinueTitle()).toBeUndefined()
    expect(shortcut(/TV ao vivo/)).toHaveClass('tv-focus')
  })

  it('UP na rail de "Continuar assistindo" leva à topbar; DOWN devolve o foco à MESMA rail, sem descer aos atalhos (R-002)', async () => {
    await seedMovies(['Filme A'])
    renderHome()
    await screen.findByText('Filme A')

    press('ArrowUp') // atalhos -> rail
    expect(focusedContinueTitle()).toBe('Filme A')
    press('ArrowUp') // rail -> topbar
    expect(topbarItem('Início')).toHaveClass('tv-focus')
    press('ArrowDown') // topbar -> conteúdo

    expect(focusedContinueTitle()).toBe('Filme A')
    expect(document.querySelectorAll('.tile.tv-focus')).toHaveLength(0)
  })
})
