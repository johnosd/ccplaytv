/**
 * Estado das chaves de legenda no portal (feature 091, ADR-022): por fornecedor, junta a operação pendente, o último
 * resultado e o que a própria TV informou no snapshot — as mesmas regras da chave TMDB (`tmdbStatus.ts`), mais os dois
 * estados que só a TV conhece (recusada no último uso; no limite). O valor da chave NUNCA entra aqui.
 *
 * Regras em `sdd/specs/091-chave-legenda-portal/logic/chave-legenda-portal.md` §6.
 */
import { resolveTmdbView, type TmdbPresentation, type TmdbServiceState } from './tmdbStatus'

export type SubtitleKeyProviderId = 'opensubtitles' | 'subdl'
export const SUBTITLE_KEY_PROVIDERS: readonly SubtitleKeyProviderId[] = ['opensubtitles', 'subdl']

/** O que a TV disse no último snapshot sobre o fornecedor; ausente = a TV ainda não informou (ou é antiga). */
export type SubtitleTvReport = 'none' | 'configured' | 'rejected' | 'rate_limited'

export interface SubtitleKeyServiceState extends Omit<TmdbServiceState, 'tvReported'> {
  tvReported?: SubtitleTvReport
}

export interface SubtitleKeyPresentation extends TmdbPresentation {
  /** A TV informou que o fornecedor está no limite de uso da chave dela (nada a fazer no portal além de esperar). */
  limited: boolean
  /** A TV é antiga ou ainda não informou nada e não há operação do portal: "Estado desconhecido". */
  unknown: boolean
}

export function resolveSubtitleKeyView(state: SubtitleKeyServiceState): SubtitleKeyPresentation {
  const { tvReported, ...operations } = state
  // Para as regras comuns (pendente > recusada > aplicada > ...) "recusada no uso" e "no limite" são uma chave que a TV tem.
  const common = tvReported === undefined ? undefined : tvReported === 'none' ? 'none' : 'configured'
  const base = resolveTmdbView({ ...operations, tvReported: common })
  const settled = base.view === 'configured_on_tv' || base.view === 'applied'
  // O que só a TV sabe vale quando o portal não tem operação a mostrar: a TV é a fonte da verdade do uso da chave.
  if (tvReported === 'rejected' && settled) {
    return { view: 'rejected', reason: 'refused', canRemove: true, needsRetry: false, limited: false, unknown: false }
  }
  return {
    ...base,
    limited: tvReported === 'rate_limited' && settled,
    // Sem operação nem relato da TV (TV antiga ou ainda não sincronizada): nunca afirmar "não configurada".
    unknown: tvReported === undefined && !state.pending && !state.last,
  }
}

export type SubtitleKeyCheck = { ok: true; key: string } | { ok: false }

const KEY_SHAPE = /^[A-Za-z0-9._-]{8,200}$/

/** Formato amplo antes de enviar (`^[A-Za-z0-9._-]{8,200}$`, igual ao da TV); o fornecedor decide o resto na TV. */
export function checkSubtitleKey(raw: string): SubtitleKeyCheck {
  const key = raw.trim()
  // Nunca devolve o que foi colado: o motivo da recusa é só "formato".
  return KEY_SHAPE.test(key) ? { ok: true, key } : { ok: false }
}
