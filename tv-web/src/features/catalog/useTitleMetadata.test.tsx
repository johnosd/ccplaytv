import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRemoveTmdbKey, useTitleMetadata } from './catalogApi'
import { db } from '../../lib/catalog/db'
import { storeProviderMetadata } from '../../lib/metadata/titleMetadataStore'

/** Feature 032 — `useTitleMetadata` (D-002/FR-024): só busca quando há item, e relê o estado do TMDB depois. */

const SOURCE_ID = 'source-use-title-metadata'

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { queryClient, invalidate, Wrapper }
}

beforeEach(async () => {
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.titleMetadata.where('sourceId').equals(SOURCE_ID).delete()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.titleMetadata.where('sourceId').equals(SOURCE_ID).delete()
  await db.integrations.clear()
})

describe('useTitleMetadata', () => {
  it('sem item (null) não consulta nada: a query fica desligada', async () => {
    const { Wrapper } = setup()
    const { result } = renderHook(() => useTitleMetadata(null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('devolve a visão mesclada do cache e manda reler o estado do TMDB (FR-024)', async () => {
    const movieId = (await db.channels.add({
      sourceId: SOURCE_ID,
      generation: 1,
      kind: 'movie',
      name: 'Matrix',
      originalName: 'Matrix',
      groupOrder: 0,
      providerStreamId: '100',
    })) as number
    const record = (await db.channels.get(movieId))!
    // Cache do provedor fresco: nenhuma requisição de rede é necessária.
    await storeProviderMetadata(db, record, { synopsis: 'Do cache.' }, undefined, Date.now())

    const { Wrapper, invalidate } = setup()
    const { result } = renderHook(() => useTitleMetadata(String(movieId)), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.data?.synopsis).toEqual({ value: 'Do cache.', origin: 'provider' }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tmdb-status'] })
  })

  it('remover a chave DESCARTA a metadata em memória (não só invalida): a sinopse do TMDB não reaparece por um instante (FR-014)', async () => {
    await db.integrations.put({ id: 'tmdb', key: '0123456789abcdef0123456789abcdef', format: 'v3', state: 'connected', lastTestedAt: 1 })
    await db.titleMetadata.put({
      stableId: `${SOURCE_ID}|movie|id:9`,
      sourceId: SOURCE_ID,
      kind: 'movie',
      provider: { synopsis: 'Do provedor.' },
      tmdb: { status: 'matched', tmdbId: 1, fields: { genres: 'Drama' } },
      tmdbFetchedAt: 1,
    })
    const { queryClient, Wrapper } = setup()
    queryClient.setQueryData(['title-metadata', '42'], { genres: { value: 'Drama', origin: 'tmdb' } })
    const { result } = renderHook(() => useRemoveTmdbKey(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(queryClient.getQueryData(['title-metadata', '42'])).toBeUndefined()
    expect(await db.integrations.get('tmdb')).toBeUndefined()
    const row = await db.titleMetadata.get(`${SOURCE_ID}|movie|id:9`)
    expect(row?.provider?.synopsis).toBe('Do provedor.')
    expect(row?.tmdb).toBeUndefined()
  })

  it('id que não é um filme/série do catálogo resolve para visão vazia, sem erro', async () => {
    const { Wrapper } = setup()
    const { result } = renderHook(() => useTitleMetadata('999999'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({})
    expect(result.current.isError).toBe(false)
  })
})
