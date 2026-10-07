// Cobertura do runner do benchmark (feature 063, T044/T045) sem navegador: argumentos,
// servidor das fontes fictícias (local, 127.0.0.1) e a junção dos dois modos de uma combinação.
import { afterEach, describe, expect, it } from 'vitest'
import { generateFixture } from './fixtures.mjs'
import { buildResult, createBenchServer, mergeCombination, parseArgs } from './run-import-bench.mjs'

describe('runner — argumentos', () => {
  it('padrões: os três formatos, 1k/10k/100k, semente 1, sem throttling, app em :5173', () => {
    expect(parseArgs([], {})).toEqual({
      formats: ['xtream', 'm3u', 'xmltv'],
      sizes: [1000, 10000, 100000],
      seed: 1,
      cpu: 1,
      device: undefined,
      appUrl: 'http://localhost:5173',
      serveOnly: false,
    })
    expect(parseArgs([], { CCPLAY_APP_URL: 'http://localhost:4173' }).appUrl).toBe('http://localhost:4173')
  })

  it('lê as opções e reprova o que não existe, sem aceitar valor de outra opção', () => {
    expect(parseArgs(['--formats', 'm3u,xmltv', '--sizes', '1000', '--seed', '7', '--cpu', '4', '--device', 'tv-qn50q60d', '--serve-only'], {})).toMatchObject({
      formats: ['m3u', 'xmltv'],
      sizes: [1000],
      seed: 7,
      cpu: 4,
      device: 'tv-qn50q60d',
      serveOnly: true,
    })
    expect(() => parseArgs(['--formats', 'dash'], {})).toThrow(/Formato desconhecido/)
    expect(() => parseArgs(['--sizes', '0'], {})).toThrow(/Tamanho inválido/)
    expect(() => parseArgs(['--sizes', 'abc'], {})).toThrow(/Tamanho inválido/)
    expect(() => parseArgs(['--cpu', '0.5'], {})).toThrow(/--cpu/)
    expect(() => parseArgs(['--nada'], {})).toThrow(/Opção desconhecida/)
    expect(() => parseArgs(['--sizes', '--seed', '3'], {})).toThrow(/pede um valor/)
  })
})

describe('runner — servidor das fontes fictícias', () => {
  let server
  afterEach(() => new Promise((resolve) => (server ? server.close(resolve) : resolve())))

  async function start(handlers) {
    server = createBenchServer({ getFixture: (format, size) => generateFixture({ format, size, seed: 3 }), ...handlers })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${server.address().port}`
  }

  it('serve o Xtream por ação, filtra por category_id e devolve [] para ação sem corpo', async () => {
    const base = await start({})
    const root = `${base}/f/xtream-1000/player_api.php`
    expect((await (await fetch(`${root}?username=a&password=b`)).json()).user_info.auth).toBe(1)

    const all = await (await fetch(`${root}?action=get_vod_streams`)).json()
    expect(all).toHaveLength(400)
    const categories = await (await fetch(`${root}?action=get_vod_categories`)).json()
    const first = categories[0].category_id
    const onlyFirst = await (await fetch(`${root}?action=get_vod_streams&category_id=${first}`)).json()
    expect(onlyFirst.length).toBeGreaterThan(0)
    expect(onlyFirst.length).toBeLessThan(all.length)
    expect(onlyFirst.every((item) => String(item.category_id) === String(first))).toBe(true)
    expect(await (await fetch(`${root}?action=get_alguma_coisa`)).json()).toEqual([])
  })

  it('serve M3U e XMLTV, com CORS aberto, e responde 404 fora das rotas', async () => {
    const base = await start({})
    const m3u = await fetch(`${base}/f/m3u-1000/playlist.m3u`)
    expect(m3u.headers.get('access-control-allow-origin')).toBe('*')
    expect(((await m3u.text()).match(/^#EXTINF/gm) ?? []).length).toBe(1000)
    expect(((await (await fetch(`${base}/f/xmltv-1000/epg.xml`)).text()).match(/<programme\b/g) ?? []).length).toBe(1000)
    expect((await fetch(`${base}/f/m3u-1000/outra.coisa`)).status).toBe(404)
    expect((await fetch(`${base}/f/dash-1000/playlist.m3u`)).status).toBe(404)
    expect((await fetch(`${base}/qualquer`)).status).toBe(404)
  })

  it('entrega o plano e recebe o resultado por POST (com OPTIONS liberado)', async () => {
    let received
    const plan = { combos: [{ format: 'm3u', size: 1000 }], clock: 123 }
    const base = await start({ plan, onResult: (body) => (received = body) })
    expect(await (await fetch(`${base}/plan`)).json()).toEqual(plan)
    expect((await fetch(`${base}/result`, { method: 'OPTIONS' })).status).toBe(204)
    const response = await fetch(`${base}/result`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ browser: 'x', results: [] }) })
    expect(response.status).toBe(204)
    expect(received).toEqual({ browser: 'x', results: [] })
    expect((await fetch(`${base}/result`, { method: 'POST', body: 'não é json' })).status).toBe(400)
  })
})

describe('runner — junção dos dois modos', () => {
  const expected = { categories: 6, items: 1000 }
  const stages = { mode: 'stages', status: 'ok', stages: { fetchMs: 1, parseMs: 2, classifyMs: 3, storeMs: 4, totalMs: 10 }, counts: expected }
  const real = {
    mode: 'real',
    status: 'ok',
    realPath: { status: 'ok', totalMs: 99 },
    counts: expected,
    storage: { before: { usage: 0, quota: 10 }, after: { usage: 5, quota: 10 } },
  }

  it('stages e realPath ficam separados, nunca somados, e countsMatch confere os dois', () => {
    const merged = mergeCombination({ format: 'm3u', size: 1000 }, expected, stages, real)
    expect(merged).toEqual({
      format: 'm3u',
      size: 1000,
      status: 'ok',
      stages: stages.stages,
      realPath: { status: 'ok', totalMs: 99 },
      storage: real.storage,
      counts: expected,
      expected,
      countsMatch: true,
    })
    expect(mergeCombination({ format: 'm3u', size: 1000 }, expected, stages, { ...real, counts: { categories: 6, items: 999 } }).countsMatch).toBe(false)
  })

  it('falha em um modo marca a combinação como failed e guarda o que o outro mediu', () => {
    const merged = mergeCombination({ format: 'xtream', size: 100000 }, expected, stages, { mode: 'real', status: 'failed', failedStage: 'load-movie', errorName: 'failed' })
    expect(merged).toMatchObject({ status: 'failed', failedStage: 'real:load-movie', errorName: 'failed', stages: stages.stages })
    expect(merged.realPath).toBeUndefined()

    const both = mergeCombination({ format: 'xmltv', size: 1000 }, expected, { mode: 'stages', status: 'failed', failedStage: 'timeout', errorName: 'TimeoutError' }, undefined)
    expect(both).toMatchObject({ status: 'failed', failedStage: 'stages:timeout' })
    expect(both.countsMatch).toBeUndefined()
  })

  it('o resultado segue o formato do schema 1', () => {
    const result = buildResult({
      device: { slug: 'x' },
      commit: 'abc1234',
      dirty: false,
      appVersion: '0.0.0',
      seed: 1,
      cpuThrottle: 1,
      results: [],
      date: '2026-10-08T10:00:00.000Z',
    })
    expect(Object.keys(result)).toEqual(['schema', 'date', 'device', 'commit', 'dirty', 'appVersion', 'seed', 'cpuThrottle', 'results'])
    expect(result.schema).toBe(1)
  })
})
