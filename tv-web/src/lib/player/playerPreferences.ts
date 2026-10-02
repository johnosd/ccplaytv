/**
 * Preferências do player — do APARELHO, não da lista (feature 041, FR-011,
 * `data-model.md`). Mesmo padrão de `motionPreference.ts`: armazenamento local
 * pode estar bloqueado (acesso lança) ou cheio (gravação lança), e nenhuma
 * função deixa isso escapar — sem armazenamento, valem os padrões de fábrica.
 *
 * Nunca é escrita pelo player: a escolha feita durante a reprodução vale só
 * para a sequência (FR-012, SC-003). Só a aba "Player & reprodução" escreve.
 */
import type { PreferenceStorage } from '../motionPreference'
import { normalizeLanguage, type TrackChoice } from './tracks'
import { ASPECT_MODES, QUALITY_PREFERENCES, type AspectMode, type QualityPreference, type ViewChoice } from './viewChoice'

export const PLAYER_PREFERENCES_STORAGE_KEY = 'ccplaytv:player-preferences'

export interface PlayerPreferences {
  aspect: AspectMode
  quality: QualityPreference
  /** Código normalizado (`pt`, `en`…) ou `null` = padrão do conteúdo. */
  audioLanguage: string | null
  /** Código normalizado ou `null` = legenda desligada. */
  textLanguage: string | null
}

/** De fábrica (US3/AC1): Ajustar, Auto, sem preferência de áudio, legenda desligada. */
export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  aspect: 'fit',
  quality: 'auto',
  audioLanguage: null,
  textLanguage: null,
}

/**
 * Lê as preferências; campo ausente ou inválido cai no padrão de fábrica
 * daquele campo (nunca descarta os outros). `storage` omitido = armazenamento
 * local do navegador, se acessível.
 */
export function readPlayerPreferences(storage?: PreferenceStorage | null): PlayerPreferences {
  const target = resolveStorage(storage)
  if (!target) return { ...DEFAULT_PLAYER_PREFERENCES }
  let parsed: unknown
  try {
    const raw = target.getItem(PLAYER_PREFERENCES_STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_PLAYER_PREFERENCES }
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_PLAYER_PREFERENCES }
  }
  const record = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  return {
    aspect: ASPECT_MODES.find((mode) => mode === record.aspect) ?? DEFAULT_PLAYER_PREFERENCES.aspect,
    quality: QUALITY_PREFERENCES.find((q) => q === record.quality) ?? DEFAULT_PLAYER_PREFERENCES.quality,
    audioLanguage: validLanguage(record.audioLanguage),
    textLanguage: validLanguage(record.textLanguage),
  }
}

/** Grava `patch` sobre o que está gravado e devolve o resultado. Falha de gravação é silenciosa. */
export function writePlayerPreferences(
  patch: Partial<PlayerPreferences>,
  storage?: PreferenceStorage | null,
): PlayerPreferences {
  const target = resolveStorage(storage)
  const merged = { ...readPlayerPreferences(storage), ...patch }
  if (!target) return merged
  try {
    target.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // Armazenamento cheio ou bloqueado (R-007): não persiste, sem erro.
  }
  return merged
}

/** Ponto de partida da escolha de faixas (029) numa reprodução nova (FR-012/FR-013). */
export function trackChoiceFromPreferences(preferences: PlayerPreferences): TrackChoice {
  return {
    audioLanguage: preferences.audioLanguage,
    textLanguage: preferences.textLanguage,
    subtitleDelayMs: 0,
  }
}

/** Ponto de partida da escolha de aspecto/qualidade numa reprodução nova (FR-012). */
export function viewChoiceFromPreferences(preferences: PlayerPreferences): ViewChoice {
  return { aspect: preferences.aspect, quality: preferences.quality }
}

/** Mesmo critério de `motionPreference`: `undefined` = armazenamento do navegador, se acessível. */
function resolveStorage(storage?: PreferenceStorage | null): PreferenceStorage | null {
  if (storage !== undefined) return storage
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Só aceita um código já normalizado (`pt`, `en`…); qualquer outra coisa vira `null`. */
function validLanguage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return normalizeLanguage(value) === value ? value : null
}
