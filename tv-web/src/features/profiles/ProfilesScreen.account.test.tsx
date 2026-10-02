import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilesScreen, type ProfilesScreenProps } from './ProfilesScreen'
import * as importApi from '../import/importApi'
import type { SourceOut } from '../import/importApi'
import { findUnnamedControls } from '../../testing/accessibleNames'
import { beginSourceSync, endSourceSync } from '../import/sourceSyncing'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return {
    ...actual,
    useSources: vi.fn(),
    useDeleteSource: vi.fn(),
    useResyncSource: vi.fn(),
  }
})

function makeSource(id: string, displayName: string, overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id,
    type: 'm3u_url',
    display_name: displayName,
    connection_state: 'synced',
    last_successful_sync_at: '2026-09-20T12:00:00.000Z',
    provider_import_mode: null,
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

type UseSourcesResult = ReturnType<typeof importApi.useSources>

function mockSources(value: Partial<UseSourcesResult>) {
  vi.mocked(importApi.useSources).mockReturnValue(value as UseSourcesResult)
}

function mockLoaded(...sources: SourceOut[]) {
  mockSources({ data: { sources }, isLoading: false, isError: false })
}

function mockDelete(mutate: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
  vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate, ...extra } as unknown as ReturnType<
    typeof importApi.useDeleteSource
  >)
}

function mockResync(mutate: ReturnType<typeof vi.fn>) {
  vi.mocked(importApi.useResyncSource).mockReturnValue({ mutate } as unknown as ReturnType<
    typeof importApi.useResyncSource
  >)
}

function renderProfiles(overrides: Partial<ProfilesScreenProps> = {}) {
  const props: ProfilesScreenProps = {
    mode: 'base',
    onChooseSource: vi.fn(),
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onSourceDeleted: vi.fn(),
    onManageSources: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  const utils = render(<ProfilesScreen {...props} />, { wrapper: Wrapper })
  return { props, rerender: () => utils.rerender(<ProfilesScreen {...props} />) }
}

beforeEach(() => {
  mockDelete(vi.fn())
  mockResync(vi.fn())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const DAY = 24 * 60 * 60 * 1000
const noon = (daysFromNow: number) => {
  const d = new Date(Date.now() + daysFromNow * DAY)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

const xtream = (id: string, name: string, overrides: Partial<SourceOut> = {}) =>
  makeSource(id, name, { type: 'provider_credentials', provider_import_mode: 'xtream_api', provider_dns: 'http://painel.exemplo.test', ...overrides })

const card = (name: string) => screen.getByRole('button', { name: new RegExp(name) })

describe('ProfilesScreen — chips de aviso no cartão (feature 034, FR-006/FR-007)', () => {
  it('lista saudável e longe do vencimento: nenhum chip novo', () => {
    mockLoaded(xtream('a', 'Saudavel', { account: { status: 'active', expiresAt: noon(60), checkedAt: Date.now() } }))
    renderProfiles()
    expect(document.querySelector('.source-card-badge')).toBeNull()
  })

  it('vence em 3 dias: chip âmbar com texto, no nome acessível do cartão', () => {
    mockLoaded(xtream('a', 'Vencendo', { account: { status: 'active', expiresAt: noon(3), checkedAt: Date.now() } }))
    renderProfiles()
    const chip = within(card('Vencendo')).getByText('Vence em 3 dias')
    expect(chip).toHaveClass('source-card-badge--warning')
    expect(card('Vencendo')).toHaveAccessibleName(/Vence em 3 dias/)
  })

  it('expirada e credencial inválida: chip de erro; sem "Erro na última sincronização" junto', () => {
    mockLoaded(
      xtream('a', 'Vencida', { connection_state: 'error', account: { status: 'active', expiresAt: noon(-1), checkedAt: Date.now() } }),
      xtream('b', 'Recusada', { connection_state: 'error', account: { status: 'refused', checkedAt: Date.now() } }),
    )
    renderProfiles()
    expect(within(card('Vencida')).getByText('Conta expirada')).toHaveClass('source-card-badge--error')
    expect(within(card('Vencida')).queryByText('Erro na última sincronização')).toBeNull()
    expect(within(card('Recusada')).getByText('Credencial inválida')).toHaveClass('source-card-badge--error')
  })

  it('erro de sincronização (M3U avulsa) e erro de EPG ganham chip; M3U avulsa nunca mostra chip de conta', () => {
    mockLoaded(
      makeSource('m', 'Avulsa', { connection_state: 'error', account: { status: 'refused', checkedAt: 1 } }),
      xtream('x', 'ComEpg', { epg: { state: 'error' } as SourceOut['epg'] }),
    )
    renderProfiles()
    expect(within(card('Avulsa')).getByText('Erro na última sincronização')).toBeInTheDocument()
    expect(within(card('Avulsa')).queryByText('Credencial inválida')).toBeNull()
    expect(within(card('ComEpg')).getByText('Erro no EPG')).toBeInTheDocument()
  })

  it('o cartão não vaza endereço do painel nem usuário, e todo controle tem nome acessível', () => {
    mockLoaded(xtream('a', 'Vencida', { account: { status: 'active', expiresAt: noon(-1), checkedAt: Date.now() } }))
    const { props } = renderProfiles()
    void props
    expect(document.body.innerHTML).not.toMatch(/painel\.exemplo/)
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })
})

describe('ProfilesScreen — "Sincronizando" no cartão (feature 034, FR-015)', () => {
  it('só o cartão da lista que sincroniza ganha o chip, e ele sai quando a sincronização termina', () => {
    mockLoaded(xtream('a', 'Sincroniza'), xtream('b', 'Parada'))
    renderProfiles()
    expect(within(card('Sincroniza')).queryByText('Sincronizando')).toBeNull()
    act(() => beginSourceSync('a'))
    expect(within(card('Sincroniza')).getByText('Sincronizando')).toBeInTheDocument()
    expect(card('Sincroniza')).toHaveAccessibleName(/Sincronizando/)
    expect(within(card('Parada')).queryByText('Sincronizando')).toBeNull()
    act(() => endSourceSync('a'))
    expect(within(card('Sincroniza')).queryByText('Sincronizando')).toBeNull()
  })
})
