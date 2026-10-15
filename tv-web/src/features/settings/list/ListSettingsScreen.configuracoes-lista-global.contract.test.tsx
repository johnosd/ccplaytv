/**
 * Teste de CONTRATO da feature 067 (Configurações da lista, US1). Travado em
 * `sdd/specs/067-configuracoes-lista-global/contract-tests.lock`; o sdd-execute só pode fazê-lo passar.
 * Regras: `logic/navegacao-lista.md`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListSettingsScreen, type ListSettingsScreenProps } from './ListSettingsScreen'
import * as importApi from '../../import/importApi'
import type { SourceOut } from '../../import/importApi'
import { db } from '../../../lib/catalog/db'
import { listPlayed, updateProgress } from '../../../lib/catalog/userStateRepository'

vi.mock('../../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../import/importApi')>()
  return { ...actual, useSources: vi.fn() }
})

const SALA: SourceOut = {
  id: 'sala-067',
  type: 'provider_credentials',
  display_name: 'Sala',
  connection_state: 'synced',
  last_successful_sync_at: '2026-10-01T12:00:00.000Z',
  provider_import_mode: 'xtream_api',
  limited_reason: null,
  provider_dns: 'http://painel.secreto.exemplo:8080',
  last_truncated_by_storage: false,
  last_discarded_by_type: 0,
}

const QUARTO: SourceOut = { ...SALA, id: 'quarto-067', display_name: 'Quarto' }

/** Leituras do IndexedDB podem passar de 1 s com a suíte inteira em paralelo (mesmo cuidado da 036). */
const IDB_WAIT = { timeout: 5000 }

// Teclas em `document.body`: só assim a captura de um `Modal` roda antes da tela por trás (contratos 022/023/026).
function press(key: string) {
  act(() => {
    fireEvent.keyDown(document.body, { key, bubbles: true })
  })
}

const tabLabels = () => [...document.querySelectorAll('.side-category-nav-item .side-category-nav-label')].map((node) => node.textContent?.trim())
const focusedTab = () => document.querySelector('.side-category-nav-item.tv-focus .side-category-nav-label')?.textContent?.trim()

function renderList(overrides: Partial<ListSettingsScreenProps> = {}) {
  const props: ListSettingsScreenProps = {
    sourceId: QUARTO.id,
    activeSourceId: SALA.id,
    onEditSource: vi.fn(),
    onResyncStarted: vi.fn(),
    onOpenEpg: vi.fn(),
    onSourceDeleted: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<ListSettingsScreen {...props} />, { wrapper: Wrapper })
  return props
}

beforeEach(async () => {
  vi.mocked(importApi.useSources).mockReturnValue({
    data: { sources: [SALA, QUARTO] },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof importApi.useSources>)
  for (const source of [SALA, QUARTO]) {
    await db.sources.put({ id: source.id, type: 'provider_credentials', displayName: source.display_name, connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
    await db.channels.add({ sourceId: source.id, generation: 1, kind: 'movie', name: 'Alfa', originalName: 'Alfa', groupOrder: 0, providerStreamId: 'a' })
    await updateProgress(`${source.id}|movie|id:a`, source.id, 120)
  }
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  for (const source of [SALA, QUARTO]) {
    await db.sources.delete(source.id)
    await db.channels.where('sourceId').equals(source.id).delete()
    await db.userStates.where('sourceId').equals(source.id).delete()
  }
})

describe('ListSettingsScreen — contrato da feature 067', () => {
  // US1/AC2+AC4, FR-001/FR-002/FR-003/FR-007, SC-002, Constitution: "Segredos Fora dos Clientes e dos Logs"
  it('abre para uma lista que não é a ativa, com título e aviso de escopo, abas na ordem e Histórico limpando só ESTA lista', async () => {
    renderList()

    expect(screen.getByRole('heading', { name: /Configurações da lista/ })).toBeInTheDocument()
    expect(screen.getAllByText(/Quarto/).length).toBeGreaterThan(0)
    expect(screen.getByText(/só para esta lista/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('painel.secreto')
    expect(tabLabels()).toEqual(['Conta & lista', 'EPG', 'Categorias & controle parental', 'Histórico'])
    expect(focusedTab()).toBe('Conta & lista')

    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    expect(focusedTab()).toBe('Histórico')
    press('ArrowRight')

    const movies = () => screen.getByRole('button', { name: /^Limpar histórico de Filmes —/ })
    await waitFor(() => expect(movies()).toHaveAccessibleName('Limpar histórico de Filmes — 1 título'), IDB_WAIT)
    expect(movies()).toHaveClass('tv-focus')
    press('Enter')
    const dialog = await screen.findByRole('dialog', { name: 'Limpar o histórico de Filmes?' })
    press('ArrowRight')
    press('ArrowRight')
    expect(within(dialog).getByRole('button', { name: 'Limpar e apagar progresso' })).toHaveClass('tv-focus')
    press('Enter')

    await waitFor(async () => expect(await listPlayed(QUARTO.id, 'movie', db)).toEqual([]), IDB_WAIT)
    // A lista ativa (Sala) não muda.
    expect(await listPlayed(SALA.id, 'movie', db)).toHaveLength(1)
  })

  // FR-005/FR-009, US1/AC5, Constitution: "Voltar Restaura Foco e Posição" e "Foco Visível e Sem Becos Sem Saída"
  it('reabre na aba e ação guardadas (EPG) e entrega aba+ação ao sair para EPG e para Editar, sempre com a lista da tela', () => {
    const props = renderList({ initialFocus: { tab: 'epg', action: 'open-epg' } })

    expect(document.querySelector('.side-category-nav-item.is-selected .side-category-nav-label')?.textContent?.trim()).toBe('EPG')
    expect(screen.getByRole('button', { name: 'Configurar EPG' })).toHaveClass('tv-focus')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
    press('Enter')
    expect(props.onOpenEpg).toHaveBeenCalledWith(expect.objectContaining({ id: QUARTO.id }), { tab: 'epg', action: 'open-epg' })

    // ← volta às abas (na EPG), ↑ Conta & lista, → entra no painel em "Editar".
    press('ArrowLeft')
    expect(focusedTab()).toBe('EPG')
    press('ArrowUp')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveClass('tv-focus')
    press('Enter')
    expect(props.onEditSource).toHaveBeenCalledWith(expect.objectContaining({ id: QUARTO.id }), { tab: 'account', action: 'edit' })
  })
})
