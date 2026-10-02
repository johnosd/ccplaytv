import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSourceSyncing } from './importApi'
import { beginSourceSync, endSourceSync, isSourceSyncing, onSourceSyncFinished } from './sourceSyncing'
import { SourcesPanel } from '../settings/SourcesPanel'
import { formatStatus } from '../sources/sourceFormat'
import type { SourceOut } from './importApi'

function withQuery({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  // Deixa o store limpo entre testes (contadores por lista).
  while (isSourceSyncing('a')) endSourceSync('a')
  while (isSourceSyncing('b')) endSourceSync('b')
})

function makeSource(id: string, overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id,
    type: 'provider_credentials',
    display_name: `Lista ${id}`,
    connection_state: 'synced',
    last_successful_sync_at: '2026-09-20T12:00:00.000Z',
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

describe('useSourceSyncing (feature 034, FR-015)', () => {
  it('entra no início e sai no fim, por lista, sem afetar as outras', () => {
    const a = renderHook(() => useSourceSyncing('a'))
    const b = renderHook(() => useSourceSyncing('b'))
    expect([a.result.current, b.result.current]).toEqual([false, false])
    act(() => beginSourceSync('a'))
    expect([a.result.current, b.result.current]).toEqual([true, false])
    act(() => endSourceSync('a'))
    expect(a.result.current).toBe(false)
  })

  it('duas importações que se sobrepõem: o estado só sai quando a última termina', () => {
    const hook = renderHook(() => useSourceSyncing('a'))
    act(() => {
      beginSourceSync('a')
      beginSourceSync('a')
    })
    act(() => endSourceSync('a'))
    expect(hook.result.current).toBe(true)
    act(() => endSourceSync('a'))
    expect(hook.result.current).toBe(false)
  })

  it('terminar a mais é inofensivo, e o fim avisa a raiz do app (para reler fontes e contagens)', () => {
    const finished = vi.fn()
    const off = onSourceSyncFinished(finished)
    act(() => endSourceSync('a')) // sem ter começado
    expect(isSourceSyncing('a')).toBe(false)
    act(() => beginSourceSync('a'))
    act(() => endSourceSync('a'))
    expect(finished).toHaveBeenCalledWith('a')
    off()
  })

  it('sem lista (null) nunca sincroniza', () => {
    const hook = renderHook(() => useSourceSyncing(null))
    expect(hook.result.current).toBe(false)
  })
})

describe('formatStatus (feature 034, FR-015/FR-016)', () => {
  it('sincronizando vence tudo, inclusive um erro anterior', () => {
    expect(formatStatus(makeSource('a', { connection_state: 'error' }), { syncing: true })).toBe('Sincronizando')
  })

  it('credencial recusada: "Credencial inválida", mesmo com a lista ainda "synced"', () => {
    expect(formatStatus(makeSource('a', { account: { status: 'refused', checkedAt: 1 } }))).toBe('Credencial inválida')
  })

  it('assinatura vencida que derrubou a sincronização: "Conta expirada"; com sincronização boa, continua a data', () => {
    const expiredAt = new Date(2020, 0, 1).getTime()
    expect(formatStatus(makeSource('a', { connection_state: 'error', account: { status: 'expired', expiresAt: expiredAt, checkedAt: 1 } }))).toBe('Conta expirada')
    expect(formatStatus(makeSource('a', { account: { status: 'expired', expiresAt: expiredAt, checkedAt: 1 } }))).toMatch(/^Sincronizada em /)
  })

  it('outro erro, nunca sincronizada e sincronizada continuam como antes; M3U avulsa ignora a conta', () => {
    expect(formatStatus(makeSource('a', { connection_state: 'error' }))).toBe('Erro na última sincronização')
    expect(formatStatus(makeSource('a', { connection_state: 'never_synced', last_successful_sync_at: null }))).toBe('Nunca sincronizada')
    expect(formatStatus(makeSource('a', { provider_import_mode: null, account: { status: 'refused', checkedAt: 1 } }))).toMatch(/^Sincronizada em /)
  })
})

describe('linha de Configurações assina "Sincronizando" por lista', () => {
  it('a linha troca de "Sincronizada em…" para "Sincronizando" e volta, só na lista que sincroniza', () => {
    render(<SourcesPanel
        sources={[makeSource('a'), makeSource('b')]}
        activeSourceId={null}
        focusedCol={0}
        resyncPending={false}
        deletePending={false}
        onActivateRow={vi.fn()}
      />, { wrapper: withQuery })
    const row = (id: string) => screen.getByRole('group', { name: `Lista Lista ${id}` })
    expect(row('a').textContent).toMatch(/Sincronizada em/)
    act(() => beginSourceSync('a'))
    expect(row('a').textContent).toContain('Sincronizando')
    expect(row('a').textContent).not.toMatch(/Sincronizada em/)
    expect(row('b').textContent).toMatch(/Sincronizada em/)
    act(() => endSourceSync('a'))
    expect(row('a').textContent).toMatch(/Sincronizada em/)
  })
})
