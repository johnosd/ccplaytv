import { APP_LANGUAGE_LOCALE, type AppLanguage } from '../i18n/languages'

/**
 * Nome de país no idioma do app, a partir do código ISO (feature 074, FR-010; `logic/radio-tela.md` §8). Função pura:
 * recebe o idioma, nunca lê o store do i18n. O nome do diretório (inglês) é só fallback.
 */

const UNKNOWN_REGION = 'ZZ'

const cache = new Map<AppLanguage, Intl.DisplayNames | null>()

function displayNames(language: AppLanguage): Intl.DisplayNames | null {
  if (!cache.has(language)) {
    try {
      cache.set(language, new Intl.DisplayNames([APP_LANGUAGE_LOCALE[language]], { type: 'region', fallback: 'none' }))
    } catch {
      cache.set(language, null)
    }
  }
  return cache.get(language) ?? null
}

export function countryDisplayName(code: string, language: AppLanguage, directoryName?: string): string {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return directoryName?.trim() || ''
  // `ZZ` é a "região desconhecida" do CLDR: traduzi-la esconderia o nome real que o diretório mandou.
  if (normalized === UNKNOWN_REGION) return directoryName?.trim() || normalized
  try {
    const name = displayNames(language)?.of(normalized)
    if (name && name !== normalized) return name
  } catch {
    // Código que o Intl não conhece: cai no nome do diretório.
  }
  return directoryName?.trim() || normalized
}
