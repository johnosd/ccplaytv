/**
 * Peças comuns dos clientes diretos de legenda (feature 090, BYOK): erro por categoria, `fetch` que nunca vaza a chave
 * e leitura com teto de bytes. Nada daqui carrega URL, corpo ou chave em erro.
 */
import type { SubtitleResult, SubtitleSearchRequest } from './types'
import { decodeSubtitleText, MAX_TEXT_BYTES } from './zipReader'

export type DirectFailure = 'rejected' | 'limit' | 'unavailable' | 'offline' | 'unreadable'

/** Falha de um fornecedor com chave pessoal — só a categoria, nunca URL, corpo ou chave. */
export class DirectProviderError extends Error {
  readonly kind: DirectFailure
  constructor(kind: DirectFailure) {
    super(kind)
    this.kind = kind
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface DirectProvider {
  search(request: SubtitleSearchRequest, signal: AbortSignal): Promise<SubtitleResult[]>
  /** O texto do arquivo (SRT/WebVTT) já fora do ZIP. */
  download(resultId: string, signal: AbortSignal, context?: { season?: number; episode?: number }): Promise<string>
}

export const MAX_RESULTS = 50

export function wantsEpisode(request: SubtitleSearchRequest): boolean {
  return 'parentTmdbId' in request || ('query' in request && request.episode !== undefined)
}

/** `fetch` sem vazar nada: rede/CORS/aborto viram `offline`; o chamador decide pelo status. */
export async function call(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, init)
  } catch {
    throw new DirectProviderError('offline')
  }
}

export function statusFailure(status: number): DirectProviderError {
  if (status === 401 || status === 403) return new DirectProviderError('rejected')
  if (status === 429) return new DirectProviderError('limit')
  return new DirectProviderError('unavailable')
}

/** Lê o corpo com contador real (o `Content-Length` pode faltar ou mentir). */
export async function readLimited(response: Response, max: number): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) {
    const whole = new Uint8Array(await response.arrayBuffer())
    if (whole.length > max) throw new DirectProviderError('unreadable')
    return whole
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      void reader.cancel().catch(() => {})
      throw new DirectProviderError('unreadable')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await readLimited(response, MAX_TEXT_BYTES)))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch (error) {
    throw error instanceof DirectProviderError ? error : new DirectProviderError('unavailable')
  }
}

export const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

export function decodeText(raw: Uint8Array): string {
  try {
    return decodeSubtitleText(raw)
  } catch {
    throw new DirectProviderError('unreadable')
  }
}

