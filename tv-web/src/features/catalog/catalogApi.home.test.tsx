import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useContinueCards, useHomeImages, useRecentlyAdded, type CatalogItemOut } from './catalogApi'
import { db, type CatalogRecord } from '../../lib/catalog/db'
import { renewCategoryItems, storeCategories } from '../../lib/catalog/catalogRepository'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'
import { PROVIDER_FIELDS_VERSION } from '../../lib/metadata/titleMetadataStore'
import * as catalogSearch from '../../lib/catalog/catalogSearch'
import * as derivedRows from '../../lib/catalog/catalogDerivedRows'

/**
 * Hooks locais da Home "Vitrine expandida" (feature 060): imagem 16:9 por prioridade, progresso real do "Continuar" e a
 * leitura adiada/ com cobertura de "Filmes adicionados". Tudo contra `fake-indexeddb`, sem rede.
 */

vi.mock('../../lib/catalog/catalogDerivedRows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/catalogDerivedRows')>()
  return { ...actual, iterateKindRecordBatches: vi.fn(actual.iterateKindRecordBatches) }
})

vi.mock('../../lib/catalog/catalogSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog/catalogSearch')>()
  return { ...actual, loadSearchIndex: vi.fn(actual.loadSearchIndex) }
})

const SOURCE_ID = 'source-home-hooks'

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

async function seedSource(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
}

function row(over: Partial<CatalogRecord>): CatalogRecord {
  return { sourceId: SOURCE_ID, generation: 1, kind: 'movie', name: 'x', originalName: 'x', groupOrder: 0, ...over }
}

async function add(record: CatalogRecord): Promise<number> {
  const [id] = await db.channels.bulkAdd([record], { allKeys: true })
  return id as number
}

afterEach(async () => {
  vi.mocked(catalogSearch.loadSearchIndex).mockClear()
  vi.mocked(derivedRows.iterateKindRecordBatches).mockClear()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.categories.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  await db.titleMetadata.where('sourceId').equals(SOURCE_ID).delete()
})

function item(over: Partial<CatalogItemOut>): CatalogItemOut {
  return { id: 'i', kind: 'movie', name: 'Filme', original_group: null, published: true, playable: true, ...over }
}

describe('useHomeImages (feature 060, D-006)', () => {
  it('fundo da listagem vence o do cache, que vence o que veio com a fileira; sem nenhum o item fica fora do mapa', async () => {
    await seedSource()
    const cachedId = await add(row({ name: 'Cache', originalName: 'Cache', providerStreamId: 'c1' }))
    await db.titleMetadata.put({
      stableId: buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'c1' }),
      sourceId: SOURCE_ID,
      kind: 'movie',
      provider: { backdropUrl: 'https://img.example.org/cache.jpg' },
      providerFetchedAt: Date.now(),
      providerVersion: PROVIDER_FIELDS_VERSION,
    })
    const items = [
      item({ id: 'listagem', kind: 'series', provider_backdrop_url: 'https://img.example.org/listagem.jpg' }),
      item({ id: String(cachedId), source_id: SOURCE_ID, provider_stream_id: 'c1', original_name: 'Cache' }),
      item({ id: 'so-extra' }),
      item({ id: 'nada' }),
    ]
    const extra = new Map([
      ['listagem', 'https://img.example.org/extra-listagem.jpg'],
      ['so-extra', 'https://img.example.org/extra.jpg'],
    ])
    const { result } = renderHook(() => useHomeImages(items, extra), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.get(String(cachedId))).toBe('https://img.example.org/cache.jpg'))
    expect(result.current.get('listagem')).toBe('https://img.example.org/listagem.jpg')
    expect(result.current.get('so-extra')).toBe('https://img.example.org/extra.jpg')
    expect(result.current.has('nada')).toBe(false)
  })
})

