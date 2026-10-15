import type { ErrorCode } from '../errors/errorCatalog'
import { getNetworkState } from '../network/networkState'
import {
  isAbortError,
  legacyM3uUrl,
  normalizeServerAddress,
  ProviderError,
  ProviderIncompatibleError,
  resolveAccountStatus,
} from './xtreamConnector'
import { parsePanelUrl } from './m3uPanelUrl'
import {
  EmptyPlaylistError,
  HlsManifestDetectedError,
  InvalidPlaylistError,
  linesFromResponse,
  parseM3uLines,
} from './m3uParser'

/**
 * Confirmação de conexão do formulário de lista (feature 045, US1) —
 * `sdd/specs/045-ime-formularios-tv/logic/verificacao-conexao.md`.
 *
 * Reusa o que a importação já faz (conector Xtream, parser M3U): nunca uma
 * segunda implementação do protocolo. É leve — no Xtream, só a consulta de
 * conta; no M3U, lê até a primeira entrada e cancela o download. Não grava
 * nada, e o resultado nunca carrega URL, usuário, senha nem o erro cru.
 */

/** Limite da confirmação (FR-008). */
export const CONNECTION_CHECK_TIMEOUT_MS = 15_000

export type ConnectionCheckInput =
  | { type: 'provider_credentials'; dns: string; username: string; password: string }
  | { type: 'm3u_url'; url: string }

/** `xtream`: painel confirmado · `limited`: painel sem protocolo, M3U de fallback serve · `m3u`: lista avulsa serve. */
export type ConnectionCheckRoute = 'xtream' | 'limited' | 'm3u'

export type ConnectionCheckFailureCode = Extract<
  ErrorCode,
  'SRC-001' | 'SRC-401' | 'SRC-402' | 'SRC-422' | 'NET-01' | 'NET-02' | 'API-429'
>

export type ConnectionCheckResult =
  | { status: 'confirmed'; route: ConnectionCheckRoute }
  | { status: 'failed'; code: ConnectionCheckFailureCode }
  | { status: 'cancelled' }

export interface ConnectionCheckOptions {
  /** Cancelamento por quem chamou (RETURN durante a espera, FR-009). */
  signal?: AbortSignal
  /** Padrão: `CONNECTION_CHECK_TIMEOUT_MS`. */
  timeoutMs?: number
  /** Padrão: `getNetworkState().online`. */
  isOnline?: () => boolean
}

class CheckTimeout extends Error {}
class CheckCancelled extends Error {}

const fail = (code: ConnectionCheckFailureCode): ConnectionCheckResult => ({ status: 'failed', code })

export async function checkSourceConnection(
  input: ConnectionCheckInput,
  options: ConnectionCheckOptions = {},
): Promise<ConnectionCheckResult> {
  const online = options.isOnline ?? (() => getNetworkState().online)
  const networkCode = (): ConnectionCheckFailureCode => (online() ? 'NET-02' : 'NET-01')

  /** Lê só o começo da lista: a primeira entrada válida basta; o download é cancelado. */
  async function probeM3u(url: string, signal: AbortSignal, route: 'limited' | 'm3u'): Promise<ConnectionCheckResult> {
    let response: Response
    try {
      response = await fetch(url, { signal })
    } catch (error) {
      if (isAbortError(error)) throw error
      return fail(networkCode())
    }
    if (response.status === 401 || response.status === 403) return fail('SRC-401')
    if (response.status === 429) return fail('API-429')
    if (!response.ok || !response.body) return fail('SRC-422')
    try {
      // O `return` dentro do `for await` fecha o gerador, e `linesFromResponse`
      // faz `reader.cancel()` no `finally` — é o que impede baixar a lista inteira.
      for await (const entry of parseM3uLines(linesFromResponse(response.body))) {
        void entry
        return { status: 'confirmed', route }
      }
    } catch (error) {
      if (isAbortError(error)) throw error
      if (
        error instanceof HlsManifestDetectedError ||
        error instanceof InvalidPlaylistError ||
        error instanceof EmptyPlaylistError
      ) {
        return fail('SRC-422')
      }
      throw error
    }
    return fail('SRC-422')
  }

  async function viaPanel(
    dns: string,
    username: string,
    password: string,
    fallbackUrl: string,
    signal: AbortSignal,
  ): Promise<ConnectionCheckResult> {
    try {
      const status = await resolveAccountStatus(dns, username, password, Date.now(), { signal })
      if (status.expired) return fail('SRC-402')
      if (!status.authorized) return fail('SRC-401')
      return { status: 'confirmed', route: 'xtream' }
    } catch (error) {
      if (isAbortError(error)) throw error
      if (error instanceof ProviderError) {
        if (error.kind === 'invalid_credentials') return fail('SRC-401')
        if (error.kind === 'subscription_expired') return fail('SRC-402')
        if (error.kind === 'rate_limited') return fail('API-429')
        // network_failure | direct_connection_refused (CORS) — mesma leitura da tabela da 042.
        return fail(networkCode())
      }
      // Painel que não fala o protocolo JSON: cai no M3U de fallback (Modo limitado, FR-004).
      if (error instanceof ProviderIncompatibleError) return probeM3u(fallbackUrl, signal, 'limited')
      throw error
    }
  }

  async function verify(signal: AbortSignal): Promise<ConnectionCheckResult> {
    if (input.type === 'provider_credentials') {
      let dns: string
      try {
        dns = normalizeServerAddress(input.dns)
      } catch (error) {
        if (error instanceof ProviderIncompatibleError) return fail('SRC-001')
        throw error
      }
      if (!online()) return fail('NET-01')
      return viaPanel(dns, input.username, input.password, legacyM3uUrl(dns, input.username, input.password), signal)
    }

    let parsed: URL
    try {
      parsed = new URL(input.url.trim())
    } catch {
      return fail('SRC-001')
    }
    // `fetch` com credencial embutida na URL lança TypeError no navegador: melhor dizer "endereço inválido".
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.hostname === '' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return fail('SRC-001')
    }
    if (!online()) return fail('NET-01')
    const panel = parsePanelUrl(input.url)
    if (panel) return viaPanel(panel.dns, panel.username, panel.password, input.url, signal)
    return probeM3u(input.url, signal, 'm3u')
  }

  if (options.signal?.aborted) return { status: 'cancelled' }

  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  options.signal?.addEventListener('abort', forwardAbort)

  let timer: ReturnType<typeof setTimeout> | undefined
  // O `race` é obrigatório (D-007): um `fetch` pode ignorar o sinal e nunca prender a tela.
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Rejeita ANTES de abortar: o timeout tem que vencer a corrida contra o `AbortError`.
      reject(new CheckTimeout())
      controller.abort()
    }, options.timeoutMs ?? CONNECTION_CHECK_TIMEOUT_MS)
    options.signal?.addEventListener('abort', () => reject(new CheckCancelled()))
  })
  guard.catch(() => {})

  const pending = verify(controller.signal)
  // A consulta que perde a corrida ainda pode rejeitar depois; ninguém mais a espera.
  pending.catch(() => {})

  try {
    return await Promise.race([pending, guard])
  } catch (error) {
    if (error instanceof CheckTimeout) return fail('NET-02')
    if (error instanceof CheckCancelled || (isAbortError(error) && options.signal?.aborted)) {
      return { status: 'cancelled' }
    }
    // Defeito nosso não vira "falha de rede" (D-009): sobe.
    throw error
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
}
