import type { PlayerPreferences } from '../../lib/player/playerPreferences'
import { LANGUAGE_OPTIONS } from '../../lib/player/tracks'
import { ASPECT_LABEL, ASPECT_MODES, QUALITY_PREFERENCES, QUALITY_PREFERENCE_LABEL } from '../../lib/player/viewChoice'

/**
 * Modelo puro da aba "Player & reprodução" (feature 041,
 * `logic/aspecto-qualidade.md` §4): as quatro linhas, os valores de cada uma e
 * como um valor vira o `patch` de `writePlayerPreferences`. Sem React.
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

function languageOptions(field: 'audioLanguage' | 'textLanguage', noneLabel: string): PreferenceOption[] {
  return [
    { key: 'none', label: noneLabel, patch: { [field]: null } },
    ...LANGUAGE_OPTIONS.map<PreferenceOption>(({ code, label }) => ({ key: code, label, patch: { [field]: code } })),
  ]
}

/** Na ordem das linhas da aba (↑/↓). */
export const PREFERENCE_ROWS: readonly PreferenceRow[] = [
  {
    id: 'aspect',
    label: 'Aspecto padrão',
    options: ASPECT_MODES.map((mode) => ({ key: mode, label: ASPECT_LABEL[mode], patch: { aspect: mode } })),
    selectedKey: (p) => p.aspect,
  },
  {
    id: 'quality',
    label: 'Qualidade padrão',
    options: QUALITY_PREFERENCES.map((q) => ({ key: q, label: QUALITY_PREFERENCE_LABEL[q], patch: { quality: q } })),
    selectedKey: (p) => p.quality,
  },
  {
    id: 'audioLanguage',
    label: 'Idioma do áudio',
    options: languageOptions('audioLanguage', 'Padrão do conteúdo'),
    selectedKey: (p) => p.audioLanguage ?? 'none',
  },
  {
    id: 'textLanguage',
    label: 'Legenda',
    options: languageOptions('textLanguage', 'Desligada'),
    selectedKey: (p) => p.textLanguage ?? 'none',
  },
]

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
