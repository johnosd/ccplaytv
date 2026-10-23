import { describe, expect, it, vi } from 'vitest'
import { DirectProviderError, type DirectProvider } from './directProviders'
import { createSubtitleSearch, type SubtitleSearchDeps } from './subtitleSearch'
import {
  SubtitleError,
  type SubtitleProvider,
  type SubtitleResult,
  type SubtitleSearchRequest,
  type SubtitleServicePort,
} from './types'

const signal = new AbortController().signal
const REQUEST: SubtitleSearchRequest = { language: 'en', tmdbId: 7 }
const KEY = 'chave-pessoal-ficticia-090'

const hit = (provider: SubtitleProvider, id: string): SubtitleResult => ({
  id,
  provider,
  language: 'en',
  release: `${provider}.${id}`,
  hearingImpaired: false,
})

function portalOf(results: SubtitleResult[], unavailable: SubtitleProvider[] = []) {
  const port: SubtitleServicePort = {
    search: vi.fn(async () => ({ results, unavailable })),
    download: vi.fn(async () => 'texto do serviço'),
  }
  return port
}

function directOf(behavior: () => Promise<SubtitleResult[]>, text = 'texto direto') {
  const provider: DirectProvider = { search: vi.fn(behavior), download: vi.fn(async () => text) }
  return provider
}

function setup(options: {
  keys?: Partial<Record<SubtitleProvider, string>>
  portal?: SubtitleServicePort | null
  direct?: Partial<Record<SubtitleProvider, DirectProvider>>
}) {
  const asked: (readonly SubtitleProvider[])[] = []
  const markKey = vi.fn(async () => {})
  const deps: SubtitleSearchDeps = {
    portal: (providers) => {
      asked.push(providers)
      return options.portal ?? null
    },
    readKeys: async () => options.keys ?? {},
    markKey,
    direct: (provider) => options.direct?.[provider] as DirectProvider,
  }
  return { search: createSubtitleSearch(deps), asked, markKey }
}

