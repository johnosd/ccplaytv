import { isResumable } from '../../lib/player/resumePolicy'

/**
 * Progresso mostrado na ação primária do detalhe (feature 059, FR-007,
 * `logic/hero-cinema.md` §3). Só existe com posição de retomada válida E
 * duração conhecida — sem um dos dois, nenhuma barra nem "faltam"
 * (constitution: "Progresso e Capacidades São Reais, Nunca Prometidos").
 */
export interface PrimaryProgress {
  /** 1–99, inteiro (a barra nunca aparece vazia nem cheia). */
  percent: number
  /** Duração − posição, em segundos. */
  remainingSeconds: number
}

export function primaryProgress(
  progressSeconds: number | null | undefined,
  durationSeconds: number | null | undefined,
): PrimaryProgress | null {
  if (progressSeconds == null || !isResumable(progressSeconds)) return null
  if (durationSeconds == null || !(durationSeconds > 0) || progressSeconds >= durationSeconds) return null
  const percent = Math.min(99, Math.max(1, Math.round((progressSeconds / durationSeconds) * 100)))
  return { percent, remainingSeconds: durationSeconds - progressSeconds }
}
