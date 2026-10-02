/**
 * Diagnóstico de reprodução (feature 042, `logic/erros-acionaveis.md` §2).
 * Função pura: recebe o que o player sabe e devolve causa, código, ações e a
 * "Info técnica" já sanitizada. O texto vem sempre da tabela de erros; o erro
 * cru do motor nunca é exibido nem serializado (D-002, FR-014/FR-019).
 */

import { describeError, type ErrorCode } from '../errors/errorCatalog'
import type { PlayableKind } from './capabilities'
import type { PlayerError } from './PlayerService'

export type PlaybackCategory = 'network' | 'format' | 'source' | 'unknown'
export type PlaybackActionId = 'retry' | 'info' | 'edit-credentials'

export interface PlaybackDiagnosisInput {
  /** Falha da sessão (`PlayerError.code` é o nome do erro do motor, ou `null`). */
  error: PlayerError | null
  /** `navigator.onLine` no instante da falha. */
  online: boolean
  /** `'unknown'` quando a falha veio antes de saber o tipo (a busca do item falhou). */
  mediaKind: PlayableKind | 'unknown'
  /** `PlayerAdapter.name` — nunca inclui dado sensível. */
  engine: string
  /** Epoch ms da falha. */
  at: number
  /** Estado da conta confirmado pelo painel (feature 034); `null`/ausente = desconhecido. */
  sourceAccess?: 'expired' | 'refused' | null
}

/** O que o painel "Info técnica" mostra — e nada além disto (FR-014). */
export interface PlaybackTechnicalInfo {
  code: string
  category: PlaybackCategory
  mediaKind: PlayableKind | 'unknown'
  engine: string
  at: number
}

export interface PlaybackDiagnosis {
  /** Código da tabela única (`lib/errors/errorCatalog.ts`), ex.: `PLAY-01`. */
  code: ErrorCode
  category: PlaybackCategory
  /** Título curto da tabela — nunca do erro cru do motor. */
  title: string
  /** Frase para a pessoa — vem da tabela, nunca do erro cru do motor. */
  message: string
  /** Ordem = prioridade; a primeira é a ação primária (focada). No máximo 3. */
  actions: PlaybackActionId[]
  /** `true` só quando tentar de novo sozinho pode resolver (rede/desconhecido, com rede). */
  autoReconnect: boolean
  technical: PlaybackTechnicalInfo
}

/**
 * Lista branca de nomes de erro do AVPlay (R-001: vindos da referência da
 * Samsung, ainda não vistos na TV). Qualquer nome fora daqui é `PLAY-04`.
 * Um lugar só: ampliar depois da passada na TV.
 */
const NETWORK_NAMES: ReadonlySet<string> = new Set([
  'PLAYER_ERROR_CONNECTION_FAILED',
  'PLAYER_ERROR_NETWORK',
  'PLAYER_ERROR_TIMEOUT',
])
const FORMAT_NAMES: ReadonlySet<string> = new Set([
  'PLAYER_ERROR_NOT_SUPPORTED_FILE',
  'PLAYER_ERROR_NOT_SUPPORTED_FORMAT',
  'PLAYER_ERROR_NOT_SUPPORTED_VIDEO_CODEC',
  'PLAYER_ERROR_NOT_SUPPORTED_AUDIO_CODEC',
  'PLAYER_ERROR_INVALID_URI',
])
const SOURCE_NAMES: ReadonlySet<string> = new Set([
  'PLAYER_ERROR_AUTHENTICATION_FAILED',
  'PLAYER_ERROR_STREAM_NOT_FOUND',
])

/** Código interno que `PlayerService.applyCompleted` emite quando um canal ao vivo "termina". */
const LIVE_COMPLETED_CODE = 'stream_completed'

interface Verdict {
  code: ErrorCode
  category: PlaybackCategory
  actions: PlaybackActionId[]
  autoReconnect: boolean
}

function verdictOf(input: PlaybackDiagnosisInput): Verdict {
  if (input.sourceAccess === 'refused') {
    return { code: 'SRC-401', category: 'source', actions: ['edit-credentials', 'info'], autoReconnect: false }
  }
  if (input.sourceAccess === 'expired') {
    return { code: 'SRC-402', category: 'source', actions: ['edit-credentials', 'info'], autoReconnect: false }
  }
  if (!input.online) {
    return { code: 'NET-01', category: 'network', actions: ['retry'], autoReconnect: false }
  }
  const name = input.error?.code ?? null
  if (name !== null) {
    if (NETWORK_NAMES.has(name) || name === LIVE_COMPLETED_CODE) {
      return { code: 'PLAY-01', category: 'network', actions: ['retry', 'info'], autoReconnect: true }
    }
    if (FORMAT_NAMES.has(name)) {
      return { code: 'PLAY-02', category: 'format', actions: ['info'], autoReconnect: false }
    }
    if (SOURCE_NAMES.has(name)) {
      return { code: 'PLAY-03', category: 'source', actions: ['edit-credentials', 'info'], autoReconnect: false }
    }
  }
  return { code: 'PLAY-04', category: 'unknown', actions: ['retry', 'info'], autoReconnect: true }
}

/**
 * Falha ao OBTER o item para tocar (antes de qualquer motor): 409 = existe mas
 * não é reproduzível (corrida entre listar e reproduzir) — `SRC-409`, sem ação
 * de repetir; o resto cai no diagnóstico comum (`NET-01`/`PLAY-04`).
 */
export function diagnoseFetchFailure(input: { status: number | null; online: boolean; at: number }): PlaybackDiagnosis {
  if (input.status === 409) {
    const entry = describeError('SRC-409')
    return {
      code: 'SRC-409',
      category: 'source',
      title: entry.title,
      message: entry.description,
      actions: [],
      autoReconnect: false,
      technical: { code: 'SRC-409', category: 'source', mediaKind: 'unknown', engine: 'none', at: input.at },
    }
  }
  return diagnosePlayback({ error: null, online: input.online, mediaKind: 'unknown', engine: 'none', at: input.at })
}

export function diagnosePlayback(input: PlaybackDiagnosisInput): PlaybackDiagnosis {
  const verdict = verdictOf(input)
  const entry = describeError(verdict.code)
  return {
    code: verdict.code,
    category: verdict.category,
    title: entry.title,
    message: entry.description,
    actions: verdict.actions,
    autoReconnect: verdict.autoReconnect,
    technical: {
      code: verdict.code,
      category: verdict.category,
      mediaKind: input.mediaKind,
      engine: input.engine,
      at: input.at,
    },
  }
}
