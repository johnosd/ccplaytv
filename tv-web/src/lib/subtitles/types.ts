/**
 * Legendas externas (feature 090, `sdd/specs/090-legendas-externas/logic/legenda-externa.md`). Tipos e portas — nada
 * aqui toca rede, banco ou React.
 */
import type { AppLanguage } from '../i18n/languages'

/** Os três idiomas oferecidos (FR-004), no código que o OpenSubtitles usa. */
export type SubtitleLanguage = 'pt-BR' | 'en' | 'es'

export const SUBTITLE_LANGUAGES: readonly SubtitleLanguage[] = ['pt-BR', 'en', 'es']

const APP_TO_SUBTITLE: Record<AppLanguage, SubtitleLanguage> = { pt: 'pt-BR', en: 'en', es: 'es' }

/** Idioma inicial da busca: o do app (pt → pt-BR). */
export function subtitleLanguageForApp(language: AppLanguage): SubtitleLanguage {
  return APP_TO_SUBTITLE[language]
}

/** O item em reprodução, como a busca o enxerga. Só filme e episódio (FR-001); lido do aparelho, nunca da rede. */
export interface SubtitleTarget {
  /** Identidade lógica (fonte + tipo + id estável + temporada/episódio) — a chave da memória (FR-019). */
  stableId: string
  sourceId: string
  kind: 'movie' | 'episode'
  /** Nome limpo da obra (filme) ou da SÉRIE (episódio) — nunca o nome cru do provedor. */
  title: string
  year?: number
  /** Filme: TMDB do título (correspondência ou o declarado pelo painel). */
  tmdbId?: number
  /** Episódio: TMDB da série. */
  parentTmdbId?: number
  season?: number
  episode?: number
  /** Episódio: a série do painel — chave da memória da sequência (FR-003). Nunca vai ao serviço. */
  seriesId?: string
}

/** Temporada/episódio pedidos no download — o serviço acha o arquivo do episódio num pacote de temporada. */
export interface SubtitleDownloadContext {
  season?: number
  episode?: number
}

/** O que a TV manda ao serviço para buscar (FR-005/FR-017) — exatamente estes campos, nada da lista IPTV. */
export type SubtitleSearchRequest =
  | { language: SubtitleLanguage; tmdbId: number }
  | { language: SubtitleLanguage; parentTmdbId: number; season: number; episode: number }
  | { language: SubtitleLanguage; query: string; year?: number; season?: number; episode?: number }

/** Os fornecedores de legenda (ADR-021; SubDL incluído em 2026-10-22). */
export type SubtitleProvider = 'opensubtitles' | 'subdl'

export interface SubtitleResult {
  /**
   * Identificador OPACO do resultado, `<os|sd>:<id do fornecedor>` (ex.: `os:9001`, `sd:3197651-3213944`) — o único
   * dado que volta ao serviço para obter o arquivo. Nunca uma URL (a do SubDL embute a chave).
   */
  id: string
  provider: SubtitleProvider
  language: SubtitleLanguage
  /** Nome da versão/arquivo como o fornecedor declara. */
  release: string
  /** Só quando o fornecedor informa (o OpenSubtitles informa; o SubDL não). */
  downloads?: number
  hearingImpaired: boolean
  /** Pacote da temporada inteira (SubDL): o serviço extrai o arquivo do episódio no download. */
  seasonPack?: boolean
}

/** Resposta da busca: os resultados dos fornecedores que responderam, e quais não responderam agora. */
export interface SubtitleSearchResponse {
  results: SubtitleResult[]
  /** Fornecedores que falharam/estavam no limite nesta busca — a lista avisa, sem esconder os outros. */
  unavailable: SubtitleProvider[]
  /**
   * Só com chave pessoal (BYOK, P3): fornecedores cuja chave da pessoa foi recusada ou está no limite. A lista avisa e
   * oferece "Usar o padrão do ccplayTv" — a troca é sempre explícita, nunca automática (ADR-021 §4).
   */
  keyIssues?: Partial<Record<SubtitleProvider, 'rejected' | 'rate_limited'>>
}

/**
 * Os estados de falha que a pessoa distingue (FR-015). `unreadable` = o arquivo veio, mas não virou legenda.
 * `key_rejected` = o fornecedor recusou a chave PESSOAL da pessoa (BYOK).
 */
