/**
 * Teste de CONTRATO da feature 026 (Home, Busca global e Configurações no
 * DS V14) — Início definitivo. Travado em
 * `sdd/specs/026-home-busca-configuracoes-ds-v14/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/hero-home.md` e `logic/foco-home.md` da feature 026.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeScreen } from './HomeScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogItemOut, HomeHeroOut } from '../catalog/catalogApi'
import type { SourceOut } from '../import/importApi'
import { PlayerLayer } from '../../components/PlayerLayer'

// Só o hero é mockado: as rails leem o IndexedDB falso vazio (setupTests) e
// simplesmente não aparecem (FR-010).
vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return { ...actual, useHomeHero: vi.fn() }
})

// A máquina do player já é testada em PlayerLayer.test.tsx; aqui importa o que
// o Início decide antes de abri-lo e o foco depois de fechá-lo.
vi.mock('../../components/PlayerLayer', () => ({
  PlayerLayer: vi.fn(({ title }: { title: string }) => <div role="dialog" aria-label={`Reproduzindo ${title}`} />),
}))

const SOURCE: SourceOut = {
  id: 'fonte-1',
  type: 'provider_credentials',
  display_name: 'Sala',
  connection_state: 'synced',
  last_successful_sync_at: null,
  provider_import_mode: 'xtream_api',
  limited_reason: null,
  provider_dns: null,
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

const ARRIVAL: CatalogItemOut = {
  id: 'movie-7',
  kind: 'movie',
  name: 'Arrival',
  original_group: 'Ficção',
  published: true,
  playable: true,
  source_id: 'fonte-1',
  provider_stream_id: '7',
  original_name: 'Arrival',
}

const HERO: HomeHeroOut = {
  kind: 'continue',
  item: ARRIVAL,
  primary: { type: 'play', itemId: 'movie-7', title: 'Arrival', startAtMs: 600_000, resume: true },
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function lastPlayerProps() {
  const calls = vi.mocked(PlayerLayer).mock.calls
  return calls[calls.length - 1]?.[0]
}

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(
    <HomeScreen
      source={SOURCE}
      onNavigate={vi.fn()}
      onOpenProfiles={vi.fn()}
      onOpenItem={vi.fn()}
      onOpenChannel={vi.fn()}
      onOpenFavorites={vi.fn()}
      onOpenSearch={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
    { wrapper: Wrapper },
  )
}

const continueButton = () => screen.getByRole('button', { name: /^(▶\s*)?Continuar$/ })

beforeEach(() => {
  vi.mocked(catalogApi.useHomeHero).mockReturnValue({
    data: HERO,
    isSuccess: true,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof catalogApi.useHomeHero>)
  vi.mocked(PlayerLayer).mockClear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HomeScreen — contrato da feature 026', () => {
  // US1/AC1, US1/AC4, FR-004, FR-005, FR-007, FR-020, SC-001, Constitution: "Voltar Restaura Foco e Posição"
  it('abre com "Continuar" do hero focado; um OK retoma por cima do Início na posição salva; fechar o player devolve o foco a "Continuar"', () => {
    renderHome()

    // O hub provisório (3 atalhos grandes) não existe mais.
    expect(screen.queryByRole('group', { name: 'Atalhos' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mais informações/ })).toBeInTheDocument()
    expect(continueButton()).toHaveClass('tv-focus')

    press('Enter')
    expect(screen.getByRole('dialog', { name: 'Reproduzindo Arrival' })).toBeInTheDocument()
    expect(lastPlayerProps()).toEqual(expect.objectContaining({ itemId: 'movie-7', startAtMs: 600_000 }))

    act(() => {
      lastPlayerProps()?.onClose()
    })
    expect(screen.queryByRole('dialog', { name: 'Reproduzindo Arrival' })).not.toBeInTheDocument()
    expect(continueButton()).toHaveClass('tv-focus')
  })
})
