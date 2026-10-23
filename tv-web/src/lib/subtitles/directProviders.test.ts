/**
 * Clientes diretos (BYOK) com as MESMAS amostras sintéticas do serviço (D-015): `sdd/specs/090-legendas-externas/fixtures/`.
 * Nenhuma resposta real nem texto real de legenda; a chave de teste é inventada.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { DirectProviderError, createDirectProvider, testProviderKey, toDownloadError, type FetchLike } from './directProviders'

const FIXTURES = fileURLToPath(new URL('../../../../sdd/specs/090-legendas-externas/fixtures/', import.meta.url))
const fixture = (name: string): unknown => JSON.parse(readFileSync(FIXTURES + name, 'utf-8'))
const KEY = 'chave-pessoal-ficticia-090'
const SRT = '1\n00:00:01,000 --> 00:00:02,000\nOlá, ação!\n'
const signal = new AbortController().signal

const bytesBody = (bytes: Uint8Array): BodyInit => new Blob([bytes as BlobPart])
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

interface Call {
  url: string
  init?: RequestInit
}

function recorder(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    return respond(call)
  }
  return { calls, fetchImpl }
}

async function zipBytes(name: string, text: string): Promise<Uint8Array> {
  // ZIP de um arquivo em `store` (suficiente: o leitor é testado à parte em zipReader.test.ts).
  const data = new TextEncoder().encode(text)
  const label = new TextEncoder().encode(name)
  const local = new Uint8Array(30 + label.length + data.length)
  const lv = new DataView(local.buffer)
  lv.setUint32(0, 0x04034b50, true)
  lv.setUint32(18, data.length, true)
  lv.setUint32(22, data.length, true)
  lv.setUint16(26, label.length, true)
  local.set(label, 30)
  local.set(data, 30 + label.length)
  const header = new Uint8Array(46 + label.length)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, 0x02014b50, true)
  hv.setUint32(20, data.length, true)
  hv.setUint32(24, data.length, true)
  hv.setUint16(28, label.length, true)
  header.set(label, 46)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, 1, true)
  ev.setUint16(10, 1, true)
  ev.setUint32(12, header.length, true)
  ev.setUint32(16, local.length, true)
  return Uint8Array.from([...local, ...header, ...end])
}

describe('OpenSubtitles direto', () => {
  it('pedido com a chave só no cabeçalho, parâmetros em ordem; resultados do idioma, mais baixados primeiro', async () => {
    const { calls, fetchImpl } = recorder(() => json(fixture('opensubtitles-search.json')))
    const results = await createDirectProvider('opensubtitles', KEY, fetchImpl).search({ language: 'pt-BR', tmdbId: 55 }, signal)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.opensubtitles.com/api/v1/subtitles?languages=pt-br&tmdb_id=55')
    expect(calls[0].url).not.toContain(KEY)
    expect((calls[0].init?.headers as Record<string, string>)['Api-Key']).toBe(KEY)
    // O navegador não deixa definir User-Agent: o X-User-Agent (aceito pelo fornecedor, provado na TV) o substitui.
    expect((calls[0].init?.headers as Record<string, string>)['X-User-Agent']).toBe('ccplayTv v1')
    // pt-PT e a linha sem arquivo ficam de fora; 900 downloads vem antes de 120.
    expect(results.map((row) => row.id)).toEqual(['os:1002', 'os:1001'])
    expect(results[0]).toMatchObject({ provider: 'opensubtitles', language: 'pt-BR', hearingImpaired: true, release: 'filme.1080p.srt' })
  })

  it('download: POST /download, depois o link só em host do fornecedor; link de outro host é recusado', async () => {
    const ok = recorder((call) =>
      call.url.endsWith('/download') ? json({ link: 'https://www.opensubtitles.com/temp/abc.srt' }) : new Response(bytesBody(new TextEncoder().encode(SRT))),
    )
    const text = await createDirectProvider('opensubtitles', KEY, ok.fetchImpl).download('os:1001', signal)
    expect(text).toBe(SRT)
    expect(ok.calls[0].init?.method).toBe('POST')
    expect((ok.calls[0].init?.headers as Record<string, string>)['X-User-Agent']).toBe('ccplayTv v1')
    expect(JSON.parse(ok.calls[0].init?.body as string)).toEqual({ file_id: 1001 })
    expect(ok.calls[1].url).toBe('https://www.opensubtitles.com/temp/abc.srt')

    const evil = recorder((call) => (call.url.endsWith('/download') ? json({ link: 'https://outro.host/x.srt' }) : new Response('x')))
    await expect(createDirectProvider('opensubtitles', KEY, evil.fetchImpl).download('os:1001', signal)).rejects.toMatchObject({ kind: 'unavailable' })
    expect(evil.calls).toHaveLength(1)
  })
})

describe('SubDL direto', () => {
  it('filme: BR_PT com tmdb_id e type=movie; chave só na consulta', async () => {
    const { calls, fetchImpl } = recorder(() => json({ status: true, subtitles: [] }))
    await createDirectProvider('subdl', KEY, fetchImpl).search({ language: 'pt-BR', tmdbId: 55 }, signal)
    const url = new URL(calls[0].url)
    expect(url.origin + url.pathname).toBe('https://api.subdl.com/api/v1/subtitles')
    expect(Object.fromEntries(url.searchParams)).toEqual({ subs_per_page: '30', languages: 'BR_PT', tmdb_id: '55', type: 'movie', api_key: KEY })
  })

  it('episódio: exato primeiro, depois pacotes; só o par do id sai — a URL com a chave nunca', async () => {
    const { calls, fetchImpl } = recorder(() => json(fixture('subdl-search-episode.json')))
    const results = await createDirectProvider('subdl', KEY, fetchImpl).search(
      { language: 'en', parentTmdbId: 99, season: 1, episode: 2 },
      signal,
    )
    expect(Object.fromEntries(new URL(calls[0].url).searchParams)).toMatchObject({ tmdb_id: '99', type: 'tv', season_number: '1', episode_number: '2' })
    expect(results.map((row) => row.id)).toEqual(['sd:111-222', 'sd:333-444', 'sd:999-111'])
    expect(results[0].seasonPack).toBeUndefined()
    expect(results[1].seasonPack).toBe(true)
    const printed = JSON.stringify(results)
    expect(printed).not.toContain('CHAVE_FICTICIA')
    expect(printed).not.toContain('api_key')
    expect(printed).not.toContain('http')
  })

  it('download: baixa o zip por dl.subdl.com e devolve o arquivo; zip inútil é ilegível', async () => {
    const { calls, fetchImpl } = recorder(async () => new Response(bytesBody(await zipBytes('filme.srt', SRT))))
    expect(await createDirectProvider('subdl', KEY, fetchImpl).download('sd:111-222', signal)).toBe(SRT)
    expect(calls[0].url).toBe(`https://dl.subdl.com/subtitle/111-222.zip?api_key=${KEY}`)

    const bad = recorder(() => new Response(bytesBody(new TextEncoder().encode('isto não é um zip'))))
    await expect(createDirectProvider('subdl', KEY, bad.fetchImpl).download('sd:111-222', signal)).rejects.toMatchObject({ kind: 'unreadable' })
  })
})

describe('erros: só a categoria, nunca a chave', () => {
  it.each([
    [401, 'rejected'],
    [403, 'rejected'],
    [429, 'limit'],
    [500, 'unavailable'],
  ] as const)('SubDL e OpenSubtitles: status %i → %s', async (status, kind) => {
    for (const provider of ['subdl', 'opensubtitles'] as const) {
      const { fetchImpl } = recorder(() => json({}, status))
      await expect(createDirectProvider(provider, KEY, fetchImpl).search({ language: 'en', tmdbId: 1 }, signal)).rejects.toMatchObject({ kind })
    }
  })

  it('o SubDL diz "status: false": cota → limite; chave → recusada; não achei → vazio', async () => {
    const run = (error: string) =>
      createDirectProvider('subdl', KEY, recorder(() => json({ status: false, error })).fetchImpl).search({ language: 'en', tmdbId: 1 }, signal)
    await expect(run('quota exceeded')).rejects.toMatchObject({ kind: 'limit' })
    await expect(run('invalid api key')).rejects.toMatchObject({ kind: 'rejected' })
    await expect(run('can not find film')).resolves.toEqual([])
  })

  it('falha de rede/CORS vira "offline" sem repassar o erro (que embute a URL com a chave)', async () => {
    const leaky = vi.fn(async (url: string): Promise<Response> => {
      throw new TypeError(`Failed to fetch ${url}`)
    })
    const error = await createDirectProvider('subdl', KEY, leaky).search({ language: 'en', tmdbId: 1 }, signal).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DirectProviderError)
    expect((error as DirectProviderError).kind).toBe('offline')
    expect(String((error as Error).message) + String((error as Error).stack)).not.toContain(KEY)
    expect(toDownloadError(error).code).toBe('offline')
  })
})

describe('testProviderKey', () => {
  it('SubDL e OpenSubtitles: aceita, recusa, limite e sem rede', async () => {
    const outcome = (provider: 'subdl' | 'opensubtitles', status: number) =>
      testProviderKey(provider, KEY, recorder(() => json({ status: true, data: [], subtitles: [] }, status)).fetchImpl)
    expect(await outcome('subdl', 200)).toBe('valid')
    expect(await outcome('opensubtitles', 200)).toBe('valid')
    expect(await outcome('subdl', 401)).toBe('rejected')
    expect(await outcome('opensubtitles', 403)).toBe('rejected')
    expect(await outcome('subdl', 429)).toBe('rate_limited')
    expect(await outcome('opensubtitles', 500)).toBe('offline')
    expect(await testProviderKey('subdl', KEY, async () => { throw new Error('rede') })).toBe('offline')
  })
})