describe('busca mista — chave pessoal por fornecedor (US3)', () => {
  it('sem chave pessoal: UMA chamada ao serviço, que consulta os dois', async () => {
    const portal = portalOf([hit('opensubtitles', 'os:1'), hit('subdl', 'sd:1-2')])
    const { search, asked } = setup({ portal })
    const response = await search.search(REQUEST, signal)
    expect(portal.search).toHaveBeenCalledTimes(1)
    expect(asked).toEqual([['opensubtitles', 'subdl']])
    expect(response.results.map((row) => row.id)).toEqual(['os:1', 'sd:1-2'])
  })

  it('chave pessoal do SubDL + serviço para o OpenSubtitles: duas chamadas, junção na ordem do contrato', async () => {
    const portal = portalOf([hit('opensubtitles', 'os:9')])
    const subdl = directOf(async () => [hit('subdl', 'sd:3-4')])
    const { search, asked } = setup({ keys: { subdl: KEY }, portal, direct: { subdl } })
    const response = await search.search(REQUEST, signal)
    expect(asked).toEqual([['opensubtitles']])
    expect(portal.search).toHaveBeenCalledTimes(1)
    expect(subdl.search).toHaveBeenCalledTimes(1)
    expect(response.results.map((row) => row.id)).toEqual(['os:9', 'sd:3-4'])
    expect(response.keyIssues).toBeUndefined()
  })

  it('chave recusada: avisa a chave daquele fornecedor, marca o estado e mantém os outros resultados', async () => {
    const portal = portalOf([hit('opensubtitles', 'os:9')])
    const subdl = directOf(async () => {
      throw new DirectProviderError('rejected')
    })
    const { search, markKey } = setup({ keys: { subdl: KEY }, portal, direct: { subdl } })
    const response = await search.search(REQUEST, signal)
    expect(response.results.map((row) => row.id)).toEqual(['os:9'])
    expect(response.keyIssues).toEqual({ subdl: 'rejected' })
    expect(markKey).toHaveBeenCalledWith('subdl', 'rejected')
    expect(JSON.stringify(response)).not.toContain(KEY)
  })

  it('só chave pessoal e ela recusada: devolve o aviso (não um erro), para a pessoa poder usar o padrão', async () => {
    const subdl = directOf(async () => {
      throw new DirectProviderError('limit')
    })
    const { search, markKey } = setup({ keys: { subdl: KEY, opensubtitles: KEY }, direct: { subdl, opensubtitles: directOf(async () => []) } })
    const response = await search.search(REQUEST, signal)
    expect(response.keyIssues).toEqual({ subdl: 'rate_limited' })
    expect(markKey).toHaveBeenCalledWith('subdl', 'rate_limited')
  })

  it('o serviço cai, mas a chave pessoal responde: mostra os dela e marca o outro como indisponível', async () => {
    const portal: SubtitleServicePort = { search: vi.fn(async () => { throw new SubtitleError('offline') }), download: vi.fn() }
    const subdl = directOf(async () => [hit('subdl', 'sd:5-6')])
    const { search } = setup({ keys: { subdl: KEY }, portal, direct: { subdl } })
    const response = await search.search(REQUEST, signal)
    expect(response.results.map((row) => row.id)).toEqual(['sd:5-6'])
    expect(response.unavailable).toEqual(['opensubtitles'])
  })

  it('sem licença (serviço indisponível) e sem chave: not_entitled', async () => {
    const { search } = setup({ portal: null })
    await expect(search.search(REQUEST, signal)).rejects.toMatchObject({ code: 'not_entitled' })
  })

  it('tudo falhou sem aviso de chave: o erro explica (serviço fora do ar)', async () => {
    const portal: SubtitleServicePort = { search: vi.fn(async () => { throw new SubtitleError('offline') }), download: vi.fn() }
    const { search } = setup({ portal })
    await expect(search.search(REQUEST, signal)).rejects.toMatchObject({ code: 'offline' })
  })

  it('download vai pelo fornecedor do id: chave pessoal → direto; senão o serviço; recusada pede "usar o padrão"', async () => {
    const portal = portalOf([])
    const subdl = directOf(async () => [], 'do SubDL direto')
    const direct = setup({ keys: { subdl: KEY }, portal, direct: { subdl } })
    expect(await direct.search.download('sd:1-2', 'en', signal)).toBe('do SubDL direto')
    expect(await direct.search.download('os:5', 'en', signal)).toBe('texto do serviço')
    expect(portal.download).toHaveBeenCalledTimes(1)

    const refused: DirectProvider = { search: vi.fn(), download: vi.fn(async () => { throw new DirectProviderError('rejected') }) }
    const failing = setup({ keys: { subdl: KEY }, portal, direct: { subdl: refused } })
    await expect(failing.search.download('sd:1-2', 'en', signal)).rejects.toMatchObject({ code: 'key_rejected', personal: 'subdl' })
    expect(failing.markKey).toHaveBeenCalledWith('subdl', 'rejected')

    const limited: DirectProvider = { search: vi.fn(), download: vi.fn(async () => { throw new DirectProviderError('limit') }) }
    const capped = setup({ keys: { subdl: KEY }, portal, direct: { subdl: limited } })
    await expect(capped.search.download('sd:1-2', 'en', signal)).rejects.toMatchObject({ code: 'provider_limit', personal: 'subdl' })

    const none = setup({ portal: null })
    await expect(none.search.download('os:5', 'en', signal)).rejects.toMatchObject({ code: 'not_entitled' })
  })

  it('falha ao ler a memória das chaves não quebra: cai no caminho padrão', async () => {
    const portal = portalOf([hit('opensubtitles', 'os:1')])
    const deps: SubtitleSearchDeps = {
      portal: () => portal,
      readKeys: async () => {
        throw new Error('banco fechado')
      },
      markKey: async () => {},
    }
    const response = await createSubtitleSearch(deps).search(REQUEST, signal)
    expect(response.results).toHaveLength(1)
  })
})
