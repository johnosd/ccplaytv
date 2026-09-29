/**
 * "Agora" e "A seguir" de um canal (feature 030, `logic/agora-e-a-seguir.md`).
 *
 * Função pura: recebe os programas de UM canal (em qualquer ordem), o
 * instante atual e o deslocamento da fonte em ms, e devolve o que exibir —
 * horários já deslocados. Nunca inventa: lacuna, janela esgotada ou programa
 * já encerrado resultam em `now` ausente (FR-030).
 *
 * STUB do sdd-plan — o sdd-execute implementa (T012).
 */
import type { EpgProgram, NowNext } from './types'

export function nowAndNext(_programs: readonly EpgProgram[], _now: number, _offsetMs: number): NowNext {
  throw new Error('not implemented')
}
