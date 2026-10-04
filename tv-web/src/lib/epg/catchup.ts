/**
 * Regras de arquivo (catch-up) sobre a programação guardada (feature 058,
 * `sdd/specs/058-headers-avplay-catchup/logic/arquivo.md` §1 e §5).
 *
 * Puro: recebe programas já com o deslocamento manual da fonte somado (os
 * mesmos que o Guia desenha), os dias de arquivo do canal e o instante atual.
 * Nunca consulta rede nem armazenamento.
 */

/** Um programa como o Guia o desenha: horários reais (epoch ms), já deslocados. */
export interface ArchiveProgram {
  start: number
  end: number
  title: string
  description?: string
}

/** O que tocar quando um programa de arquivo termina (FR-013). */
export type ArchiveStep = { kind: 'archive'; program: ArchiveProgram } | { kind: 'live' }

/** Folga para considerar dois programas contíguos (XMLTV às vezes arredonda o segundo). */
export const CONTIGUOUS_TOLERANCE_MS = 60_000

/**
 * FR-008: só com arquivo declarado (`archiveDays` > 0), programa já começado e
 * início dentro dos dias do arquivo. STUB do sdd-plan: a Fase 3 implementa.
 */
export function isArchiveAvailable(
  archiveDays: number | null | undefined,
  program: Pick<ArchiveProgram, 'start' | 'end'>,
  now: number,
): boolean {
  void archiveDays
  void program
  void now
  throw new Error('not implemented')
}

/**
 * FR-013: o programa seguinte do mesmo canal, contíguo e disponível no
 * arquivo; o atual termina "no agora" e vai ao ao vivo; lacuna ou fim da
 * programação vão ao ao vivo. STUB do sdd-plan: a Fase 3 implementa.
 */
export function nextArchiveStep(
  programs: readonly ArchiveProgram[],
  current: Pick<ArchiveProgram, 'start' | 'end'>,
  archiveDays: number | null | undefined,
  now: number,
): ArchiveStep {
  void programs
  void current
  void archiveDays
  void now
  throw new Error('not implemented')
}
