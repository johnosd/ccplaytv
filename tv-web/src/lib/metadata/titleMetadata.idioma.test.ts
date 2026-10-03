import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb, type SourceRecord } from '../catalog/db'
import type { AppLanguage } from '../i18n/languages'
import { ensureTitleMetadata, mergeTitleMetadata } from './titleMetadata'
import { saveTmdbKey } from './tmdbKeyRepository'

/**
 * Feature 054, Fase 10 (US2): cadeia da sinopse por idioma, provedor continua
 * vencendo, `no_match` não é invalidado por troca de idioma e a mescla não toca a
 * rede. O contrato travado cobre rebusca e falha; aqui ficam os desdobramentos.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

interface Scenario {
  /** `info` do provedor (`get_vod_info`). */
  info: Record<string, unknown>
  /** Sinopse que o TMDB devolve por `language=` (ausente = vazia). */
  overviews: Record<string, string>
  originalLanguage: string
  searchResults?: unknown[]
}

let database: CatalogDb
let fetchImpl: ReturnType<typeof vi.fn>

const tmdbUrls = () =>
  fetchImpl.mock.calls.map((call) => new URL(String((call as unknown[])[0]))).filter((url) => url.hostname === 'api.themoviedb.org')
const movieLanguages = () => tmdbUrls().filter((url) => url.pathname === '/3/movie/603').map((url) => url.searchParams.get('language'))

function install(scenario: Scenario): void {
  fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/3/authentication') return json({ success: true })
    if (url.hostname === 'painel.test') return json({ info: scenario.info, movie_data: {} })
    if (url.pathname === '/3/movie/603') {
      return json({
        id: 603,
        original_language: scenario.originalLanguage,
        release_date: '1999-03-31',
        overview: scenario.overviews[url.searchParams.get('language') ?? ''] ?? '',
        videos: { results: [] },
      })
    }
    if (url.pathname === '/3/search/movie') return json({ results: scenario.searchResults ?? [] })
    return json({ status_code: 34 }, 404)
  })
}

beforeEach(async () => {
  database = new CatalogDb(`test-idioma-meta-${Math.random().toString(36).slice(2)}`)
  await database.open()
  await database.sources.add(PANEL)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

async function setup(scenario: Scenario): Promise<number> {
  install(scenario)
  await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
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

describe('sinopse do TMDB por idioma (feature 054)', () => {
  it('idioma do app sem sinopse: cai para en-US e diz que veio em inglês', async () => {
    const id = await setup({ info: { tmdb_id: 603 }, overviews: { 'en-US': 'Story in English.' }, originalLanguage: 'ja' })

    const view = await open(id, 'es')

    expect(view.synopsis).toEqual({ value: 'Story in English.', origin: 'tmdb', language: 'en' })
    expect(movieLanguages()).toEqual(['es-ES', 'en-US']) // para no primeiro que traz texto — não pede o original
  })

  it('app em inglês e en-US vazio: vai direto ao idioma original, marcado com ele', async () => {
    const id = await setup({ info: { tmdb_id: 603 }, overviews: { ja: 'あらすじ' }, originalLanguage: 'ja' })

    const view = await open(id, 'en')

    expect(view.synopsis).toEqual({ value: 'あらすじ', origin: 'tmdb', language: 'ja' })
    expect(movieLanguages()).toEqual(['en-US', 'ja'])
  })

  it('sinopse no idioma do app: sem marca de idioma e sem chamada extra', async () => {
    const id = await setup({ info: { tmdb_id: 603 }, overviews: { 'es-ES': 'Historia.' }, originalLanguage: 'en' })

    const view = await open(id, 'es')

    expect(view.synopsis).toEqual({ value: 'Historia.', origin: 'tmdb' })
    expect(movieLanguages()).toEqual(['es-ES'])
  })

  it('o provedor continua vencendo em qualquer idioma (FR-005)', async () => {
    const id = await setup({ info: { tmdb_id: 603, plot: 'Sinopse do provedor.' }, overviews: { 'en-US': 'TMDB story.' }, originalLanguage: 'en' })

    const view = await open(id, 'en')

    expect(view.synopsis).toEqual({ value: 'Sinopse do provedor.', origin: 'provider' })
  })

  it('"sem correspondência" não é invalidado por trocar de idioma (o idioma não muda o casamento)', async () => {
    const id = await setup({ info: {}, overviews: {}, originalLanguage: 'en', searchResults: [] })

    await open(id, 'pt')
    const afterFirst = tmdbUrls().length
    expect(tmdbUrls().some((url) => url.pathname === '/3/search/movie')).toBe(true)

    await open(id, 'en')
    expect(tmdbUrls()).toHaveLength(afterFirst)
  })

  it('mergeTitleMetadata é pura: não consulta a rede nem depende do idioma para decidir a sinopse', () => {
    install({ info: {}, overviews: {}, originalLanguage: 'en' })
    const tmdb = { status: 'matched' as const, tmdbId: 1, language: 'pt' as const, fields: { synopsis: 'Texto.' } }

    expect(mergeTitleMetadata(undefined, tmdb, 'en').synopsis).toEqual({ value: 'Texto.', origin: 'tmdb' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
