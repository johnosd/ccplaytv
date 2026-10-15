import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import type { AppLanguage } from '../i18n/languages'
import { ensureTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'

/**
 * Feature 054 — contrato de US2: sinopse/metadados do TMDB no idioma do app,
 * rebuscados SÓ ao abrir o detalhe (FR-007), sem apagar o guardado se falhar (FR-008).
 * `sdd/specs/054-idioma-do-app/logic/idioma-do-app.md` §4.
 */

const SOURCE_ID = 'fonte-1'
const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0)

const PANEL: SourceRecord = {
  id: SOURCE_ID,
  type: 'provider_credentials',
  displayName: 'Painel',
  providerDns: 'http://painel.test',
  providerUsername: 'usuario',
  providerPassword: 'senha',
  connectionState: 'synced',
  activeGeneration: 1,
  createdAt: 1,
  updatedAt: 1,
}

const SYNOPSIS: Record<string, string> = {
  'pt-BR': 'História em português.',
  'en-US': 'Story in English.',
  'es-ES': 'Historia en español.',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let database: CatalogDb
let tmdbDown = false
let fetchImpl: ReturnType<typeof vi.fn>

const movieCalls = () =>
  fetchImpl.mock.calls
    .map((call) => new URL(String((call as unknown[])[0])))
    .filter((url) => url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/603')

beforeEach(async () => {
  database = new CatalogDb(`test-idioma-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL)
  tmdbDown = false
  fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/3/authentication') return json({ success: true })
    if (url.hostname === 'painel.test') return json({ info: { tmdb_id: 603 }, movie_data: {} })
    if (url.pathname === '/3/movie/603') {
      if (tmdbDown) throw new TypeError(`Failed to fetch ${url.href}`)
      return json({
        id: 603,
        original_language: 'en',
        release_date: '1999-03-31',
        overview: SYNOPSIS[url.searchParams.get('language') ?? ''] ?? '',
        videos: { results: [] },
      })
    }
    return json({ status_code: 34 }, 404)
  })
  await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

async function addMovie(): Promise<number> {
  return (await database.channels.add({
    sourceId: SOURCE_ID,
    generation: 1,
    kind: 'movie',
    name: 'Matrix',
    originalName: 'Matrix',
    groupOrder: 0,
    providerStreamId: '100',
    year: 1999,
  })) as number
}

function open(movieId: number, language: AppLanguage) {
  return ensureTitleMetadata(movieId, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch, language })
}

describe('metadata do TMDB no idioma do app — contrato (feature 054)', () => {
  it('FR-006/FR-007: trocar o idioma rebusca ao abrir o detalhe (com o `language` novo); reabrir no mesmo idioma não consulta de novo', async () => {
    const movieId = await addMovie()

    const first = await open(movieId, 'pt')
    expect(first.synopsis).toEqual({ value: SYNOPSIS['pt-BR'], origin: 'tmdb' })
    const afterFirst = movieCalls().length

    await open(movieId, 'pt')
    expect(movieCalls()).toHaveLength(afterFirst)

    const second = await open(movieId, 'en')
    expect(movieCalls()).toHaveLength(afterFirst + 1)
    expect(movieCalls().at(-1)?.searchParams.get('language')).toBe('en-US')
    expect(second.synopsis).toEqual({ value: SYNOPSIS['en-US'], origin: 'tmdb' })
  })

  it('FR-008: rebusca que falha (sem rede) mantém o guardado, tenta UMA vez por abertura e o detalhe nunca lança', async () => {
    const movieId = await addMovie()
    await open(movieId, 'pt')
    const afterFirst = movieCalls().length

    tmdbDown = true
    const offline = await open(movieId, 'es')
    expect(offline.synopsis).toEqual({ value: SYNOPSIS['pt-BR'], origin: 'tmdb' })
    expect(movieCalls()).toHaveLength(afterFirst + 1)

    tmdbDown = false
    const back = await open(movieId, 'es')
    expect(back.synopsis).toEqual({ value: SYNOPSIS['es-ES'], origin: 'tmdb' })
  })
})
