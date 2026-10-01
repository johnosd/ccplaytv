/**
 * "Agora" e "A seguir" de um canal (feature 030, `logic/agora-e-a-seguir.md`).
 *
 * Função pura: recebe os programas de UM canal (em qualquer ordem), o
 * instante atual e o deslocamento da fonte em ms, e devolve o que exibir —
 * horários já deslocados. Nunca inventa: lacuna, janela esgotada ou programa
 * já encerrado resultam em `now` ausente (FR-030).
 */
import type { EpgLookup, EpgProgram, EpgSlot, NowNext } from './types'

function toSlot(program: EpgProgram, offsetMs: number): EpgSlot {
  const slot: EpgSlot = {
    title: program.title,
    start: program.start + offsetMs,
    end: program.end + offsetMs,
  }
  if (program.description !== undefined) slot.description = program.description
  return slot
}

export function nowAndNext(programs: readonly EpgProgram[], now: number, offsetMs: number): NowNext {
  const shifted = programs
    .map((program) => toSlot(program, offsetMs))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  // Sobreposição: vale o que começou por último (o mais recente que já começou);
  // em empate de início, o que termina antes.
  let current: EpgSlot | undefined
  for (const slot of shifted) {
    if (slot.start <= now && now < slot.end) {
      if (current === undefined || slot.start > current.start || (slot.start === current.start && slot.end < current.end)) {
        current = slot
      }
    }
  }

  const after = current ? current.end : now
  const next = shifted.find((slot) => (current ? slot.start >= after : slot.start > after))

  const result: NowNext = {}
  if (current) {
    const duration = current.end - current.start
    const progress = duration > 0 ? Math.min(1, Math.max(0, (now - current.start) / duration)) : 0
    result.now = { ...current, progress }
  }
  if (next) result.next = next
  return result
}

/**
 * "Agora"/"A seguir" de um canal a partir do que `useEpgPrograms` leu. Canal
 * sem id de EPG, sem programação lida ou sem `lookup` (ainda carregando)
 * resulta em `{}` — slot vazio, nunca texto inventado (FR-030). O id é
 * comparado por igualdade exata (FR-008).
 */
export function nowNextForChannel(
  lookup: EpgLookup | undefined,
  epgChannelId: string | null | undefined,
  now: number,
): NowNext {
  if (!lookup || !epgChannelId) return {}
  const programs = lookup.byKey.get(epgChannelId)
  if (!programs) return {}
  return nowAndNext(programs, now, lookup.offsetMs)
}
