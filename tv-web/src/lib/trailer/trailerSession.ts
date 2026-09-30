/**
 * Máquina de estados de UMA abertura de trailer (feature 033,
 * `sdd/specs/033-trailers-filmes-series/logic/sessao-de-trailer.md`). Pura:
 * quem hospeda (`TrailerLayer`) traduz mensagens da página-ponte, o relógio e
 * as teclas em eventos, e desenha a partir do estado.
 */

/** FR-018: do OK até o player começar a tocar. Um prazo só por abertura (o 2º candidato herda o que sobrou). */
export const TRAILER_START_TIMEOUT_MS = 15_000

/**
 * Depois que a ponte diz "ready" o player está VIVO, e o que o atrasa é o próprio YouTube:
 * anúncios antes do trailer (um, dois em sequência) não contam como "tocando" e passavam
 * dos 15 s — o app derrubava o anúncio com TRL-TEMPO (achado na TV física, R-013). Com o
 * player vivo o prazo passa a ser este; o "Cancelar" continua ativável o tempo todo.
 */
export const TRAILER_READY_TOLERANCE_MS = 90_000

export type TrailerPhase = 'loading' | 'playing' | 'paused' | 'error' | 'closed'

/** `code` é o código técnico discreto mostrado na tela (`YT-150`, `TRL-TEMPO`…). */
export interface TrailerError {
  code: string
  retryable: boolean
}

export interface TrailerSessionState {
  phase: TrailerPhase
  /** Índice do candidato em uso na lista recebida. */
  candidateIndex: number
  candidateCount: number
  /** O próximo candidato já foi tentado nesta abertura (FR-017: uma vez só). */
  fallbackUsed: boolean
  /** Instante (ms) em que `loading` vira erro `TRL-TEMPO`. */
  deadline: number
  error?: TrailerError
}

export type TrailerSessionEvent =
  | { type: 'bridge-state'; state: 'playing' | 'paused' | 'ended' }
  /** Código de erro do YouTube IFrame API (`onError.data`), repassado pela página-ponte. */
  | { type: 'player-error'; code: number }
  /** A página-ponte não conseguiu carregar a API do YouTube. */
  | { type: 'bridge-failed' }
  /** O host dispara quando o relógio passa de `deadline` ainda em `loading`. */
  | { type: 'timeout' }
  /** A ponte carregou a API e o player respondeu: só falta o YouTube (anúncios) — ver `TRAILER_READY_TOLERANCE_MS`. */
  | { type: 'bridge-ready'; now: number }
  | { type: 'retry'; now: number }
  | { type: 'close' }

export function startTrailerSession(input: { candidateCount: number; now: number; online: boolean }): TrailerSessionState {
  const base = {
    candidateIndex: 0,
    candidateCount: input.candidateCount,
    fallbackUsed: false,
    deadline: input.now + TRAILER_START_TIMEOUT_MS,
  }
  if (!input.online) return { ...base, phase: 'error', error: { code: 'TRL-REDE', retryable: true } }
  return { ...base, phase: 'loading' }
}

/** Erros em que outro vídeo pode resolver: removido/privado (100), sem embed (101/150), id ruim (2). */
const VIDEO_SPECIFIC_CODES = new Set([100, 101, 150, 2])

function toError(state: TrailerSessionState, error: TrailerError): TrailerSessionState {
  return { ...state, phase: 'error', error }
}

function onPlayerError(state: TrailerSessionState, code: number): TrailerSessionState {
  const videoSpecific = VIDEO_SPECIFIC_CODES.has(code)
  // 153 e desconhecidos nunca trocam: o problema é a ponte/identificação, não o vídeo.
  if (videoSpecific && !state.fallbackUsed && state.candidateIndex + 1 < state.candidateCount) {
    return { ...state, phase: 'loading', candidateIndex: state.candidateIndex + 1, fallbackUsed: true, error: undefined }
  }
  return toError(state, { code: `YT-${code}`, retryable: !videoSpecific })
}

export function reduceTrailerSession(state: TrailerSessionState, event: TrailerSessionEvent): TrailerSessionState {
  if (state.phase === 'closed') return state
  if (event.type === 'close') return { ...state, phase: 'closed' }

  if (state.phase === 'error') {
    if (event.type === 'retry' && state.error?.retryable) {
      return { ...state, phase: 'loading', deadline: event.now + TRAILER_START_TIMEOUT_MS, error: undefined }
    }
    // Eventos do iframe velho (ou prazo) depois do erro não mudam nada.
    return state
  }

  switch (event.type) {
    case 'bridge-state':
      if (event.state === 'ended') return { ...state, phase: 'closed' }
      return { ...state, phase: event.state }
    case 'bridge-ready':
      // Só alarga, nunca encurta (um retry/reserva já pode ter um prazo maior).
      return state.phase === 'loading'
        ? { ...state, deadline: Math.max(state.deadline, event.now + TRAILER_READY_TOLERANCE_MS) }
        : state
    case 'timeout':
      return state.phase === 'loading' ? toError(state, { code: 'TRL-TEMPO', retryable: true }) : state
    case 'bridge-failed':
      return toError(state, { code: 'TRL-PONTE', retryable: true })
    case 'player-error':
      return onPlayerError(state, event.code)
    case 'retry':
      return state
  }
}

/** Frase simples para a tela de erro (FR-019) — nunca texto bruto do player/rede (FR-020). */
export function trailerErrorMessage(error: TrailerError): string {
  switch (error.code) {
    case 'YT-100':
      return 'Este trailer foi removido ou está privado.'
    case 'YT-101':
    case 'YT-150':
      return 'O dono deste trailer não permite que ele seja exibido em outros apps.'
    case 'YT-2':
      return 'Este trailer não pôde ser aberto.'
    case 'TRL-TEMPO':
      return 'O trailer demorou demais para começar.'
    case 'TRL-REDE':
      return 'Sem conexão com a internet.'
    default:
      return 'O player de trailer não conseguiu iniciar.'
  }
}
