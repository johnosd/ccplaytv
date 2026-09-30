import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen, type SettingsScreenProps, type SettingsShellProps } from './SettingsScreen'
import * as importApi from '../import/importApi'
import type { SourceOut } from '../import/importApi'
import { REDUCED_MOTION_CLASS, REDUCED_MOTION_STORAGE_KEY } from '../../lib/motionPreference'
import { findUnnamedControls } from '../../testing/accessibleNames'

/**
 * Testes de comportamento de `SettingsScreen` (feature 026, T029) — o
 * cenário principal (Fontes IPTV sem credencial, Excluir com confirmação)
 * é o contrato travado
 * (`SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`);
 * aqui: Editar/Ressincronizar, restauração por `sourceId`, sem listas,
 * RETURN, topbar (presente/ausente).
 */
vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return {
    ...actual,
    useSources: vi.fn(),
    useDeleteSource: vi.fn(),
    useResyncSource: vi.fn(),
  }
})

const SALA: SourceOut = {
  id: 'sala',
  type: 'm3u_url',
  display_name: 'Sala',
  connection_state: 'synced',
  last_successful_sync_at: '2026-09-20T12:00:00.000Z',
  provider_import_mode: null,
  limited_reason: null,
  provider_dns: null,
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

const QUARTO: SourceOut = {
  id: 'quarto',
  type: 'provider_credentials',
  display_name: 'Quarto',
  connection_state: 'synced',
  last_successful_sync_at: null,
  provider_import_mode: null,
  limited_reason: null,
  provider_dns: null,
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

function mockSources(sources: SourceOut[]) {
  vi.mocked(importApi.useSources).mockReturnValue({
    data: { sources },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof importApi.useSources>)
}

function mockDelete(mutate: ReturnType<typeof vi.fn> = vi.fn(), isPending = false) {
  vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate, isPending } as unknown as ReturnType<
    typeof importApi.useDeleteSource
  >)
}

function mockResync(mutate: ReturnType<typeof vi.fn> = vi.fn(), isPending = false) {
  vi.mocked(importApi.useResyncSource).mockReturnValue({ mutate, isPending } as unknown as ReturnType<
    typeof importApi.useResyncSource
  >)
}

function makeShell(overrides: Partial<SettingsShellProps> = {}): SettingsShellProps {
  return {
    sourceName: 'Sala',
    onGoHome: vi.fn(),
    onSwitchTop: vi.fn(),
    onOpenProfiles: vi.fn(),
    onOpenSearch: vi.fn(),
    ...overrides,
  }
}

function renderSettings(overrides: Partial<SettingsScreenProps> = {}) {
  const props: SettingsScreenProps = {
    activeSourceId: 'sala',
    onAddSource: vi.fn(),
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onSourceDeleted: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<SettingsScreen {...props} />, { wrapper: Wrapper })
  return props
}

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsScreen — barra de rolagem (feature 028, FR-006)', () => {
  it('painel rola sem barra nativa', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()
    expect(document.querySelector('.settings-panel')).toHaveClass('no-scrollbar')
  })
})

describe('SettingsScreen — nomes acessíveis (feature 028, FR-015/FR-017)', () => {
  it('todo controle tem nome acessível: aba Fontes IPTV (padrão)', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('todo controle tem nome acessível: aba mock "Em breve"', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()
    press('ArrowDown') // tabs: sources (1) -> player (2), ainda mock depois da feature 032
    press('ArrowRight') // entra no painel mock
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })
})

// Feature 028, FR-007: SELECT em "Voltar às abas" (aba mock "Em breve") devolve o foco à trilha de abas.
describe('SettingsScreen — aba mock "Em breve" (feature 028, FR-007)', () => {
  it('"Voltar às abas" (SELECT) sai do painel mock e volta pra trilha de abas', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()

    // "Integrações & BYOK" era o mock usado aqui; virou real na feature 032 —
    // "Player & reprodução" (item 55b) é um mock que continua.
    press('ArrowDown') // tabs: sources (1) -> player (2)
    press('ArrowRight') // entra no painel "Player & reprodução" (mock)
    expect(screen.getByText(/Em breve/)).toBeInTheDocument()
    const back = screen.getByRole('button', { name: 'Voltar às abas' })
    expect(back).toHaveClass('tv-focus')

    press('Enter')
    expect(screen.getByRole('button', { name: 'Voltar às abas' })).not.toHaveClass('tv-focus')
    expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Player & reprodução')
  })
})

