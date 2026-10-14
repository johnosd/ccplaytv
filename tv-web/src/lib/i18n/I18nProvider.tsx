import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { readAppLanguage, subscribeAppLanguage } from './appLanguage'
import { APP_LANGUAGE_LOCALE, type AppLanguage } from './languages'
import { createTranslator, type Translator } from './translate'

/**
 * Idioma vigente na árvore (feature 054, `logic/idioma-do-app.md` §2). O estado
 * mora no store de `appLanguage.ts`; cada `useT()` assina o store (por
 * `useSyncExternalStore`) e re-renderiza quando a pessoa troca o idioma — sem
 * contexto, então funciona também fora do provedor. O provedor só mantém
 * `<html lang>`. NUNCA se remonta a árvore por idioma (perderia foco e rolagem).
 */

export function useLanguage(): AppLanguage {
  return useSyncExternalStore(subscribeAppLanguage, readAppLanguage, readAppLanguage)
}

/** `t` do idioma vigente. Todo componente com texto próprio chama isto — é o que o faz re-renderizar na troca. */
export function useT(): Translator {
  return createTranslator(useLanguage())
}

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const language = useLanguage()
  useEffect(() => {
    document.documentElement.lang = APP_LANGUAGE_LOCALE[language]
  }, [language])
  return <>{children}</>
}
