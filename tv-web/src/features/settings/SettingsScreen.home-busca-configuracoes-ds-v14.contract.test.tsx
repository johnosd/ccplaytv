/**
 * Teste de CONTRATO da feature 026 (Home, Busca global e Configurações no
 * DS V14) — Configurações › Fontes IPTV. Travado em
 * `sdd/specs/026-home-busca-configuracoes-ds-v14/contract-tests.lock`. O
 * sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/foco-configuracoes.md` da feature 026.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsScreen } from './SettingsScreen'
import * as importApi from '../import/importApi'
import type { SourceOut } from '../import/importApi'

vi.mock('../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../import/importApi')>()
  return {
    ...actual,
    useSources: vi.fn(),
    useDeleteSource: vi.fn(),
    useResyncSource: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  }
})

const SALA: SourceOut = {
  id: 'sala',
  type: 'm3u_url',
  display_name: 'Sala',
  connection_state: 'synced',
  last_successful_sync_at: '2026-09-20T12:00:00.000Z',
  provider_import_mode: 'legacy_m3u',
  limited_reason: 'protocol_unavailable',
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
  provider_import_mode: 'xtream_api',
  limited_reason: null,
  provider_dns: 'http://painel.secreto.exemplo:8080',
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

// Teclas em `document.body` (nunca em `document`): só assim a captura de um
// `Modal` roda antes da tela por trás — mesmo cuidado dos contratos da 022/023.
function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

function renderSettings(deleteMutate: ReturnType<typeof vi.fn>) {
  vi.mocked(importApi.useSources).mockReturnValue({
    data: { sources: [SALA, QUARTO] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof importApi.useSources>)
  vi.mocked(importApi.useDeleteSource).mockReturnValue({
    mutate: deleteMutate,
    isPending: false,
  } as unknown as ReturnType<typeof importApi.useDeleteSource>)

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
      onBack={vi.fn()}
    />,
    { wrapper: Wrapper },
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsScreen — contrato da feature 026', () => {
  // US2/AC1, US2/AC2, US2/AC5, FR-022..FR-025, FR-028, SC-004, Constitution: "Segredos Fora dos Clientes e dos Logs"
  it('abre em Fontes IPTV listando todas as listas sem credencial, com lista ativa e Modo limitado; Excluir exige confirmação com Cancelar focado', () => {
    const deleteMutate = vi.fn()
    renderSettings(deleteMutate)

    expect(screen.getByRole('button', { name: /Fontes IPTV/ })).toHaveClass('tv-focus')

    const sala = screen.getByRole('group', { name: 'Lista Sala' })
    const quarto = screen.getByRole('group', { name: 'Lista Quarto' })
    expect(within(sala).getByText('Lista ativa')).toBeInTheDocument()
    expect(within(sala).getByText(/Modo limitado/)).toBeInTheDocument()
    expect(within(quarto).queryByText('Lista ativa')).not.toBeInTheDocument()
    expect(within(quarto).getByText('Xtream')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('painel.secreto')

    // Aba → painel (Sala · Editar) → lista de baixo (Quarto · Editar) → Ressincronizar → Excluir.
    press('ArrowRight')
    expect(within(sala).getByRole('button', { name: 'Editar' })).toHaveClass('tv-focus')
    press('ArrowDown')
    press('ArrowRight')
    press('ArrowRight')
    expect(within(quarto).getByRole('button', { name: 'Excluir' })).toHaveClass('tv-focus')

    // OK duplo: o primeiro abre o modal, o segundo cai em Cancelar — nada apagado.
    press('Enter')
    const dialog = screen.getByRole('dialog', { name: 'Excluir a lista Quarto?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    press('Enter')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteMutate).not.toHaveBeenCalled()

    // Confirmação explícita apaga a lista certa.
    press('Enter')
    press('ArrowRight')
    press('Enter')
    expect(deleteMutate).toHaveBeenCalledTimes(1)
    expect(deleteMutate.mock.calls[0][0]).toBe('quarto')
  })
})
