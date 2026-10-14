import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogDb } from '../catalog/db'
import { saveTmdbKey } from './tmdbKeyRepository'
import { loadPersonCredits } from './tmdbPeople'

/** Feature 054, Fase 10 (US2): a filmografia do ator segue o idioma do app e só é rebuscada ao abrir o ator. */

const KEY = '0123456789abcdef0123456789abcdef'
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

let database: CatalogDb
let down = false
let fetchImpl: ReturnType<typeof vi.fn>

const TITLE: Record<string, string> = { 'pt-BR': 'Filme PT', 'en-US': 'Movie EN', 'es-ES': 'Película ES' }

beforeEach(async () => {
  database = new CatalogDb(`test-people-idioma-${Math.random().toString(36).slice(2)}`)
  await database.open()
  down = false
  fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.pathname === '/3/authentication') return json({ success: true })
    if (url.pathname === '/3/person/1') {
      if (down) throw new TypeError(`Failed to fetch ${url.href}`)
      return json({
        id: 1,
        name: 'Pessoa',
        combined_credits: { cast: [{ id: 10, media_type: 'movie', title: TITLE[url.searchParams.get('language') ?? ''], release_date: '2001-01-01', popularity: 1 }] },
      })
    }
    return json({ status_code: 34 }, 404)
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

const personLanguages = () =>
  fetchImpl.mock.calls
    .map((call) => new URL(String((call as unknown[])[0])))
    .filter((url) => url.pathname === '/3/person/1')
    .map((url) => url.searchParams.get('language'))

async function open(language: 'pt' | 'en' | 'es') {
  const options = { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch, language }
  return loadPersonCredits(1, options)
}

describe('loadPersonCredits por idioma (feature 054)', () => {
  it('busca no idioma do app e reabre no mesmo idioma sem nova requisição', async () => {
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })

    const first = await open('en')
    await open('en')

    expect(first.status === 'ok' && first.person.credits[0].title).toBe('Movie EN')
    expect(personLanguages()).toEqual(['en-US'])
    expect((await database.tmdbPeople.get(1))?.language).toBe('en')
  })

  it('trocar o idioma rebusca ao abrir o ator; falha da rebusca mantém o guardado', async () => {
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    await open('pt')

    const other = await open('es')
    expect(other.status === 'ok' && other.person.credits[0].title).toBe('Película ES')

    down = true
    const offline = await open('en')
    expect(offline.status === 'ok' && offline.person.credits[0].title).toBe('Película ES') // não perde o que tinha
    expect(personLanguages()).toEqual(['pt-BR', 'es-ES', 'en-US'])
  })

  it('registro anterior à 054 (sem idioma) conta como português', async () => {
    await saveTmdbKey(KEY, { database, now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch })
    await database.tmdbPeople.put({ personId: 1, name: 'Pessoa', credits: [{ tmdbId: 10, kind: 'movie', title: 'Antigo' }], fetchedAt: NOW })

    const same = await open('pt')
    expect(same.status === 'ok' && same.person.credits[0].title).toBe('Antigo')
    expect(personLanguages()).toEqual([])
  })
})
