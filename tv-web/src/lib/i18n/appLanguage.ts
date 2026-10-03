import type { PreferenceStorage } from '../motionPreference'
import { DEFAULT_APP_LANGUAGE, isAppLanguage, type AppLanguage } from './languages'

/**
 * Preferência de idioma do APARELHO (feature 054, `logic/idioma-do-app.md` §1).
 * Mesmo molde de `motionPreference.ts`: armazenamento pode estar bloqueado (acesso
 * lança) ou cheio (gravação lança) e nenhuma função deixa isso escapar.
 */

export const APP_LANGUAGE_STORAGE_KEY = 'ccplaytv:app-language'

/** `preferredLanguage` da antiga linha "Idioma preferido (trailers)" — só LEITURA, para migrar (FR-012). */
const LEGACY_PREFERENCES_KEY = 'ccplaytv:player-preferences'

export interface ResolveAppLanguageInput {
  /** `undefined` = armazenamento do navegador, se acessível; `null` = sem armazenamento. */
  storage?: PreferenceStorage | null
  /** Idiomas do sistema/TV em ordem de preferência (`navigator.languages`); `undefined` = lê do ambiente. */
  systemLanguages?: readonly string[]
}

function resolveStorage(storage?: PreferenceStorage | null): PreferenceStorage | null {
  if (storage !== undefined) return storage
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function environmentLanguages(): readonly string[] {
  try {
    if (typeof navigator === 'undefined') return []
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages
    return navigator.language ? [navigator.language] : []
  } catch {
    return []
  }
}

/** `en-US`/`pt_BR` → `en`/`pt`; `undefined` se o código primário não é suportado. */
function supportedPrimary(tag: string): AppLanguage | undefined {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0]
  return isAppLanguage(primary) ? primary : undefined
}

function readRaw(storage: PreferenceStorage | null, key: string): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function legacyLanguage(storage: PreferenceStorage | null): AppLanguage | undefined {
  const raw = readRaw(storage, LEGACY_PREFERENCES_KEY)
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    const value = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>).preferredLanguage : undefined
    return isAppLanguage(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Ordem (FR-011/FR-012): valor gravado e válido > `preferredLanguage` legado de
 * `ccplaytv:player-preferences` > primeiro idioma do sistema suportado > `pt`.
 * Nunca lança; resolver NÃO grava (a detecção pela TV não vira "escolha da pessoa").
 */
export function resolveAppLanguage(input: ResolveAppLanguageInput = {}): AppLanguage {
  const storage = resolveStorage(input.storage)
  const stored = readRaw(storage, APP_LANGUAGE_STORAGE_KEY)
  if (isAppLanguage(stored)) return stored

  const legacy = legacyLanguage(storage)
  if (legacy !== undefined) return legacy

  for (const tag of input.systemLanguages ?? environmentLanguages()) {
    const language = supportedPrimary(tag)
    if (language !== undefined) return language
  }
  return DEFAULT_APP_LANGUAGE
}

/**
 * Só existe quando a GRAVAÇÃO falhou (armazenamento bloqueado/cheio): sem ele, a
 * troca de idioma não valeria na sessão. Com armazenamento saudável o valor vem
 * sempre dele — e um teste que limpa o `localStorage` volta ao padrão sozinho.
 */
let sessionOverride: AppLanguage | undefined

const listeners = new Set<() => void>()

/** Idioma vigente. Barato o bastante para ser o `getSnapshot` de `useSyncExternalStore` (devolve string). */
export function readAppLanguage(): AppLanguage {
  return sessionOverride ?? resolveAppLanguage()
}

/** Grava, avisa os assinantes e devolve o idioma. Falha de gravação é silenciosa (vale na sessão). */
export function writeAppLanguage(language: AppLanguage, storage?: PreferenceStorage | null): AppLanguage {
  const target = resolveStorage(storage)
  let persisted = false
  if (target) {
    try {
      target.setItem(APP_LANGUAGE_STORAGE_KEY, language)
      persisted = true
    } catch {
      // Armazenamento cheio ou bloqueado: não persiste; vale só nesta sessão.
    }
  }
  // Armazenamento explícito (testes) não é o do navegador: o vigente passa a ser lido da sessão.
  sessionOverride = persisted && storage === undefined ? undefined : language
  for (const listener of [...listeners]) listener()
  return language
}

/** Para `useSyncExternalStore`: avisa quando `writeAppLanguage` muda o idioma. */
export function subscribeAppLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Só para testes: descarta o idioma de sessão. */
export function resetAppLanguageForTests(): void {
  sessionOverride = undefined
}
