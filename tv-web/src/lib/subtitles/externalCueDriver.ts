/**
 * Agenda das falas de uma legenda externa pelo tempo da MÍDIA (feature 090, `logic/legenda-externa.md` §2). Emite no
 * mesmo formato de `PlayerSession.subscribeSubtitles`, para o `SubtitleOverlay` desenhar sem saber a origem.
 *
 * Um timer só, acordando nas fronteiras de fala (D-012): nada de intervalo nem `requestAnimationFrame`.
 */
import type { SubtitleCue } from '../player/tracks'
import type { ExternalCue } from './subtitleFile'

export interface ExternalCueDriver {
  /** Mesmo contrato da sessão: `null` = apagar a linha exibida agora. */
  subscribeSubtitles(listener: (cue: SubtitleCue | null) => void): () => void
  /** Posição informada pelo motor e se está tocando. Chamado a cada progresso/mudança de estado da sessão. */
  update(positionMs: number, playing: boolean): void
  /** Atraso escolhido: positivo = a fala aparece depois; negativo = antes. */
  setDelay(delayMs: number): void
  dispose(): void
}

export interface ExternalCueDriverOptions {
  delayMs?: number
  /** Relógio injetável (testes); padrão `Date.now`. */
  now?: () => number
}

/** Diferença entre a posição informada e a esperada a partir da qual é salto (seek), não deriva do relógio. */
export const JUMP_THRESHOLD_MS = 1000

export function createExternalCueDriver(cues: readonly ExternalCue[], options: ExternalCueDriverOptions = {}): ExternalCueDriver {
  const now = options.now ?? Date.now
  const listeners = new Set<(cue: SubtitleCue | null) => void>()
  let delayMs = options.delayMs ?? 0
  let shown: ExternalCue | null = null
  let anchor: { mediaMs: number; at: number } | null = null
  let playing = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function emit(cue: SubtitleCue | null) {
    for (const listener of listeners) listener(cue)
  }

  /** Índice da última fala que começa em `t` ou antes (busca binária); -1 = nenhuma. */
  function lastStartedAt(t: number): number {
    let low = 0
    let high = cues.length - 1
    let found = -1
    while (low <= high) {
      const middle = (low + high) >> 1
      if (cues[middle].startMs <= t) {
        found = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    return found
  }

  function cueAt(t: number): ExternalCue | null {
    const index = lastStartedAt(t)
    // Falas sobrepostas: a mais recente que ainda cobre `t` vence; olha só algumas para trás.
    for (let i = index; i >= 0 && i > index - 4; i -= 1) {
      if (t < cues[i].endMs) return cues[i]
    }
    return null
  }

  function nextBoundary(t: number): number | null {
    if (shown) return shown.endMs
    const next = cues[lastStartedAt(t) + 1]
    return next ? next.startMs : null
  }

  function position(): number {
    if (!anchor) return 0
    return anchor.mediaMs + (playing ? now() - anchor.at : 0)
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function schedule(t: number) {
    clearTimer()
    if (!playing || disposed) return
    const boundary = nextBoundary(t)
    if (boundary === null) return
    timer = setTimeout(() => {
      timer = null
      evaluate(position() - delayMs, false)
    }, Math.max(0, Math.ceil(boundary - t)))
  }

  function evaluate(t: number, jump: boolean) {
    const cue = cueAt(t)
    if (jump && shown !== null) {
      emit(null)
      shown = null
    }
    if (cue !== shown) {
      if (cue) emit({ text: cue.text, durationMs: cue.endMs - t })
      else emit(null)
      shown = cue
    }
    schedule(t)
  }

  return {
    subscribeSubtitles(listener) {
      listeners.add(listener)
      // Quem se inscreve depois (o overlay re-renderiza depois de a legenda ser aplicada) recebe a fala que já está
      // valendo — senão ela só apareceria na próxima, porque o driver só emite quando a fala muda.
      if (shown && !disposed) listener({ text: shown.text, durationMs: Math.max(0, shown.endMs - (position() - delayMs)) })
      return () => {
        listeners.delete(listener)
      }
    },
    update(positionMs, isPlaying) {
      if (disposed) return
      const expected = anchor ? anchor.mediaMs + (playing ? now() - anchor.at : 0) : null
      const jump = expected !== null && Math.abs(positionMs - expected) > JUMP_THRESHOLD_MS
      anchor = { mediaMs: positionMs, at: now() }
      playing = isPlaying
      evaluate(positionMs - delayMs, jump)
    },
    setDelay(next) {
      if (disposed || next === delayMs) return
      const current = position()
      delayMs = next
      if (!anchor) return
      // Reancora na posição extrapolada: o tempo efetivo mudou de uma vez, então é salto.
      anchor = { mediaMs: current, at: now() }
      evaluate(current - delayMs, true)
    },
    dispose() {
      disposed = true
      clearTimer()
      listeners.clear()
    },
  }
}
