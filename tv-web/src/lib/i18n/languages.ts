/**
 * Idiomas do app (feature 054). Constantes puras: sem armazenamento, sem React.
 * Acrescentar um idioma = uma entrada aqui + um catálogo em `messages/`.
 */

export const APP_LANGUAGES = ['pt', 'en', 'es'] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]

export const DEFAULT_APP_LANGUAGE: AppLanguage = 'pt'

/** Nome de cada idioma NELE MESMO — o seletor nunca depende do idioma atual para ser entendido. */
export const APP_LANGUAGE_NATIVE_NAME: Record<AppLanguage, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
}

/** Código de idioma+região pedido ao TMDB (`language=`) e usado em `Intl.*` para cada idioma do app. */
export const APP_LANGUAGE_LOCALE: Record<AppLanguage, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value)
}
