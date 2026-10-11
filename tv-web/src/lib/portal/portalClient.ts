/** Controle HTTPS independente do provedor; erros nunca carregam URL/corpo remoto. */
const errorCodes = new Set(['unauthorized', 'invalid_origin', 'invalid_csrf', 'invalid_input',
  'invalid_credentials', 'rate_limited', 'service_unavailable', 'conflict', 'recovery_required'])

export class PortalRequestError extends Error {
  readonly code: string
  readonly retryAfterMs: number
  constructor(code = 'network_error', retryAfterMs = 0) {
    super(errorCodes.has(code) || code === 'network_error' ? code : 'service_unavailable')
    this.code = this.message
    this.retryAfterMs = retryAfterMs
  }
}

export interface PortalClientOptions {
  origin: string
  allowLocalHttp?: boolean
  fetch?: typeof fetch
}

export function createPortalClient(options: PortalClientOptions) {
  let origin: URL
  try { origin = new URL(options.origin) } catch { throw new PortalRequestError('invalid_input') }
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(options.allowLocalHttp && origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) {
    throw new PortalRequestError('invalid_input')
  }
  const fetcher = options.fetch ?? globalThis.fetch
  return {
    async request<T>(path: string, { bearer, body, signal, method = 'POST' }: {
      bearer?: string; body?: unknown; signal?: AbortSignal; method?: 'GET' | 'POST' | 'PUT'
    }): Promise<T> {
      // Rota fixa sem query/hash; nenhuma credencial pode formar a URL.
      if (!/^\/portal\/v1\/[A-Za-z0-9_/-]+$/.test(path) || path.includes('//') ||
          (method === 'GET' && body !== undefined)) throw new PortalRequestError('invalid_input')
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) controller.abort()
      const timeout = setTimeout(abort, 10_000)
      try {
        const response = await fetcher(origin.origin + path, {
          method, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
          redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (!response.ok) {
          const seconds = Number(response.headers.get('Retry-After'))
          const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86_400) * 1_000 : 0
          // Não ler/ecoar corpo de proxy, HTML, erro de validação ou URL de fetch.
          const code = ({ 401: 'unauthorized', 403: 'invalid_origin', 409: 'conflict',
            422: 'invalid_input', 429: 'rate_limited' } as Record<number, string>)[response.status]
          throw new PortalRequestError(code ?? 'service_unavailable', retryAfterMs)
        }
        if (response.status === 204) return undefined as T
        const reader = response.body?.getReader()
        if (!reader) throw new PortalRequestError('service_unavailable')
        const chunks: Uint8Array[] = []
        let length = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > 1_048_576) {
            await reader.cancel()
            throw new PortalRequestError('service_unavailable')
          }
          chunks.push(value)
        }
        const bytes = new Uint8Array(length)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        return JSON.parse(new TextDecoder().decode(bytes)) as T
      } catch (error) {
        if (error instanceof PortalRequestError) throw error
        throw new PortalRequestError()
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
      }
    },
  }
}
