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
 * aqui: "Configurar" da linha (067), restauração por `sourceId`, sem listas,
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
})

// Feature 067: Categorias & controle parental saiu das Configurações globais — testada em `list/ListSettingsScreen.test.tsx`.

// Feature 067 (FR-013): a linha só tem "Configurar". Editar/Ressincronizar/Excluir/EPG moram em Configurações da lista
// (`list/ListSettingsScreen.test.tsx`).
describe('SettingsScreen — linha de Fontes IPTV (feature 067)', () => {
  it('OK em "Configurar" entrega a lista da linha e o SettingsFocus de origem, e nenhuma outra ação sai da tela', () => {
    mockSources([SALA, QUARTO])
    mockDelete()
    mockResync()
    const props = renderSettings({ onConfigureSource: vi.fn(), onOpenEpg: vi.fn() })

    press('ArrowRight') // tabs -> panel (Sala)
    press('ArrowDown') // Quarto
    press('ArrowRight') // sem outras ações: não sai da linha
    press('Enter')

    expect(props.onConfigureSource).toHaveBeenCalledWith(QUARTO, { zone: 'sources', sourceId: 'quarto', action: 'configure' })
    for (const handler of [props.onEditSource, props.onResyncStarted, props.onOpenEpg, props.onSourceDeleted]) expect(handler).not.toHaveBeenCalled()
  })

  it('restaura o foco por sourceId (não pela posição)', () => {
    mockSources([SALA, QUARTO])
    mockDelete()
    mockResync()
    renderSettings({ initialFocus: { zone: 'sources', sourceId: 'quarto', action: 'configure' } })

    const quarto = screen.getByRole('group', { name: 'Lista Quarto' })
    expect(within(quarto).getByRole('button', { name: 'Configurar' })).toHaveClass('tv-focus')
    expect(within(screen.getByRole('group', { name: 'Lista Sala' })).getByRole('button', { name: 'Configurar' })).not.toHaveClass('tv-focus')
  })

  it('sem onConfigureSource (contratos antigos), OK em "Configurar" não quebra', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()
    press('ArrowRight')
    expect(() => press('Enter')).not.toThrow()
  })

  it('aviso de escopo: "valem para todas as listas", com e sem topbar', () => {
    mockSources([SALA])
    mockDelete()
    mockResync()
    renderSettings()
    expect(screen.getByText('Estas configurações valem para todas as listas.')).toBeInTheDocument()
    cleanup()
    renderSettings({ shell: makeShell() })
    expect(screen.getByText('Estas configurações valem para todas as listas.')).toBeInTheDocument()
  })
})

// Item 63 do backlog: cada aba é um módulo do registro; a tela só encaminha as teclas.
describe('SettingsScreen — registro de abas (item 63)', () => {
  it('reentrar na mesma aba volta o foco ao começo; o foco restaurado não volta depois de trocar de aba', () => {
    mockSources([SALA, QUARTO])
    mockDelete()
    mockResync()
    renderSettings({ initialFocus: { zone: 'sources', sourceId: 'quarto', action: 'configure' } })

    const quartoAntes = screen.getByRole('group', { name: 'Lista Quarto' })
    press('ArrowLeft') // borda: volta às abas
    press('ArrowRight') // reentra em Fontes IPTV: sem remontar, foco no começo
    expect(screen.getByRole('group', { name: 'Lista Quarto' })).toBe(quartoAntes)
    expect(within(screen.getByRole('group', { name: 'Lista Sala' })).getByRole('button', { name: 'Configurar' })).toHaveClass(
      'tv-focus',
    )

    press('ArrowLeft') // abas
    press('ArrowDown') // Player & reprodução (aba real desde a feature 041)
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Aspecto padrão: Ajustar' })).toHaveClass('tv-focus')
    press('ArrowLeft') // volta às abas
    press('ArrowUp') // Fontes IPTV
    press('ArrowRight')
    expect(within(screen.getByRole('group', { name: 'Lista Sala' })).getByRole('button', { name: 'Configurar' })).toHaveClass(
      'tv-focus',
    )
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