describe('SettingsScreen — Editar/Ressincronizar (US2, FR-026/FR-027)', () => {
  it('OK em "Editar" chama onEditSource com a lista e o SettingsFocus de origem', () => {
    mockSources([SALA, QUARTO])
    mockDelete()
    mockResync()
    const props = renderSettings()

    press('ArrowRight') // tabs -> panel (Sala, coluna 0 = Editar)
    press('Enter')

    expect(props.onEditSource).toHaveBeenCalledWith(SALA, { zone: 'sources', sourceId: 'sala', action: 'edit' })
  })

  it('OK em "Ressincronizar" chama onResyncStarted com o job id; enquanto pendente, um segundo OK não inicia outra', () => {
    mockSources([SALA])
    mockDelete()
    const mutate = vi.fn((_id: string, options: { onSuccess: (result: { import_job_id: string }) => void }) =>
      options.onSuccess({ import_job_id: 'job-1' }),
    )
    mockResync(mutate)
    const props = renderSettings()

    press('ArrowRight') // panel, coluna 0
    press('ArrowRight') // coluna 1 = Ressincronizar
    press('Enter')

    expect(props.onResyncStarted).toHaveBeenCalledWith('job-1', { zone: 'sources', sourceId: 'sala', action: 'resync' })
    expect(mutate).toHaveBeenCalledTimes(1)

    // Pendente: um segundo OK não chama mutate de novo.
    cleanup()
    mockResync(mutate, true)
    renderSettings()
    press('ArrowRight')
    press('ArrowRight')
    press('Enter')
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  // Feature 030 (US2, FR-016): o botão "EPG" deixou de ser o toast "Em breve".
  it('OK em "EPG" abre a tela de EPG da lista, com o SettingsFocus de origem, e não avisa "Em breve"', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    const props = renderSettings({ onOpenEpg: vi.fn() })

    press('ArrowRight') // tabs -> panel, coluna 0
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight') // coluna 3 = EPG
    press('Enter')

    expect(props.onOpenEpg).toHaveBeenCalledWith(SALA, { zone: 'sources', sourceId: 'sala', action: 'epg' })
    expect(screen.queryByText(/Em breve/)).not.toBeInTheDocument()
  })

  it('restaura o foco por sourceId (não pela posição)', () => {
    mockSources([SALA, QUARTO])
    mockDelete()
    mockResync()
    renderSettings({ initialFocus: { zone: 'sources', sourceId: 'quarto', action: 'resync' } })

    const quarto = screen.getByRole('group', { name: 'Lista Quarto' })
    expect(within(quarto).getByRole('button', { name: 'Ressincronizar' })).toHaveClass('tv-focus')
  })
})

describe('SettingsScreen — sem listas (FR-025)', () => {
  it('cai em "Adicionar lista", e OK a ativa', () => {
    mockSources([])
    mockDelete()
    mockResync()
    const props = renderSettings()

    press('ArrowRight') // tabs -> panel
    expect(screen.getByRole('button', { name: /Adicionar lista/ })).toHaveClass('tv-focus')
    press('Enter')
    expect(props.onAddSource).toHaveBeenCalledWith({ zone: 'sources-add' })
  })
})

describe('SettingsScreen — RETURN e topbar', () => {
  it('RETURN na aba ou no painel chama onBack', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    const props = renderSettings()

    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)

    press('ArrowRight') // entra no painel
    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(2)
  })

  it('com shell: UP na primeira aba sobe à topbar, em "Início"; sem shell: UP não faz nada (não há topbar)', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings({ shell: makeShell() })

    // Foco inicial é a aba "Fontes IPTV" (índice 1) — UP primeiro alcança
    // "Integrações & BYOK" (índice 0, topo da lista), só o segundo sobe à topbar.
    press('ArrowUp')
    expect(screen.getByRole('button', { name: 'Integrações & BYOK' })).toHaveClass('tv-focus')
    press('ArrowUp')
    // Foco inicial na topbar é o próprio destino atual (Configurações) — mesmo
    // padrão de `LiveScreen`/`VodCatalogScreen` (começam no destino próprio).
    expect(screen.getByRole('button', { name: 'Configurações' })).toHaveClass('tv-focus')
  })

  it('sem shell, a tela não tem topbar nenhuma (aberta por "Gerenciar listas", FR-033)', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()

    expect(document.querySelector('.topbar')).not.toBeInTheDocument()
    expect(screen.getByText('Configurações')).toBeInTheDocument()
  })
})

describe('SettingsScreen — Acessibilidade: "Reduzir movimento" (US2/AC9, FR-029)', () => {
  afterEach(() => {
    document.documentElement.classList.remove(REDUCED_MOTION_CLASS)
    window.localStorage.removeItem(REDUCED_MOTION_STORAGE_KEY)
  })

  it('OK alterna o valor, aplica a classe na raiz na hora e persiste em localStorage', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()

    // tabs: sources (1) -> player (2) -> accessibility (3).
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowRight') // entra no painel, "Reduzir movimento" focado
    expect(screen.getByText('Desligado')).toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass(REDUCED_MOTION_CLASS)

    press('Enter')
    expect(screen.getByText('Ligado')).toBeInTheDocument()
    expect(document.documentElement).toHaveClass(REDUCED_MOTION_CLASS)
    expect(window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY)).toBe('true')

    press('Enter')
    expect(screen.getByText('Desligado')).toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass(REDUCED_MOTION_CLASS)
    expect(window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY)).toBe('false')
  })
})
