import { APP_LANGUAGE_LOCALE, type AppLanguage } from '../i18n/languages'

/**
 * Horários de programa para exibição (feature 030, FR-025), sempre no
 * horário local do aparelho. Os instantes recebidos já vêm com o
 * deslocamento manual da fonte aplicado (`nowAndNext`).
 *
 * Sempre 24 h (`h23`), em qualquer idioma (feature 054, FR-010): o guia e a
 * faixa de programação têm colunas de largura fixa, e `20:00` é o formato de
 * grade de TV nos três idiomas. O idioma decide só os algarismos/separadores
 * do `Intl` — não o ciclo de horas.
 */
const CLOCK: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }

export function formatEpgClock(instant: number, language: AppLanguage = 'pt'): string {
  return new Date(instant).toLocaleTimeString(APP_LANGUAGE_LOCALE[language], CLOCK)
}

/** `"20:00 – 21:30"`. */
export function formatEpgTimeRange(start: number, end: number, language: AppLanguage = 'pt'): string {
  return `${formatEpgClock(start, language)} – ${formatEpgClock(end, language)}`
}
