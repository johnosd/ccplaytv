// Cobertura da bancada do benchmark (feature 063, T041/T042) sem navegador nem servidor:
// `fake-indexeddb` no lugar do IndexedDB e `fetch` servindo as fixtures em memória.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupBenchSources, runStages } from '../../src/bench/benchStages.ts'
import { runReal } from '../../src/bench/benchReal.ts'
import { generateFixture } from './fixtures.mjs'
import { findLeaks } from './report.mjs'

const BASE = 'http://127.0.0.1:4010'
const SIZE = 1000

// `fake-indexeddb` com 1 000 entradas leva ~1–3 s isolado e mais sob a carga da suíte inteira (6 workers).
vi.setConfig({ testTimeout: 60_000 })

/** Serve as respostas da fixture como o servidor do runner serve (incluindo o filtro por `category_id`). */
function serve(fixture) {
  return vi.fn(async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/playlist.m3u') return new Response(fixture.files['playlist.m3u'] ?? '')
    if (url.pathname === '/epg.xml') return new Response(fixture.files['epg.xml'] ?? '')
    if (url.pathname !== '/player_api.php') return new Response('', { status: 404 })
    const action = url.searchParams.get('action')
    const body = fixture.files[action ?? 'auth']
    if (body === undefined) return new Response('[]')
    const category = url.searchParams.get('category_id')
    if (!category) return new Response(body)
    return new Response(JSON.stringify(JSON.parse(body).filter((entry) => String(entry.category_id) === category)))
  })
}

const options = (format, mode, fixture) => ({ format, size: SIZE, mode, fixturesUrl: BASE, clock: fixture.clock })

afterEach(async () => {
  vi.unstubAllGlobals()
  await cleanupBenchSources()
})

describe('bancada do benchmark — modo stages', () => {
  for (const format of ['xtream', 'm3u', 'xmltv']) {
    it(`${format}: mede as etapas e o catálogo gravado bate com o esperado`, async () => {
      const fixture = generateFixture({ format, size: SIZE })
      vi.stubGlobal('fetch', serve(fixture))

      const result = await runStages(options(format, 'stages', fixture))

      expect(result).toMatchObject({ mode: 'stages', status: 'ok' })
      expect(result.counts).toEqual(fixture.expected)
      for (const key of ['fetchMs', 'parseMs', 'storeMs', 'totalMs']) expect(result.stages[key]).toBeGreaterThanOrEqual(0)
      expect(result.stages.classifyMs).toSatisfy((value) => (format === 'xmltv' ? value === null : value >= 0))
      expect(findLeaks(result)).toEqual([])
    })
  }
})

describe('bancada do benchmark — modo real', () => {
  for (const format of ['xtream', 'm3u', 'xmltv']) {
    it(`${format}: percorre o caminho do app e o que a pessoa vê bate com o esperado`, async () => {
      const fixture = generateFixture({ format, size: SIZE })
      vi.stubGlobal('fetch', serve(fixture))

      const result = await runReal(options(format, 'real', fixture))

      expect(result).toMatchObject({ mode: 'real', status: 'ok', realPath: { status: 'ok' } })
      expect(result.realPath.totalMs).toBeGreaterThan(0)
      expect(result.counts).toEqual(fixture.expected)
      expect(findLeaks(result)).toEqual([])
    })
  }

  it('sem navigator.storage grava "não informado", nunca um número', async () => {
    const fixture = generateFixture({ format: 'xmltv', size: 200 })
    vi.stubGlobal('fetch', serve(fixture))
    const result = await runReal({ ...options('xmltv', 'real', fixture), size: 200 })
    expect(result.storage).toEqual({
      before: { usage: 'não informado', quota: 'não informado' },
      after: { usage: 'não informado', quota: 'não informado' },
    })
  })

  it('com navigator.storage lê uso e quota antes e depois', async () => {
    const fixture = generateFixture({ format: 'xmltv', size: 200 })
    vi.stubGlobal('fetch', serve(fixture))
    // Cota plausível (80 MiB, a da TV): com 1 000 bytes o orçamento da feature 082 recusaria o guia, como deve.
    const QUOTA = 80 * 1024 * 1024
    const estimates = [{ usage: 10, quota: QUOTA }, { usage: 25, quota: QUOTA }]
    vi.stubGlobal('navigator', { language: 'pt-BR', languages: ['pt-BR'], storage: { estimate: async () => (estimates.length > 1 ? estimates.shift() : estimates[0]) } })
    // (o orçamento do guia, feature 082, também lê a estimativa no meio: a 2ª leitura se repete até o fim)
    const result = await runReal({ ...options('xmltv', 'real', fixture), size: 200 })
    expect(result.storage).toEqual({ before: { usage: 10, quota: QUOTA }, after: { usage: 25, quota: QUOTA } })
  })
})

describe('bancada do benchmark — falha', () => {
  it('registra a etapa e só o nome do erro, nunca a mensagem nem a URL', async () => {
    const fixture = generateFixture({ format: 'm3u', size: 200 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new TypeError('Failed to fetch http://127.0.0.1:4010/playlist.m3u')
        throw error
      }),
    )

    const stages = await runStages({ ...options('m3u', 'stages', fixture), size: 200 })
    expect(stages).toEqual({ mode: 'stages', status: 'failed', failedStage: 'fetch', errorName: 'TypeError' })
    expect(JSON.stringify(stages)).not.toContain('127.0.0.1')

    const real = await runReal({ ...options('m3u', 'real', fixture), size: 200 })
    expect(real).toMatchObject({ mode: 'real', status: 'failed', failedStage: 'import' })
    expect(JSON.stringify(real)).not.toContain('127.0.0.1')
  })
})
