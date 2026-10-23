/**
 * Peças da legenda externa no painel "Áudio e legendas" (feature 090, `logic/legenda-externa.md` §4/§4.1), fora de
 * `playerPanels.ts` para ele caber no limite de linhas da catraca; `playerPanels.ts` as reexporta.
 */
import { APP_LANGUAGE_LOCALE } from '../lib/i18n/languages'
import type { Translator } from '../lib/i18n/translate'
import { EXTERNAL_DELAY_LIMIT_MS, EXTERNAL_DELAY_STEP_MS } from '../lib/subtitles/delay'
import type { SubtitleLanguage } from '../lib/subtitles/types'

/**
 * Legenda externa do item (feature 090, `logic/legenda-externa.md` §4). Ausente = o painel da 029 sem mudança.
 */
export interface ExternalPanelInput {
  /** Legendas obtidas para este item (≤ 3, uma por idioma); no máximo uma ativa. */
  stored: { language: SubtitleLanguage; active: boolean; delayMs: number }[]
  /** `shortcut` = "Buscar legenda (<idioma>)" no episódio seguinte (FR-003). `disabledMessage` = soft disabled. */
  search: { mode: 'search' | 'shortcut'; language: SubtitleLanguage; disabledMessage?: string }
}

const LANGUAGE_KEY = { 'pt-BR': 'subtitles.lang.ptBR', en: 'subtitles.lang.en', es: 'subtitles.lang.es' } as const

/** Nome de um idioma de legenda externa no idioma do app. */
export function subtitleLanguageName(language: SubtitleLanguage, t: Translator): string {
  return t(LANGUAGE_KEY[language])
}

/** ←/→ no ajuste da externa: 0,5 s por tecla, preso em ±10 s (FR-008). */
export function stepExternalDelay(current: number, direction: 'left' | 'right'): number {
  const next = current + (direction === 'right' ? EXTERNAL_DELAY_STEP_MS : -EXTERNAL_DELAY_STEP_MS)
  return Math.max(-EXTERNAL_DELAY_LIMIT_MS, Math.min(EXTERNAL_DELAY_LIMIT_MS, next))
}

/** "Sem atraso", "+1,5 s", "−2,0 s" (separador decimal do idioma). */
export function formatExternalDelay(ms: number, t: Translator): string {
  if (ms === 0) return t('subtitles.noDelay')
  const seconds = (Math.abs(ms) / 1000).toLocaleString(APP_LANGUAGE_LOCALE[t.language], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${ms > 0 ? '+' : '−'}${seconds} s`
}