export type SubtitleErrorCode = 'offline' | 'not_entitled' | 'device_limit' | 'provider_limit' | 'unreadable' | 'unavailable' | 'key_rejected'

export class SubtitleError extends Error {
  readonly code: SubtitleErrorCode
  /** Quando o uso volta (limite da TV/fornecedor), epoch ms; ausente = não informado. */
  readonly retryAtMs?: number
  /** Fornecedor cuja chave PESSOAL causou a falha (recusada ou no limite): habilita "Usar o padrão do ccplayTv". */
  readonly personal?: SubtitleProvider
  constructor(code: SubtitleErrorCode, retryAtMs?: number, personal?: SubtitleProvider) {
    super(code)
    this.code = code
    this.retryAtMs = retryAtMs
    this.personal = personal
  }
}

/** Fala com o serviço do ccplayTv (modo padrão). Toda chamada parte de uma ação da pessoa (FR-002). */
export interface SubtitleServicePort {
  /** Consulta os fornecedores disponíveis numa só ação (modo padrão: os dois, pelo serviço). */
  search(request: SubtitleSearchRequest, signal: AbortSignal): Promise<SubtitleSearchResponse>
  /** Devolve o texto do arquivo (SRT/WebVTT, UTF-8) — já fora do ZIP no caso do SubDL. */
  download(resultId: string, language: SubtitleLanguage, signal: AbortSignal, context?: SubtitleDownloadContext): Promise<string>
}

/** A legenda guardada de um item (FR-019), já descomprimida. */
export interface StoredExternalSubtitle {
  stableId: string
  sourceId: string
  language: SubtitleLanguage
  /** `SubtitleResult.id` de onde veio (inclui o fornecedor). */
  resultId: string
  release: string
  delayMs: number
  /** `false` = a pessoa desativou; o arquivo fica para reativar sem novo download. */
  active: boolean
  text: string
}

/**
 * Memória local por item **e idioma** (no máximo uma legenda por idioma por item — FR-019). Nunca fala com a rede.
 * No máximo uma linha ativa por item: ativar uma desativa as outras do mesmo item, na mesma transação.
 */
export interface SubtitleStorePort {
  /** A legenda ATIVA do item, ou `null` (nenhuma, ou todas desativadas) — é o que a retomada reaplica. */
  load(stableId: string): Promise<StoredExternalSubtitle | null>
  /**
   * Todas as legendas guardadas do item (≤ 3, uma por idioma), para o painel listar "Externa — <idioma>".
   * Opcional só para fakes de teste; sem ele, o hook usa o que `load` e esta sessão conhecem.
   */
  list?(stableId: string): Promise<StoredExternalSubtitle[]>
  /** Grava/substitui a linha `[stableId+language]`. `false` = não coube/falhou: vale só nesta sessão (nunca erro). */
  save(entry: StoredExternalSubtitle): Promise<boolean>
  /**
   * Muda `active`/`delayMs` da linha do idioma dado (sem idioma: da ativa). `active: true` desativa as demais do item.
   * Não regrava o arquivo.
   */
  update(
    stableId: string,
    patch: Partial<Pick<StoredExternalSubtitle, 'active' | 'delayMs'>>,
    language?: SubtitleLanguage,
  ): Promise<void>
}

/**
 * O que o `PlayerLayer` recebe para oferecer legenda externa. Ausente (`undefined`) = o padrão de produção
 * (`defaultExternalSubtitles()`); `null` = desligado. Sem isto, o player se comporta como antes da 090.
 */
export interface ExternalSubtitlesDeps {
  service: SubtitleServicePort
  store: SubtitleStorePort
  /** Leitura LOCAL do catálogo; `null` = não é filme/episódio (Live, arquivo, item sem identidade). */
  resolveTarget(itemId: string): Promise<SubtitleTarget | null>
  /** Decisão LOCAL de licença (nenhuma rede): `not_entitled` deixa "Buscar legenda online" soft disabled. */
  access?: () => 'allowed' | 'not_entitled'
  /**
   * "Usar o padrão do ccplayTv" (BYOK, P3): para de usar a chave pessoal destes fornecedores, sem apagá-la. Ausente =
   * não há padrão a oferecer (build base, sem licença). A busca é repetida por quem chama.
   */
  useDefault?(providers: readonly SubtitleProvider[]): Promise<void>
}
