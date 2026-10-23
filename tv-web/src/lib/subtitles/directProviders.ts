/**
 * Clientes diretos da TV para os fornecedores de legenda, com a chave PESSOAL da pessoa (feature 090, BYOK, exceção (l)
 * da constitution, `logic/legenda-externa.md` §10.3). A mesma tradução de pedido e normalização do serviço
 * (`api/app/portal/providers/*.py`, contrato §2) — os testes usam as mesmas amostras (D-015).
 *
 * A chave só existe no cabeçalho/consulta do `fetch`. Nada que o `fetch` lança é repassado (a URL do SubDL carrega a
 * chave): toda falha vira `DirectProviderError`, que só diz a categoria.
 */
import { DirectProviderError, call, readJson, type DirectProvider, type FetchLike } from './directHttp'
import { OS_API, USER_AGENT, createOpenSubtitles, openSubtitlesParams } from './openSubtitlesDirect'
import { SD_API, createSubdl, subdlLimitFailure } from './subdlDirect'
import { SubtitleError, type SubtitleProvider, type SubtitleSearchRequest } from './types'

export { DirectProviderError, type DirectFailure, type DirectProvider, type FetchLike } from './directHttp'
export { normalizeOpenSubtitles, openSubtitlesParams } from './openSubtitlesDirect'
export { normalizeSubdl, subdlParams } from './subdlDirect'

export function createDirectProvider(provider: SubtitleProvider, key: string, fetchImpl: FetchLike = (url, init) => fetch(url, init)): DirectProvider {
  return provider === 'subdl' ? createSubdl(key, fetchImpl) : createOpenSubtitles(key, fetchImpl)
}

export type KeyTestResult = 'valid' | 'rejected' | 'rate_limited' | 'offline'

/** Teste barato da chave no fornecedor (uma busca mínima) — só a categoria do resultado sai daqui. */
export async function testProviderKey(
  provider: SubtitleProvider,
  key: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  signal?: AbortSignal,
): Promise<KeyTestResult> {
  try {
    const request: SubtitleSearchRequest = { language: 'en', query: 'test' }
    if (provider === 'subdl') {
      const query = new URLSearchParams({ film_name: 'test', subs_per_page: '1', api_key: key }).toString()
      const response = await call(fetchImpl, `${SD_API}?${query}`, { signal })
      if (response.status === 401 || response.status === 403) return 'rejected'
      if (response.status === 429) return 'rate_limited'
      if (response.status < 200 || response.status >= 300) return 'offline'
      const failure = subdlLimitFailure(await readJson(response))
      return failure ? (failure.kind === 'rejected' ? 'rejected' : 'rate_limited') : 'valid'
    }
    const query = new URLSearchParams(openSubtitlesParams(request)).toString()
    const response = await call(fetchImpl, `${OS_API}/subtitles?${query}`, { headers: { 'Api-Key': key, Accept: 'application/json', 'X-User-Agent': USER_AGENT }, signal })
    if (response.status === 401 || response.status === 403) return 'rejected'
    if (response.status === 406 || response.status === 429) return 'rate_limited'
    return response.status >= 200 && response.status < 300 ? 'valid' : 'offline'
  } catch {
    return 'offline'
  }
}

/** Categoria direta → erro de download que a pessoa distingue (a chave recusada vira `unavailable`). */
export function toDownloadError(error: unknown): SubtitleError {
  if (error instanceof SubtitleError) return error
  const kind = error instanceof DirectProviderError ? error.kind : 'unavailable'
  if (kind === 'limit') return new SubtitleError('provider_limit')
  if (kind === 'unreadable') return new SubtitleError('unreadable')
  if (kind === 'offline') return new SubtitleError('offline')
  return new SubtitleError('unavailable')
}
