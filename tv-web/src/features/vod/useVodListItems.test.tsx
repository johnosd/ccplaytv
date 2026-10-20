import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { SYNC_SORT_MAX, useVodListItems, type VodListItemsInput } from './useVodListItems'
import { sortVodItems } from './vodSort'

function item(index: number, name: string, year: number | null = null): CatalogItemOut {
  return {
    id: String(index), kind: 'movie', name, original_group: 'G', published: true, playable: true, source_id: 'f',
    provider_stream_id: String(index), original_name: name, series_id: null, icon_url: null, category_id: 1,
    category_position: index, source_number: null, year, added_at: null, provider_rating: null,
    provider_genres: null, provider_backdrop_url: null, epg_channel_id: null, archive_days: null,
  }
}

const NAMES = ['Ação', 'acao', 'Zé', 'Água', 'Beta', 'beta', 'Alfa']
function list(count: number): CatalogItemOut[] {
  return Array.from({ length: count }, (_, index) => item(index, NAMES[index % NAMES.length], 1990 + (index % 30)))
}

function input(baseItems: CatalogItemOut[], overrides: Partial<VodListItemsInput> = {}): VodListItemsInput {
  return {
    baseItems, enteredFavorites: false, enteredHistory: false, enteredAll: true, kindSortFields: undefined, sortOption: 'az',
    searchActive: false, belowMinimum: true, searchTerm: '', entryKey: '"all"', ...overrides,
  }
}

const ids = (items: CatalogItemOut[]) => items.map((entry) => entry.id)

describe('useVodListItems (feature 084)', () => {
  it('lista grande: pending e depois a mesma ordem de sortVodItems', async () => {
    const base = list(SYNC_SORT_MAX + 500)
    const { result } = renderHook(() => useVodListItems(input(base)))
    expect(result.current.pending).toBe(true)
    expect(result.current.items).toEqual([])
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(ids(result.current.items)).toEqual(ids(sortVodItems(base, 'az')))
    expect(result.current.effectiveSortOption).toBe('az')
  })

  it('lista até SYNC_SORT_MAX ordena na hora, sem pending', () => {
    const base = list(SYNC_SORT_MAX)
    const { result } = renderHook(() => useVodListItems(input(base)))
    expect(result.current.pending).toBe(false)
    expect(ids(result.current.items)).toEqual(ids(sortVodItems(base, 'az')))
  })

  it('trocar a opção no meio aborta a anterior: nunca fica o resultado velho por cima', async () => {
    const base = list(SYNC_SORT_MAX + 500)
    const { result, rerender } = renderHook((props: VodListItemsInput) => useVodListItems(props), { initialProps: input(base) })
    await waitFor(() => expect(result.current.pending).toBe(false))
    rerender(input(base, { sortOption: 'year' }))
    rerender(input(base, { sortOption: 'az' }))
    rerender(input(base, { sortOption: 'year' }))
    await act(async () => {})
    await waitFor(() => expect(ids(result.current.items)).toEqual(ids(sortVodItems(base, 'year'))))
    expect(result.current.effectiveSortOption).toBe('year')
  })

  it('mantém a lista anterior da mesma entrada enquanto reordena; outra entrada volta a pending', async () => {
    const base = list(SYNC_SORT_MAX + 500)
    const { result, rerender } = renderHook((props: VodListItemsInput) => useVodListItems(props), { initialProps: input(base) })
    await waitFor(() => expect(result.current.pending).toBe(false))
    const previous = result.current.items

    rerender(input(base, { sortOption: 'year' }))
    expect(result.current.pending).toBe(false)
    expect(result.current.items).toBe(previous)
    await waitFor(() => expect(ids(result.current.items)).toEqual(ids(sortVodItems(base, 'year'))))

    rerender(input(list(SYNC_SORT_MAX + 10), { sortOption: 'year', entryKey: '"outra"' }))
    expect(result.current.pending).toBe(true)
    expect(result.current.items).toEqual([])
  })

  it('favoritos e histórico não ordenam; ordem da fonte devolve a lista como veio', () => {
    const base = list(SYNC_SORT_MAX + 500)
    const favorites = renderHook(() => useVodListItems(input(base, { enteredFavorites: true, enteredAll: false })))
    expect(favorites.result.current.items).toBe(base)
    expect(favorites.result.current.availableOptions).toEqual([])
    const source = renderHook(() => useVodListItems(input(base, { sortOption: 'source' })))
    expect(source.result.current.items).toBe(base)
    expect(source.result.current.pending).toBe(false)
  })

  it('opção indisponível nesta entrada cai na ordem da fonte (D-008)', () => {
    const base = list(10).map((entry) => ({ ...entry, year: null }))
    const { result } = renderHook(() => useVodListItems(input(base, { sortOption: 'year' })))
    expect(result.current.effectiveSortOption).toBe('source')
    expect(result.current.availableOptions).toEqual(['source', 'az'])
  })
})
