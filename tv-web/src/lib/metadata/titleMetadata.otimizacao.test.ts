import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { ensureTitleMetadata } from './titleMetadata'
import { removeTmdbKey, saveTmdbKey } from './tmdbKeyRepository'

const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 8, 12)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

let database: CatalogDb

beforeEach(async () => {
  database = new CatalogDb(`test-title-meta-065-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add({
    id: 'lista-a',
    type: 'm3u_url',
    displayName: 'Lista sintética',
    m3uUrl: 'http://synthetic.invalid/list.m3u',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: NOW,
    updatedAt: NOW,
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

async function addMovie(): Promise<number> {
  return (await database.channels.add({
    sourceId: 'lista-a',
    generation: 1,
    kind: 'movie',
    name: 'Matrix',
    originalName: 'Matrix',
    year: 2020,
    groupOrder: 0,
  })) as number
}

describe('titleMetadata — leases e contexto (065/T013)', () => {
  it('cancelar um consumidor não interrompe o outro nem duplica a chamada', async () => {
    const movieId = await addMovie()
    const body = deferred<Response>()
    let detailCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/search/movie') return json({ results: [{ id: 1, title: 'Matrix', release_date: '2020-01-01' }] })
      detailCalls += 1
      return body.promise
    })
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    fetchImpl.mockClear()

    const firstController = new AbortController()
    const first = ensureTitleMetadata(movieId, {
      database,
      now: () => NOW,
      language: 'pt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: firstController.signal,
    })
    const second = ensureTitleMetadata(movieId, {
      database,
      now: () => NOW,
      language: 'pt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await vi.waitFor(() => expect(detailCalls).toBe(1))
    firstController.abort()
    await expect(first).resolves.toEqual({})

    body.resolve(json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'Sinopse compartilhada', original_language: 'pt' }))
    await expect(second).resolves.toMatchObject({ synopsis: { value: 'Sinopse compartilhada' } })
    expect(detailCalls).toBe(1)
  })

  it('resposta de idioma antigo que chega depois não substitui o contexto novo', async () => {
    const movieId = await addMovie()
    const responses = new Map<string, ReturnType<typeof deferred<Response>>>()
    const languages: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/search/movie') return json({ results: [{ id: 1, title: 'Matrix', release_date: '2020-01-01' }] })
      const language = url.searchParams.get('language') ?? 'unknown'
      languages.push(language)
      const pending = deferred<Response>()
      responses.set(language, pending)
      return pending.promise
    })
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    fetchImpl.mockClear()

    const pt = ensureTitleMetadata(movieId, {
      database,
      now: () => NOW,
      language: 'pt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await vi.waitFor(() => expect(languages).toContain('pt-BR'))
    const en = ensureTitleMetadata(movieId, {
      database,
      now: () => NOW,
      language: 'en',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await vi.waitFor(() => expect(languages).toContain('en-US'))

    responses.get('en-US')?.resolve(json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'English current', original_language: 'en' }))
    await expect(en).resolves.toMatchObject({ synopsis: { value: 'English current' } })
    responses.get('pt-BR')?.resolve(json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'Português antigo', original_language: 'pt' }))
    await expect(pt).resolves.toMatchObject({ synopsis: { value: 'Português antigo' } })

    const stored = await database.titleMetadata.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0].tmdb?.status).toBe('matched')
    if (stored[0].tmdb?.status === 'matched') {
      expect(stored[0].tmdb.language).toBe('en')
      expect(stored[0].tmdb.fields.synopsis).toBe('English current')
    }
  })

  it.each(['key-removed', 'key-replaced', 'generation-replaced', 'source-removed'])('resposta antiga não é persistida após %s', async change => {
    const movieId = await addMovie()
    const body = deferred<Response>()
    let started = false
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/search/movie') return json({ results: [{ id: 1, title: 'Matrix', release_date: '2020-01-01' }] })
      started = true
      return body.promise
    })
    const options = { database, now: () => NOW, language: 'pt' as const, fetchImpl: fetchImpl as unknown as typeof fetch }
    await saveTmdbKey(KEY, options)
    const pending = ensureTitleMetadata(movieId, options)
    await vi.waitFor(() => expect(started).toBe(true))

    if (change === 'key-removed') await removeTmdbKey({ database })
    if (change === 'key-replaced') {
      await saveTmdbKey('fedcba9876543210fedcba9876543210', {
        ...options,
        fetchImpl: (async () => json({ success: true })) as unknown as typeof fetch,
      })
    }
    if (change === 'generation-replaced') await database.sources.update('lista-a', { activeGeneration: 2 })
    if (change === 'source-removed') await database.sources.delete('lista-a')
    body.resolve(json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'Resposta do contexto antigo', original_language: 'pt' }))
    await pending

    expect(await database.titleMetadata.count()).toBe(0)
    if (change === 'key-removed') expect(await database.integrations.get('tmdb')).toBeUndefined()
    if (change === 'key-replaced') expect((await database.integrations.get('tmdb'))?.key).toBe('fedcba9876543210fedcba9876543210')
  })

  it('a mesma obra em outra lista tem tentativa e persistência separadas', async () => {
    const firstId = await addMovie()
    const source = (await database.sources.get('lista-a'))!
    await database.sources.add({ ...source, id: 'lista-b' })
    const record = (await database.channels.get(firstId))!
    const secondId = (await database.channels.add({ ...record, id: undefined, sourceId: 'lista-b' })) as number
    const bodyA = deferred<Response>()
    const bodyB = deferred<Response>()
    let details = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/search/movie') return json({ results: [{ id: 1, title: 'Matrix', release_date: '2020-01-01' }] })
      details += 1
      return details === 1 ? bodyA.promise : bodyB.promise
    })
    const options = { database, now: () => NOW, language: 'pt' as const, fetchImpl: fetchImpl as unknown as typeof fetch }
    await saveTmdbKey(KEY, options)
    const first = ensureTitleMetadata(firstId, options)
    await vi.waitFor(() => expect(details).toBe(1))
    const second = ensureTitleMetadata(secondId, options)
    await vi.waitFor(() => expect(details).toBe(2))
    bodyB.resolve(json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'Lista B', original_language: 'pt' }))
    await second
    bodyA.resolve(json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'Lista A', original_language: 'pt' }))
    await first

    const rows = await database.titleMetadata.toArray()
    expect(rows.map(row => row.sourceId).sort()).toEqual(['lista-a', 'lista-b'])
    expect(details).toBe(2)
  })

  it('último consumidor cancelado aborta transporte, ignora chegada tardia e libera nova tentativa', async () => {
    const movieId = await addMovie()
    const oldBody = deferred<Response>()
    let signal: AbortSignal | null | undefined
    let details = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname === '/3/authentication') return json({ success: true })
      if (url.pathname === '/3/search/movie') return json({ results: [{ id: 1, title: 'Matrix', release_date: '2020-01-01' }] })
      details += 1
      if (details === 1) {
        signal = init?.signal
        return oldBody.promise
      }
      return json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'Resultado novo', original_language: 'pt' })
    })
    const options = { database, now: () => NOW, language: 'pt' as const, fetchImpl: fetchImpl as unknown as typeof fetch }
    await saveTmdbKey(KEY, options)
    const controller = new AbortController()
    const pending = ensureTitleMetadata(movieId, { ...options, signal: controller.signal })
    await vi.waitFor(() => expect(details).toBe(1))
    controller.abort()
    await expect(pending).resolves.toEqual({})
    expect(signal?.aborted).toBe(true)

    await expect(ensureTitleMetadata(movieId, options)).resolves.toMatchObject({ synopsis: { value: 'Resultado novo' } })
    oldBody.resolve(json({ id: 1, title: 'Matrix', release_date: '2020-01-01', overview: 'Resultado abandonado', original_language: 'pt' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    const stored = (await database.titleMetadata.toArray())[0].tmdb
    expect(stored?.status).toBe('matched')
    if (stored?.status === 'matched') expect(stored.fields.synopsis).toBe('Resultado novo')
    expect(details).toBe(2)
  })
})
