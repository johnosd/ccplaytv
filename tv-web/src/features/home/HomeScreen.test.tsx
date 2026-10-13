import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeScreen, type HomeScreenProps } from './HomeScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { HomeHeroOut } from '../catalog/catalogApi'
import { PlayerLayer } from '../../components/PlayerLayer'
import type { SourceOut } from '../import/importApi'

/**
 * Testes de SHELL do Início (feature 026, T021) — composição topbar ↔
 * conteúdo, RETURN/modal de saída e o player desligando os dois escopos
 * (D-004/D-008). O comportamento do hero/rails em si (foco por linha,
 * restauração por id, "Ver todos"/mocks) é testado em `HomeContent.test.tsx`;
 * o fluxo completo hero → player → fechar → foco é o contrato travado
 * (`HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`).
 */
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useHomeHero: vi.fn() }
})

vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
}))

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

const WELCOME: HomeHeroOut = { kind: 'welcome' }

function mockHero(hero: HomeHeroOut) {
  vi.mocked(catalogApi.useHomeHero).mockReturnValue({
    data: hero,
    isSuccess: true,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof catalogApi.useHomeHero>)
}

function renderHome(overrides: Partial<HomeScreenProps> = {}) {
  const props: HomeScreenProps = {
    source: makeSource(),
    onNavigate: vi.fn(),
    onOpenProfiles: vi.fn(),
    onOpenItem: vi.fn(),
    onOpenChannel: vi.fn(),
    onOpenFavorites: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenSettings: vi.fn(),
    onLeaveList: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<HomeScreen {...props} />, { wrapper: Wrapper })
  return props
}

// Teclas em `document.body` (nunca em `document`): só assim a captura de um
// `Modal` roda antes das telas por trás — mesmo cuidado dos contratos da 022.
function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

const topbarItem = (name: RegExp | string) =>
  within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name })
const profileIndicator = () => screen.getByRole('button', { name: /Lista ativa/ })
const focusedInTopbar = () => [...document.querySelectorAll('.topbar .tv-focus')]
const heroAction = (name: RegExp | string) => screen.getByRole('button', { name })

beforeEach(() => {
  mockHero(WELCOME)
  vi.mocked(PlayerLayer).mockClear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HomeScreen (Início) — topbar e conteúdo (feature 026)', () => {
  it('mostra a topbar com o nome da lista ativa e "Início" como destino atual; foco inicial no hero', () => {
    renderHome()

    expect(profileIndicator()).toHaveAccessibleName('Lista ativa: Minha fonte. Trocar de lista')
    expect(topbarItem('Início')).toHaveAttribute('aria-current', 'page')
    expect(heroAction(/Abrir TV ao vivo/)).toHaveClass('tv-focus')
    expect(focusedInTopbar()).toHaveLength(0)
  })

  // Ad-hoc 2026-10-09: sem o dock, ↑ nas ações do billboard sai direto à topbar.
  it('UP no hero leva à topbar em "Início"; DOWN da topbar pousa nas ações do billboard', () => {
    renderHome()

    press('ArrowUp') // hero -> topbar
    expect(focusedInTopbar()).toHaveLength(1)
    expect(topbarItem('Início')).toHaveClass('tv-focus')

    press('ArrowDown') // topbar -> conteúdo: o foco volta ao billboard (060)
    expect(focusedInTopbar()).toHaveLength(0)
    expect(heroAction(/Abrir TV ao vivo/)).toHaveClass('tv-focus')
  })

  it('OK em "Filmes" na topbar chama onNavigate com o foco de origem na topbar (FR-016)', () => {
    const props = renderHome()

    press('ArrowUp') // hero -> topbar, em "Início"
    press('ArrowRight') // Início -> TV ao vivo
    press('ArrowRight') // -> Filmes
    expect(topbarItem('Filmes')).toHaveClass('tv-focus')
    press('Enter')

    expect(props.onNavigate).toHaveBeenCalledWith('movies', { zone: 'topbar', item: 'movies' })
  })

  it('OK no indicador da lista abre os perfis com foco de origem no indicador (FR-017)', () => {
    const props = renderHome()

    press('ArrowUp') // hero -> topbar
    for (let i = 0; i < 4; i += 1) press('ArrowRight') // Início -> ... -> indicador
    expect(profileIndicator()).toHaveClass('tv-focus')
    press('Enter')

    expect(props.onOpenProfiles).toHaveBeenCalledWith({ zone: 'topbar', item: 'profile' })
    expect(props.onNavigate).not.toHaveBeenCalled()
  })

  // Ad-hoc 2026-10-09: a lupa está escondida; depois do indicador da lista vem direto a engrenagem.
  it('sem lupa na topbar; OK na engrenagem chama onOpenSettings com o foco de origem na topbar (FR-021)', () => {
    const props = renderHome()

    press('ArrowUp') // hero -> topbar
    for (let i = 0; i < 5; i += 1) press('ArrowRight') // Início -> ... -> Configurações
    expect(screen.queryByRole('button', { name: 'Buscar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveClass('tv-focus')
    press('Enter')
    expect(props.onOpenSettings).toHaveBeenCalledWith({ zone: 'topbar', item: 'settings' })
    expect(props.onOpenSearch).not.toHaveBeenCalled()
  })

  it('initialFocus na topbar restaura o item e deixa o conteúdo sem foco (FR-029)', () => {
    renderHome({ initialFocus: { zone: 'topbar', item: 'series' } })

    expect(topbarItem('Séries')).toHaveClass('tv-focus')
    expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(0)
  })
})

describe('HomeScreen (Início) — RETURN sai da lista', () => {
  it('RETURN chama onLeaveList e não abre confirmação de saída no Início (FR-018/FR-019)', () => {
    const props = renderHome()

    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(props.onLeaveList).toHaveBeenCalledTimes(1)
  })

  it('RETURN na topbar também chama onLeaveList', () => {
    const props = renderHome()

    press('ArrowUp')
    press('ArrowUp') // hero -> dock -> topbar
    press('Escape')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(props.onLeaveList).toHaveBeenCalledTimes(1)
  })
})

describe('HomeScreen (Início) — o player desliga os dois escopos (D-004/D-008)', () => {
  const HERO: HomeHeroOut = {
    kind: 'continue',
    item: {
      id: 'movie-7',
      kind: 'movie',
      name: 'Arrival',
      original_group: 'Ficção',
      published: true,
      playable: true,
      source_id: SOURCE_ID,
      provider_stream_id: '7',
      original_name: 'Arrival',
    },
    primary: { type: 'play', itemId: 'movie-7', title: 'Arrival', startAtMs: undefined, resume: false },
  }

  it('abrir o player pelo hero desliga o foco da topbar e do conteúdo; fechar devolve o foco à ação primária', () => {
    mockHero(HERO)
    renderHome()

    press('Enter') // OK na ação primária ("Assistir")
    expect(screen.getByRole('dialog', { name: 'Reproduzindo Arrival' })).toBeInTheDocument()
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(0)

    const onClose = vi.mocked(PlayerLayer).mock.calls[0][0].onClose
    act(() => onClose())

    expect(screen.queryByRole('dialog', { name: 'Reproduzindo Arrival' })).not.toBeInTheDocument()
    expect(heroAction(/Assistir/)).toHaveClass('tv-focus')
  })
})
