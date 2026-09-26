import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateSource, useImportJob } from './importApi'
import { db } from '../../lib/catalog/db'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const LISTA = ['#EXTM3U', '#EXTINF:-1 group-title="Canais",Canal Um', 'http://exemplo.test/1.ts'].join(
  '\n',
)

describe('importApi', () => {
  beforeEach(() => {
    // A importação dispara de verdade ao criar a fonte. Sem isto, o teste
    // sai para a rede e escreve no banco compartilhado depois que o
    // `afterEach` já limpou as tabelas.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(LISTA, { status: 200 }))),
    )
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await db.sources.clear()
    await db.importRuns.clear()
    await db.channels.clear()
  })

  describe('useCreateSource', () => {
    it('cria a fonte no IndexedDB e retorna source_id/import_job_id', async () => {
      const { result } = renderHook(() => useCreateSource(), { wrapper: createWrapper() })

      result.current.mutate({
        type: 'm3u_url',
        display_name: 'Minha lista local',
        m3u_url: 'https://exemplo.test/lista.m3u',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      const data = result.current.data
      expect(data?.source_id).toBeTruthy()
      expect(data?.import_job_id).toBeTruthy()

      const source = await db.sources.get(data!.source_id)
      expect(source).toBeTruthy()
      expect(source?.displayName).toBe('Minha lista local')
      expect(source?.m3uUrl).toBe('https://exemplo.test/lista.m3u')

      // A importação termina antes do teste seguinte limpar as tabelas.
      await waitFor(async () =>
        expect((await db.importRuns.get(data!.import_job_id))?.finishedAt).toBeDefined(),
      )
    })
  })

  describe('useImportJob', () => {
    it('busca o status do job do IndexedDB', async () => {
      const jobId = 'test-job'
      await db.importRuns.put({
        id: jobId,
        sourceId: 'test-source',
        generation: 1,
        status: 'running',
        step: 'parsing',
        entriesRead: 42,
        channelsStored: 10,
        discardedByType: 2,
        invalidCount: 0,
        truncatedByStorage: false,
        startedAt: Date.now(),
      })

      const { result } = renderHook(() => useImportJob(jobId), { wrapper: createWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.status).toBe('running')
      expect(result.current.data?.counts.entries_read).toBe(42)
    })
  })
})
