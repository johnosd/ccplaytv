/**
 * A única entrada de busca/download de legenda em produção (feature 090, `logic/legenda-externa.md` §10.1): decide, POR
 * FORNECEDOR, entre a chave pessoal da pessoa (direto da TV ao fornecedor — BYOK, exceção (l)) e o serviço do ccplayTv
 * (chave padrão, exceção (k)). Sem chave pessoal nenhuma é UMA chamada ao serviço, que já consulta os dois.
 *
 * Tudo aqui nasce de uma ação da pessoa (FR-002): as chaves são lidas no começo de cada busca/download, nunca na montagem
 * do player (D-012). A troca para o padrão só acontece quando a pessoa pede ("Usar o padrão do ccplayTv"), nunca sozinha.
 */
import {
  DirectProviderError,
  createDirectProvider,
  toDownloadError,
  type DirectFailure,
  type DirectProvider,
} from './directProviders'
import {
  SubtitleError,
  type SubtitleDownloadContext,
  type SubtitleLanguage,
  type SubtitleProvider,
  type SubtitleResult,
  type SubtitleSearchRequest,
  type SubtitleSearchResponse,
  type SubtitleServicePort,
} from './types'

/** Ordem da junção (igual à do serviço): OpenSubtitles, depois SubDL. */
const ORDER: readonly SubtitleProvider[] = ['opensubtitles', 'subdl']

export interface SubtitleSearchDeps {
  /**
   * Cliente do serviço do ccplayTv restrito a estes fornecedores; `null` = sem serviço (build base, sem portal, sem
   * licença): então só os fornecedores com chave pessoal respondem.
   */
  portal(providers: readonly SubtitleProvider[]): SubtitleServicePort | null
  /** Chaves pessoais ESCOLHIDAS, lidas agora (na ação da pessoa). */
  readKeys(): Promise<Partial<Record<SubtitleProvider, string>>>
  /** Marca o resultado de um uso real da chave pessoal (a aba Integrações o mostra). Falha aqui nunca vira erro. */
  markKey(provider: SubtitleProvider, state: 'rejected' | 'rate_limited'): Promise<void>
  direct?: (provider: SubtitleProvider, key: string) => DirectProvider
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown }

async function settle<T>(run: Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run }
  } catch (error) {
    return { ok: false, error }
  }
}

function failureOf(error: unknown): DirectFailure {
  return error instanceof DirectProviderError ? error.kind : 'unavailable'
}

function providerOf(resultId: string): SubtitleProvider {
  return resultId.startsWith('sd:') ? 'subdl' : 'opensubtitles'
}

export function createSubtitleSearch(deps: SubtitleSearchDeps): SubtitleServicePort {
  const direct = deps.direct ?? ((provider, key) => createDirectProvider(provider, key))

  async function keysNow() {
    try {
      return await deps.readKeys()
    } catch {
      // Sem ler a memória, vale o caminho padrão: a busca nunca quebra por causa da chave pessoal.
      return {}
    }
  }

  function remember(provider: SubtitleProvider, kind: DirectFailure) {
    if (kind === 'rejected' || kind === 'limit') void deps.markKey(provider, kind === 'rejected' ? 'rejected' : 'rate_limited').catch(() => {})
  }

  return {
    async search(request: SubtitleSearchRequest, signal: AbortSignal): Promise<SubtitleSearchResponse> {
      const keys = await keysNow()
      const personal = ORDER.filter((provider) => keys[provider])
      const standard = ORDER.filter((provider) => !keys[provider])
      const portal = standard.length > 0 ? deps.portal(standard) : null
      if (!portal && personal.length === 0) throw new SubtitleError('not_entitled')

      const [portalOutcome, ...directOutcomes] = await Promise.all([
        portal ? settle(portal.search(request, signal)) : Promise.resolve(null),
        ...personal.map((provider) => settle(direct(provider, keys[provider] as string).search(request, signal))),
      ])

      const byProvider = new Map<SubtitleProvider, SubtitleResult[]>()
      const unavailable: SubtitleProvider[] = []
      const keyIssues: NonNullable<SubtitleSearchResponse['keyIssues']> = {}
      let succeeded = 0
      let firstError: unknown

      if (portalOutcome) {
        if (portalOutcome.ok) {
          succeeded += 1
          for (const result of portalOutcome.value.results) byProvider.set(result.provider, [...(byProvider.get(result.provider) ?? []), result])
          unavailable.push(...portalOutcome.value.unavailable)
        } else {
          firstError ??= portalOutcome.error
          unavailable.push(...standard)
        }
      }
      directOutcomes.forEach((outcome, index) => {
        const provider = personal[index]
        if (outcome.ok) {
          succeeded += 1
          byProvider.set(provider, outcome.value)
          return
        }
        const kind = failureOf(outcome.error)
        remember(provider, kind)
        if (kind === 'rejected') keyIssues[provider] = 'rejected'
        else if (kind === 'limit') keyIssues[provider] = 'rate_limited'
        else {
          unavailable.push(provider)
          firstError ??= outcome.error
        }
      })

      const results = ORDER.flatMap((provider) => byProvider.get(provider) ?? [])
      const issues = Object.keys(keyIssues).length > 0 ? { keyIssues } : {}
      if (succeeded === 0 && !('keyIssues' in issues)) {
        // Nada respondeu e nenhuma chave pessoal pede ação: o erro do serviço (ou do fornecedor) explica por quê.
        throw firstError instanceof SubtitleError ? firstError : firstError ? toDownloadError(firstError) : new SubtitleError('unavailable')
      }
      return { results, unavailable, ...issues }
    },

    async download(resultId: string, language: SubtitleLanguage, signal: AbortSignal, context?: SubtitleDownloadContext) {
      const provider = providerOf(resultId)
      const key = (await keysNow())[provider]
      if (key) {
        try {
          return await direct(provider, key).download(resultId, signal, context)
        } catch (error) {
          const kind = failureOf(error)
          remember(provider, kind)
          // Recusada ou no limite: a pessoa pode trocar para o padrão (ação explícita) — o erro diz de qual chave se trata.
          if (kind === 'rejected') throw new SubtitleError('key_rejected', undefined, provider)
          if (kind === 'limit') throw new SubtitleError('provider_limit', undefined, provider)
          throw toDownloadError(error)
        }
      }
      const portal = deps.portal([provider])
      if (!portal) throw new SubtitleError('not_entitled')
      return portal.download(resultId, language, signal, context)
    },
  }
}
