import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ListSettingsScreen, type ListSettingsScreenProps } from './ListSettingsScreen'
import * as importApi from '../../import/importApi'
import type { SourceOut } from '../../import/importApi'
import { db } from '../../../lib/catalog/db'
import { notifyCategoryAccessChanged } from '../../../lib/catalog/categoryAccess'
import { enableParentalControl } from '../../../lib/parental/listPin'
import { findUnnamedControls } from '../../../testing/accessibleNames'
import * as onlineStatus from '../../../lib/onlineStatus'

/**
 * Configurações da lista (feature 067, T027) — complementa o contrato travado: exclusão com a vizinha (D-009), PIN da
 * PRÓPRIA lista na aba de categorias, Ressincronizar offline, nomes acessíveis e ← de volta às abas.
 */
vi.mock('../../../lib/onlineStatus', () => ({ useOnlineStatus: vi.fn(() => true) }))
vi.mock('../../import/importApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../import/importApi')>()
  return { ...actual, useSources: vi.fn(), useDeleteSource: vi.fn(), useResyncSource: vi.fn() }
})

const SALA = { id: 'sala-t', type: 'm3u_url', display_name: 'Sala', connection_state: 'synced', provider_import_mode: null, limited_reason: null, provider_dns: null, last_truncated_by_storage: false, last_discarded_by_type: 0 } as unknown as SourceOut
const QUARTO = { ...SALA, id: 'quarto-t', display_name: 'Quarto' } as SourceOut

function press(key: string) {
  act(() => {
    fireEvent.keyDown(document.body, { key, bubbles: true })
  })
}

const typePin = async (pin: string) => {
  await act(async () => {
    for (const digit of pin) fireEvent.keyDown(document.body, { key: digit, bubbles: true })
  })
}

function renderList(overrides: Partial<ListSettingsScreenProps> = {}, deleteMutate = vi.fn(), resyncMutate = vi.fn(), resyncPending = false) {
  vi.mocked(importApi.useSources).mockReturnValue({ data: { sources: [SALA, QUARTO] }, isLoading: false, isError: false } as unknown as ReturnType<typeof importApi.useSources>)
  vi.mocked(importApi.useDeleteSource).mockReturnValue({ mutate: deleteMutate, isPending: false } as unknown as ReturnType<typeof importApi.useDeleteSource>)
  vi.mocked(importApi.useResyncSource).mockReturnValue({ mutate: resyncMutate, isPending: resyncPending } as unknown as ReturnType<typeof importApi.useResyncSource>)
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  render(<ListSettingsScreen {...props} />, { wrapper: Wrapper })
  return props
}

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  vi.mocked(onlineStatus.useOnlineStatus).mockReturnValue(true)
  await db.table('parentalPins').clear()
  notifyCategoryAccessChanged()
  localStorage.clear()
})

describe('ListSettingsScreen — Conta & lista', () => {
  it('Editar entrega a lista DA TELA e a aba+ação de origem (não a lista ativa)', () => {
    const props = renderList()
    press('ArrowRight')
    press('Enter')
    expect(props.onEditSource).toHaveBeenCalledWith(QUARTO, { tab: 'account', action: 'edit' })
  })

  it('Ressincronizar avisa e, ao iniciar o job, entrega o id dele; pendente, um segundo OK não inicia outro', () => {
    const resync = vi.fn((_id: string, options: { onSuccess: (r: { import_job_id: string }) => void }) => options.onSuccess({ import_job_id: 'job-1' }))
    const props = renderList({}, vi.fn(), resync)
    press('ArrowRight')
    press('ArrowRight')
    press('Enter')
    expect(screen.getByText('Ressincronizando lista…')).toBeInTheDocument()
    expect(resync).toHaveBeenCalledWith(QUARTO.id, expect.anything())
    expect(props.onResyncStarted).toHaveBeenCalledWith('job-1', { tab: 'account', action: 'resync' })

    cleanup()
    const pending = vi.fn()
    renderList({}, vi.fn(), pending, true)
    press('ArrowRight')
    press('ArrowRight')
    press('Enter')
    expect(pending).not.toHaveBeenCalled()
  })

  it('offline: Ressincronizar é soft disabled com o motivo no nome, continua ativável e só explica (feature 042, FR-004)', () => {
    vi.mocked(onlineStatus.useOnlineStatus).mockReturnValue(false)
    const resync = vi.fn()
    renderList({}, vi.fn(), resync)
    const button = screen.getByRole('button', { name: /Ressincronizar, indisponível sem conexão/ })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    press('ArrowRight')
    press('ArrowRight')
    press('Enter')
    expect(screen.getByText('Sem conexão. Ressincronizar precisa de internet.')).toBeInTheDocument()
    expect(resync).not.toHaveBeenCalled()
  })

  it('Excluir confirma (Cancelar focado) e, ao terminar, entrega a lista vizinha — a anterior quando é a última (D-009)', () => {
    const deleteMutate = vi.fn((_id: string, options: { onSuccess: () => void }) => options.onSuccess())
    const props = renderList({}, deleteMutate)
    press('ArrowRight')
    press('ArrowRight')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass('tv-focus')
    press('Enter')
    const dialog = screen.getByRole('dialog', { name: 'Excluir a lista Quarto?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveClass('tv-focus')
    press('ArrowRight')
    press('Enter')
    expect(deleteMutate.mock.calls[0][0]).toBe(QUARTO.id)
    expect(props.onSourceDeleted).toHaveBeenCalledWith(QUARTO.id, SALA.id)
  })

  it('marca "Lista ativa" só na ativa; todo controle tem nome; ← na primeira ação volta às abas', () => {
    renderList({ sourceId: SALA.id })
    expect(screen.getByText('Lista ativa')).toBeInTheDocument()
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveClass('tv-focus')
    press('ArrowLeft')
    expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Conta & lista')
  })
})

describe('ListSettingsScreen — EPG', () => {
  it('"Configurar EPG" entrega a lista da tela com aba+ação; RETURN volta (onBack) sem abrir nada', () => {
    const props = renderList()
    press('ArrowDown')
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Configurar EPG' })).toHaveClass('tv-focus')
    press('Enter')
    expect(props.onOpenEpg).toHaveBeenCalledWith(QUARTO, { tab: 'epg', action: 'open-epg' })
    press('Escape')
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })
})

describe('ListSettingsScreen — Categorias & controle parental', () => {
  it('com PIN só nesta lista, a gestão pede o PIN DELA; o da lista ativa não serve', async () => {
    await enableParentalControl(SALA.id, '1111', [])
    await enableParentalControl(QUARTO.id, '2222', [])
    renderList({ initialFocus: { tab: 'parental' } })
    const gate = await screen.findByRole('button', { name: 'Digite o PIN' })
    expect(gate).toHaveClass('tv-focus')
    press('Enter')
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    await typePin('1111')
    expect(await screen.findByText('PIN incorreto')).toBeInTheDocument()
    await typePin('2222')
    expect(await screen.findByRole('button', { name: /Controle parental: Ligado/ })).toBeInTheDocument()
  })

  it('sem PIN: entra pelo controle parental e ← devolve o foco à trilha de abas; todo controle tem nome', async () => {
    renderList()
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowRight')
    expect(await screen.findByRole('button', { name: 'Controle parental: Desligado' })).toHaveClass('tv-focus')
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
    press('ArrowLeft')
    expect(document.querySelector('.side-category-nav-item.tv-focus')?.textContent).toContain('Categorias & controle parental')
  })
})
