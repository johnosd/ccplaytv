import { readAppLanguage } from './i18n/appLanguage'
import { APP_LANGUAGE_LOCALE } from './i18n/languages'
import { applyMotionPreference } from './motionPreference'

/** Preferências locais prontas antes do primeiro quadro, sem rede. */
let ready: Promise<void> | undefined

export function prepareLocalStartup(): Promise<void> {
  if (ready) return ready
  applyMotionPreference()
  document.documentElement.lang = APP_LANGUAGE_LOCALE[readAppLanguage()]
  const fonts = 'fonts' in document ? (document.fonts?.ready ?? Promise.resolve()) : Promise.resolve()
  ready = fonts.then(() => undefined, () => undefined)
  return ready
}
