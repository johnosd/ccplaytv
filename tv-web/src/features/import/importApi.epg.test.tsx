/**
 * Feature 030 — gatilhos de sincronização de EPG em `importApi` (D-008,
 * FR-009): importação concluída, e abrir a fonte com EPG vencido. Nada de
 * gatilho em falha, cancelamento, EPG em dia ou EPG desativado.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type ImportRunRecord, type SourceRecord } from '../../lib/catalog/db'
import { EPG_STALE_AFTER_MS } from '../../lib/epg/epgStatus'

const runImport = vi.fn()
const requestEpgSync = vi.fn()
vi.mock('../../lib/catalog/importRunner', () => ({ runImport: (...args: unknown[]) => runImport(...args) }))
vi.mock('../../lib/epg/epgRunner', () => ({ requestEpgSync: (...args: unknown[]) => requestEpgSync(...args) }))

import { useOpenSource, useResyncSource } from './importApi'

const SOURCE_ID = 'fonte-gatilho'
const NOW = 2_000_000_000_000

const SOURCE: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'u',
  providerPassword: 'p',
  providerMigratedAt: NOW - 1000,
  connectionState: 'synced',
  lastSuccessfulSyncAt: NOW - 1000,
  epgIdsCapturedAt: NOW - 1000,
  createdAt: 1,
  updatedAt: 1,
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const handleWith = (status: ImportRunRecord['status']) => ({
  runId: 'run-1',
  cancel: vi.fn(),
  completion: Promise.resolve({ status } as ImportRunRecord),
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })

describe('gatilhos de EPG em importApi', () => {
  beforeEach(async () => {
    requestEpgSync.mockReset()
    requestEpgSync.mockResolvedValue({ outcome: 'synced' })
    runImport.mockReset()
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    await db.sources.put(SOURCE)
  })

  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    await db.sources.delete(SOURCE_ID)
  })

  it('importação concluída sincroniza o EPG da fonte', async () => {
    runImport.mockResolvedValue(handleWith('completed'))
    const { result } = renderHook(() => useResyncSource(), { wrapper: wrapper() })

    await act(async () => {
      await result.current.mutateAsync(SOURCE_ID)
    })
    await flush()

    expect(requestEpgSync).toHaveBeenCalledWith(SOURCE_ID)
  })

  it('importação falha ou cancelada não sincroniza', async () => {
    for (const status of ['failed', 'cancelled'] as const) {
      runImport.mockResolvedValue(handleWith(status))
      const { result } = renderHook(() => useResyncSource(), { wrapper: wrapper() })
      await act(async () => {
        await result.current.mutateAsync(SOURCE_ID)
      })
      await flush()
    }
    expect(requestEpgSync).not.toHaveBeenCalled()
  })

  it('abrir a fonte com o EPG vencido (> 12 h) sincroniza, sem importar de novo', async () => {
    await db.sources.update(SOURCE_ID, { epgLastSyncAt: NOW - EPG_STALE_AFTER_MS - 1000 })
    const { result } = renderHook(() => useOpenSource(), { wrapper: wrapper() })

    const opened = await act(async () => result.current.mutateAsync(SOURCE_ID))

    expect(opened.triggered).toBe(false)
    expect(runImport).not.toHaveBeenCalled()
    expect(requestEpgSync).toHaveBeenCalledWith(SOURCE_ID)
  })

  it('abrir a fonte com o EPG em dia, desativado ou sem endereço não faz nada', async () => {
    const { result } = renderHook(() => useOpenSource(), { wrapper: wrapper() })

    await db.sources.update(SOURCE_ID, { epgLastSyncAt: NOW - 1000 })
    await act(async () => result.current.mutateAsync(SOURCE_ID))

    await db.sources.update(SOURCE_ID, { epgLastSyncAt: undefined, epgDisabled: true })
    await act(async () => result.current.mutateAsync(SOURCE_ID))

    await db.sources.update(SOURCE_ID, {
      epgDisabled: undefined,
      type: 'm3u_url',
      m3uUrl: 'http://lista.test/avulsa.m3u',
      providerDns: undefined,
      providerUsername: undefined,
      providerPassword: undefined,
    })
    await act(async () => result.current.mutateAsync(SOURCE_ID))

    expect(requestEpgSync).not.toHaveBeenCalled()
  })

  it('abrir uma fonte que ainda precisa migrar importa (id de EPG) e só então sincroniza', async () => {
    await db.sources.update(SOURCE_ID, { epgIdsCapturedAt: undefined })
    runImport.mockResolvedValue(handleWith('completed'))
    const { result } = renderHook(() => useOpenSource(), { wrapper: wrapper() })

    const opened = await act(async () => result.current.mutateAsync(SOURCE_ID))
    await flush()

    expect(opened.triggered).toBe(true)
    expect(runImport).toHaveBeenCalledTimes(1)
    expect(requestEpgSync).toHaveBeenCalledWith(SOURCE_ID)
  })
})
