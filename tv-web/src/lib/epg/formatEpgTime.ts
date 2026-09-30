/**
 * Horários de programa para exibição (feature 030, FR-025), sempre no
 * horário local do aparelho. Os instantes recebidos já vêm com o
 * deslocamento manual da fonte aplicado (`nowAndNext`).
 */
const CLOCK: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

export function formatEpgClock(instant: number): string {
  return new Date(instant).toLocaleTimeString('pt-BR', CLOCK)
}

/** `"20:00 – 21:30"`. */
export function formatEpgTimeRange(start: number, end: number): string {
  return `${formatEpgClock(start)} – ${formatEpgClock(end)}`
}
