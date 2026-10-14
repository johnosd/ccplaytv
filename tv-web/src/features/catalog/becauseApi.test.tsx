import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBecauseYouWatched } from './becauseApi'
import type { CatalogItemOut } from './catalogApi'

/**
 * "Porque você assistiu" (feature 060, FR-014/FR-015 — `logic/fileiras-e-dados.md` §2): sem chave TMDB nada além do
 * IndexedDB; sem semelhante na lista a fileira não existe; com semelhantes, só os que estão na lista, na ordem do TMDB.
 */

const mocks = vi.hoisted(() => ({
  tmdbState: 'connected' as 'connected' | 'not_configured' | undefined,
  similar: { status: 'loading' } as unknown,
  seed: null as unknown,
  loadBecauseSeed: vi.fn(),
  loadCatalogItems: vi.fn(),
}))

vi.mock('./catalogApi', () => ({
  useTmdbStatus: () => ({ data: mocks.tmdbState === undefined ? undefined : { state: mocks.tmdbState } }),
  useSimilarTitles: () => mocks.similar,
  loadBecauseSeed: mocks.loadBecauseSeed,
  loadCatalogItems: mocks.loadCatalogItems,
}))

function item(id: string, name: string): CatalogItemOut {
  return { id, kind: 'movie', name, original_group: 'Ficção', published: true, playable: true, source_id: 'src-b', provider_stream_id: `p${id}` }
}

const SEED = item('1', 'Duna')

function renderBecause() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useBecauseYouWatched('src-b', 'any'), { wrapper })
}

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mocks.tmdbState = 'connected'
  mocks.similar = { status: 'loading' }
  mocks.loadBecauseSeed.mockReset().mockResolvedValue(SEED)
  mocks.loadCatalogItems.mockReset().mockImplementation(async (ids: string[]) => ids.map((id) => item(id, `Filme ${id}`)))
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  fetchSpy.mockRestore()
})

describe('useBecauseYouWatched', () => {
  it('sem chave TMDB: a fileira não existe e nada é lido nem requisitado', async () => {
    mocks.tmdbState = 'not_configured'
    const { result } = renderBecause()

    await waitFor(() => expect(result.current).toBeNull())
    expect(mocks.loadBecauseSeed).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sem nenhum título concluído: a fileira não existe', async () => {
    mocks.loadBecauseSeed.mockResolvedValue(null)
    const { result } = renderBecause()

    await waitFor(() => expect(result.current).toBeNull())
  })

  it('semente sem semelhante na lista: a fileira não existe, nunca um card inventado', async () => {
    mocks.similar = { status: 'ready', titles: [{ localItemId: undefined, backdropUrl: 'https://img.example.org/x.jpg' }, { localItemId: '1' }] }
    const { result } = renderBecause()

    await waitFor(() => expect(result.current).toBeNull())
    expect(mocks.loadCatalogItems).not.toHaveBeenCalled()
  })

  it('com semelhantes: só os que estão na lista, na ordem do TMDB e sem o próprio título semente', async () => {
    mocks.similar = {
      status: 'ready',
      titles: [
        { localItemId: '9', backdropUrl: 'https://img.example.org/9.jpg' },
        { localItemId: undefined },
        { localItemId: '1' }, // o próprio seed
        { localItemId: '4' },
      ],
    }
    const { result } = renderBecause()

    await waitFor(() => expect(result.current).toBeTruthy()) // `undefined` = ainda carregando
    const row = result.current
    expect(row?.seed.name).toBe('Duna')
    expect(row?.items.map((entry) => entry.id)).toEqual(['9', '4'])
    expect(row?.images.get('9')).toBe('https://img.example.org/9.jpg')
    expect(row?.images.has('4')).toBe(false)
  })
})