describe('useContinueCards (feature 060, FR-004/FR-010)', () => {
  it('filme: barra só com posição E duração conhecida (a da metadata já guardada); sem duração, sem progresso', async () => {
    await seedSource()
    await add(row({ name: 'Com duração', originalName: 'Com duração', providerStreamId: 'a1' }))
    await add(row({ name: 'Sem duração', originalName: 'Sem duração', providerStreamId: 'b1' }))
    const stable = (id: string) => buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: id })
    await updateProgress(stable('a1'), SOURCE_ID, 1800, db) // 30 min de 2 h
    await updateProgress(stable('b1'), SOURCE_ID, 600, db)
    await db.titleMetadata.put({
      stableId: stable('a1'),
      sourceId: SOURCE_ID,
      kind: 'movie',
      provider: { durationSeconds: 7200 },
      providerFetchedAt: Date.now(),
      providerVersion: PROVIDER_FIELDS_VERSION,
    })

    const { result } = renderHook(() => useContinueCards(SOURCE_ID), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data?.length).toBe(2))
    const byName = new Map(result.current.data!.map((card) => [card.item.name, card]))
    expect(byName.get('Com duração')!.progress).toEqual({ percent: 25, remainingSeconds: 5400 })
    expect(byName.get('Com duração')!.code).toBeNull()
    expect(byName.get('Sem duração')!.progress).toBeNull()
  })

  it('série: o episódio em andamento vira a série-pai, com o código T:E e a duração do episódio', async () => {
    await seedSource()
    await add(row({ kind: 'series', name: 'Série X', originalName: 'Série X', seriesId: 's1' }))
    await add(
      row({
        kind: 'episode',
        name: 'Ep 3',
        originalName: 'Ep 3',
        seriesId: 's1',
        providerStreamId: 'ep3',
        seasonNumber: 2,
        episodeNumber: 3,
        durationSeconds: 3000,
      }),
    )
    await updateProgress(
      buildStableId({ sourceId: SOURCE_ID, kind: 'episode', providerStreamId: 'ep3', seasonNumber: 2, episodeNumber: 3 }),
      SOURCE_ID,
      1200,
      db,
    )

    const { result } = renderHook(() => useContinueCards(SOURCE_ID), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.data?.length).toBe(1))
    const [card] = result.current.data!
    expect(card.item.kind).toBe('series')
    expect(card.item.name).toBe('Série X')
    expect(card.code).toBe('T2:E3')
    expect(card.progress).toEqual({ percent: 40, remainingSeconds: 1800 })
  })

  it('sem fonte não consulta nada', () => {
    const { result } = renderHook(() => useContinueCards(null), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useRecentlyAdded (feature 060, D-013)', () => {
  it('com `enabled: false` não lê o índice; ao habilitar, devolve os mais novos e a cobertura do mesmo índice', async () => {
    await seedSource()
    // Feature 086: as fileiras saem dos candidatos que a gravação da categoria guarda — por isso a categoria é gravada
    // pelo caminho normal (`renewCategoryItems`), e não com linhas soltas em `channels`.
    const [categoryId] = await storeCategories([
      { sourceId: SOURCE_ID, generation: 1, kind: 'movie', fetchMode: 'eager', name: 'Cat', order: 0, providerCategoryId: '1' },
    ], db)
    await renewCategoryItems({ sourceId: SOURCE_ID, generation: 1, kind: 'movie', categoryId, groupOrder: 0 }, [
      row({ name: 'Velho', originalName: 'Velho', providerStreamId: 'v', addedAt: 100 }),
      row({ name: 'Novo', originalName: 'Novo', providerStreamId: 'n', addedAt: 900 }),
    ], Date.now(), db)

    let enabled = false
    const { result, rerender } = renderHook(() => useRecentlyAdded(SOURCE_ID, 'movie', enabled), { wrapper: wrapper() })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(result.current.data).toBeUndefined()
    expect(vi.mocked(catalogSearch.loadSearchIndex)).not.toHaveBeenCalled()
    expect(vi.mocked(derivedRows.iterateKindRecordBatches)).not.toHaveBeenCalled()

    enabled = true
    rerender()
    await waitFor(() => expect(result.current.data?.map((entry) => entry.name)).toEqual(['Novo', 'Velho']))
    expect(typeof result.current.coveredCategories).toBe('number')
    expect(typeof result.current.totalCategories).toBe('number')
  })
})
