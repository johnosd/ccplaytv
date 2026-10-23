/**
 * Cliente da TV para as operações de legenda do serviço (feature 090, `logic/legenda-externa.md` §7,
 * `contracts/servico-legendas.md`). Só por ação da pessoa (constitution 1.16.0, exceção (k)); rotas fixas, bearer da
 * própria TV. A resposta é validada item a item — nada do serviço é confiado sem forma conferida.
 */
import { PortalRequestError } from '../portal/portalClient'
import type { PortalConnection } from '../portal/portalConnection'
import {
  SUBTITLE_LANGUAGES,
  SubtitleError,
  type SubtitleDownloadContext,
  type SubtitleErrorCode,
  type SubtitleLanguage,
  type SubtitleProvider,
  type SubtitleResult,
  type SubtitleSearchRequest,
  type SubtitleSearchResponse,
  type SubtitleServicePort,
} from './types'

/** Mesmo formato que o serviço valida (contrato §3). */
export const RESULT_ID = /^(os:\d{1,12}|sd:\d{1,12}-\d{1,12})$/
const PROVIDERS: readonly SubtitleProvider[] = ['opensubtitles', 'subdl']
const MAX_RELEASE = 200

/** Só o que a TV precisa para chamar o serviço (facilita o fake nos testes). */
export interface SubtitleServiceConnection {
  ready(): Promise<{ bearer: string }>
  client: Pick<PortalConnection['client'], 'request'>
}

export interface PortalSubtitleServiceOptions {
  /** Restringe a busca a estes fornecedores (os outros estão com chave pessoal — `logic §10.1`). */
  providers?: readonly SubtitleProvider[]
  now?: () => number
}

function isProvider(value: unknown): value is SubtitleProvider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)
}

function isLanguage(value: unknown): value is SubtitleLanguage {
  return typeof value === 'string' && (SUBTITLE_LANGUAGES as readonly string[]).includes(value)
}

/** Um item da resposta, ou `null` se a forma não confere (é descartado, o resto aproveitado). */
export function parseResult(value: unknown): SubtitleResult | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !RESULT_ID.test(row.id)) return null
  if (!isProvider(row.provider) || row.id.slice(0, 3) !== (row.provider === 'opensubtitles' ? 'os:' : 'sd:')) return null
  if (!isLanguage(row.language) || typeof row.release !== 'string' || typeof row.hearingImpaired !== 'boolean') return null
  const result: SubtitleResult = {
    id: row.id,
    provider: row.provider,
    language: row.language,
    release: row.release.slice(0, MAX_RELEASE),
    hearingImpaired: row.hearingImpaired,
  }
  if (typeof row.downloads === 'number' && Number.isFinite(row.downloads) && row.downloads >= 0) result.downloads = row.downloads
  if (row.seasonPack === true) result.seasonPack = true
  return result
}

export function parseSearchResponse(value: unknown): SubtitleSearchResponse {
  const body = value as { results?: unknown; unavailable?: unknown } | null
  if (!body || !Array.isArray(body.results) || !Array.isArray(body.unavailable)) throw new SubtitleError('unavailable')
  return {
    results: body.results.map(parseResult).filter((row): row is SubtitleResult => row !== null),
    unavailable: body.unavailable.filter(isProvider),
  }
}

/** `PortalRequestError` → estado que a pessoa distingue (FR-015). Nunca carrega corpo, URL ou chave. */
export function toSubtitleError(error: unknown, now: number): SubtitleError {
  if (error instanceof SubtitleError) return error
  if (!(error instanceof PortalRequestError)) return new SubtitleError('unavailable')
  const retryAt = error.retryAfterMs > 0 ? now + error.retryAfterMs : undefined
  const byCode: Record<string, SubtitleErrorCode> = {
    network_error: 'offline',
    subtitles_not_entitled: 'not_entitled',
    subtitles_device_limit: 'device_limit',
    rate_limited: 'device_limit',
    subtitles_provider_limit: 'provider_limit',
    subtitles_unreadable: 'unreadable',
  }
  const code = byCode[error.code] ?? 'unavailable'
  return new SubtitleError(code, code === 'device_limit' ? retryAt : undefined)
}

export function createPortalSubtitleService(
  connection: SubtitleServiceConnection,
  options: PortalSubtitleServiceOptions = {},
): SubtitleServicePort {
  const now = options.now ?? Date.now
  return {
    async search(request: SubtitleSearchRequest, signal: AbortSignal) {
      try {
        const { bearer } = await connection.ready()
        const body = options.providers ? { ...request, providers: [...options.providers] } : request
        const response = await connection.client.request<unknown>('/portal/v1/device/subtitles/search', { bearer, body, signal })
        return parseSearchResponse(response)
      } catch (error) {
        throw toSubtitleError(error, now())
      }
    },
    async download(resultId: string, language: SubtitleLanguage, signal: AbortSignal, context?: SubtitleDownloadContext) {
      if (!RESULT_ID.test(resultId)) throw new SubtitleError('unavailable')
      try {
        const { bearer } = await connection.ready()
        const response = await connection.client.request<{ text?: unknown }>('/portal/v1/device/subtitles/download', {
          bearer,
          // Só temporada/episódio (pacote de temporada do SubDL); nada além do contrato §3.
          body: {
            id: resultId,
            language,
            ...(context?.season !== undefined ? { season: context.season } : {}),
            ...(context?.episode !== undefined ? { episode: context.episode } : {}),
          },
          signal,
        })
        if (typeof response?.text !== 'string') throw new SubtitleError('unavailable')
        return response.text
      } catch (error) {
        throw toSubtitleError(error, now())
      }
    },
  }
}
