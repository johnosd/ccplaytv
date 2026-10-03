import type { MessageKey } from '../../lib/i18n/messages/pt'
import type { Translator } from '../../lib/i18n/translate'
import type { PlayerPreferences } from '../../lib/player/playerPreferences'
import { languageOptionsFor } from '../../lib/player/tracks'
import { ASPECT_LABEL_KEY, ASPECT_MODES, QUALITY_PREFERENCES, QUALITY_PREFERENCE_LABEL_KEY } from '../../lib/player/viewChoice'

/**
 * Modelo puro da aba "Player & reprodução" (feature 041,
 * `logic/aspecto-qualidade.md` §4): as quatro linhas, os valores de cada uma e
 * como um valor vira o `patch` de `writePlayerPreferences`. Sem React. Os
 * rótulos vêm do idioma do app (feature 054): `buildPreferenceRows(t)`.
 */

export type PlayerPreferenceRowId = 'aspect' | 'quality' | 'audioLanguage' | 'textLanguage'

export interface PreferenceOption {
  /** Chave estável da opção (`null` do idioma vira `'none'`). */
  key: string
  label: string
  /** O que gravar quando a opção é escolhida. */
  patch: Partial<PlayerPreferences>
}

export interface PreferenceRow {
  id: PlayerPreferenceRowId
  /** Rótulo da linha e nome do diálogo do seletor. */
  label: string
  options: PreferenceOption[]
  /** Chave da opção marcada para estas preferências. */
  selectedKey: (preferences: PlayerPreferences) => string
}

function languageOptions(
  t: Translator,
  field: 'audioLanguage' | 'textLanguage',
  noneKey: MessageKey,
): PreferenceOption[] {
  return [
    { key: 'none', label: t(noneKey), patch: { [field]: null } },
    ...languageOptionsFor(t.language).map<PreferenceOption>(({ code, label }) => ({ key: code, label, patch: { [field]: code } })),
  ]
}

/** Na ordem das linhas da aba (↑/↓). */
export function buildPreferenceRows(t: Translator): readonly PreferenceRow[] {
  return [
    {
      id: 'aspect',
      label: t('settings.player.aspect'),
      options: ASPECT_MODES.map((mode) => ({ key: mode, label: t(ASPECT_LABEL_KEY[mode]), patch: { aspect: mode } })),
      selectedKey: (p) => p.aspect,
    },
    {
      id: 'quality',
      label: t('settings.player.quality'),
      options: QUALITY_PREFERENCES.map((q) => ({ key: q, label: t(QUALITY_PREFERENCE_LABEL_KEY[q]), patch: { quality: q } })),
      selectedKey: (p) => p.quality,
    },
    {
      id: 'audioLanguage',
      label: t('settings.player.audio'),
      options: languageOptions(t, 'audioLanguage', 'settings.player.audioDefault'),
      selectedKey: (p) => p.audioLanguage ?? 'none',
    },
    {
      id: 'textLanguage',
      label: t('settings.player.text'),
      options: languageOptions(t, 'textLanguage', 'settings.player.textOff'),
      selectedKey: (p) => p.textLanguage ?? 'none',
    },
  ]
}

/** Rótulo do valor atual de uma linha — o que aparece ao lado e no nome acessível. */
export function preferenceValueLabel(row: PreferenceRow, preferences: PlayerPreferences): string {
  const key = row.selectedKey(preferences)
  return row.options.find((option) => option.key === key)?.label ?? row.options[0].label
}

/** Índice da opção marcada, para o foco inicial do seletor (nunca -1). */
export function selectedOptionIndex(row: PreferenceRow, preferences: PlayerPreferences): number {
  const key = row.selectedKey(preferences)
  return Math.max(0, row.options.findIndex((option) => option.key === key))
}
