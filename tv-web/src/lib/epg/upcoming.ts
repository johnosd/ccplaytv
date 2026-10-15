/**
 * Próximos programas de um canal depois do atual (feature 048, FR-009/FR-010,
 * `sdd/specs/048-live-paridade-v14/logic/destaque-e-programacao.md` §2).
 *
 * Função pura, irmã de `nowAndNext`: mesma ordenação, mesmo deslocamento da
 * fonte, mesma regra de "depois do atual" — o primeiro item é SEMPRE o mesmo
 * `next` que `nowAndNext` devolveria. Nunca inventa: sem programa futuro na
 * janela guardada, lista vazia.
 */
import { resolveSchedule } from './nowNext'
import type { EpgLookup, EpgProgram, EpgSlot } from './types'

/** Quantos cartões de programação a Live mostra no máximo (A seguir / Depois / Mais tarde). */
export const UPCOMING_LIMIT = 3

export function upcomingAfterNow(
  programs: readonly EpgProgram[],
  now: number,
  offsetMs: number,
  limit: number = UPCOMING_LIMIT,
): EpgSlot[] {
  const { shifted, current } = resolveSchedule(programs, now, offsetMs)
  const after = current ? current.end : now
  return shifted.filter((slot) => (current ? slot.start >= after : slot.start > after)).slice(0, limit)
}

/** `upcomingAfterNow` a partir do que `useEpgPrograms` leu — `[]` sem lookup, sem id de EPG ou sem programação. */
export function upcomingForChannel(
  lookup: EpgLookup | undefined,
  epgChannelId: string | null | undefined,
  now: number,
  limit: number = UPCOMING_LIMIT,
): EpgSlot[] {
  if (!lookup || !epgChannelId) return []
  const programs = lookup.byKey.get(epgChannelId)
  if (!programs) return []
  return upcomingAfterNow(programs, now, lookup.offsetMs, limit)
}
