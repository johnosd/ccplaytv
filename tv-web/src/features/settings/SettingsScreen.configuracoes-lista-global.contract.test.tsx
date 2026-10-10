/**
 * Teste de CONTRATO da feature 067 (Configurações globais só com o que é global, US2). Travado em
 * `sdd/specs/067-configuracoes-lista-global/contract-tests.lock`; o sdd-execute só pode fazê-lo passar.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from './SettingsScreen'
import * as importApi from '../import/importApi'
import type { SourceOut } from '../import/importApi'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return { ...actual, useSources: vi.fn() }
})

const SALA: SourceOut = {
  id: 'sala',
  type: 'm3u_url',
  display_name: 'Sala',
  connection_state: 'synced',
  last_successful_sync_at: '2026-10-01T12:00:00.000Z',
  provider_import_mode: 'legacy_m3u',
  limited_reason: 'protocol_unavailable',
  provider_dns: null,
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

const QUARTO: SourceOut = {
  ...SALA,
  id: 'quarto',
  type: 'provider_credentials',
  display_name: 'Quarto',
  provider_import_mode: 'xtream_api',
  limited_reason: null,
}

function press(key: string) {
  act(() => {
    fireEvent.keyDown(document.body, { key, bubbles: true })
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsScreen — contrato da feature 067', () => {
  // US2/AC1+AC2, FR-013/FR-014/FR-015, SC-003
  it('só abas globais, com aviso de escopo; a linha de cada lista tem só "Configurar", que entrega a lista e o foco por id', () => {
    vi.mocked(importApi.useSources).mockReturnValue({
      data: { sources: [SALA, QUARTO] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof importApi.useSources>)
    const onConfigureSource = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    render(
      <SettingsScreen
        activeSourceId="sala"
        onAddSource={vi.fn()}
        onEditSource={vi.fn()}
        onResyncStarted={vi.fn()}
        onSourceDeleted={vi.fn()}
        onConfigureSource={onConfigureSource}
        onBack={vi.fn()}
      />,
      { wrapper: Wrapper },
    )

    const labels = [...document.querySelectorAll('.side-category-nav-item .side-category-nav-label')].map((node) => node.textContent?.trim())
    expect(labels).toEqual(['Integrações & BYOK', 'Fontes IPTV', 'Player & reprodução', 'Acessibilidade & sistema', 'Sobre & créditos'])
    expect(screen.getByText(/valem para todas as listas/i)).toBeInTheDocument()

    for (const name of ['Lista Sala', 'Lista Quarto']) {
      const row = screen.getByRole('group', { name })
      expect(within(row).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Configurar'])
    }
    // As informações de leitura da linha continuam (US2/AC2).
    expect(within(screen.getByRole('group', { name: 'Lista Sala' })).getByText('Lista ativa')).toBeInTheDocument()

    press('ArrowRight')
    expect(within(screen.getByRole('group', { name: 'Lista Sala' })).getByRole('button', { name: 'Configurar' })).toHaveClass('tv-focus')
    press('ArrowDown')
    const configureQuarto = within(screen.getByRole('group', { name: 'Lista Quarto' })).getByRole('button', { name: 'Configurar' })
    expect(configureQuarto).toHaveClass('tv-focus')
    press('Enter')
    expect(onConfigureSource).toHaveBeenCalledWith(expect.objectContaining({ id: 'quarto' }), { zone: 'sources', sourceId: 'quarto', action: 'configure' })
  })
})
