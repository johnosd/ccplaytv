import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCreateSource, useImportJob } from './importApi'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useCreateSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envia a requisição e retorna source_id/import_job_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ source_id: 'source-1', import_job_id: 'job-1' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )

    const { result } = renderHook(() => useCreateSource(), { wrapper: createWrapper() })

    result.current.mutate({
      type: 'm3u_url',
      display_name: 'Minha lista',
      m3u_url: 'https://exemplo.test/lista.m3u',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ source_id: 'source-1', import_job_id: 'job-1' })

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/sources')
    const body = JSON.parse(init.body as string)
    expect(body.type).toBe('m3u_url')
    expect(body.request_key).toBeTruthy()
  })
})

describe('useImportJob', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('faz polling ate o job chegar a um estado terminal', async () => {
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount += 1
        const status = callCount === 1 ? 'running' : 'completed'
        return new Response(
          JSON.stringify({
            id: 'job-1',
            source_id: 'source-1',
            status,
            current_step: status === 'completed' ? 'done' : 'classifying',
            counts: {
              entries_read: 0,
              channels: 0,
              movies: 0,
              series: 0,
              episodes: 0,
              unclassified: 0,
              invalid: 0,
            },
            warnings: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            finished_at: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    const { result } = renderHook(() => useImportJob('job-1'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.data?.status).toBe('completed'), { timeout: 4000 })

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
