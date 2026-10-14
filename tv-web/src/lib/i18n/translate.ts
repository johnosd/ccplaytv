import { APP_LANGUAGE_LOCALE, DEFAULT_APP_LANGUAGE, type AppLanguage } from './languages'
import { en } from './messages/en'
import { es } from './messages/es'
import { pt, type MessageKey } from './messages/pt'

/**
 * `t()` do app (feature 054, `logic/idioma-do-app.md` §3). Puro: sem React, sem
 * armazenamento — quem sabe o idioma vigente é `appLanguage.ts`/`useT()`.
 */

export type TranslateParams = Record<string, string | number>

/** `x` de um par `x.one`/`x.other` do catálogo. */
export type PluralBase = MessageKey extends infer K ? (K extends `${infer B}.one` ? B : never) : never

export interface Translator {
  readonly language: AppLanguage
  (key: MessageKey, params?: TranslateParams): string
  /** Escolhe `${base}.one`/`${base}.other` por `Intl.PluralRules`; `{n}` entra como parâmetro. */
  plural(base: PluralBase, n: number, params?: TranslateParams): string
}

type Catalogs = Record<AppLanguage, Readonly<Record<string, string>>>

const CATALOGS: Catalogs = { pt, en, es }

function interpolate(template: string, params: TranslateParams | undefined, language: AppLanguage): string {
  if (!params) return template
  const numbers = new Intl.NumberFormat(APP_LANGUAGE_LOCALE[language])
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    if (value === undefined) return match
    return typeof value === 'number' ? numbers.format(value) : value
  })
}

/** Cria o `translate` sobre catálogos arbitrários (os testes injetam os seus). */
export function buildTranslate(catalogs: Catalogs) {
  function lookup(language: AppLanguage, key: string): string {
    // Chave ausente no idioma cai em pt; ausente em pt devolve a própria chave — nunca vazio.
    return catalogs[language][key] ?? catalogs[DEFAULT_APP_LANGUAGE][key] ?? key
  }

  function translateKey(language: AppLanguage, key: string, params?: TranslateParams): string {
    return interpolate(lookup(language, key), params, language)
  }

  function pluralKey(language: AppLanguage, base: string, n: number, params?: TranslateParams): string {
    // Os três idiomas só distinguem singular (exatamente 1) de plural. Não usa `Intl.PluralRules`:
    // o CLDR de pt trata 0 como "one" ("0 título"), e o app sempre disse "0 títulos".
    const suffix = n === 1 ? 'one' : 'other'
    return translateKey(language, `${base}.${suffix}`, { ...params, n })
  }

  return { translateKey, pluralKey }
}

const real = buildTranslate(CATALOGS)

export function translate(language: AppLanguage, key: MessageKey, params?: TranslateParams): string {
  return real.translateKey(language, key, params)
}

const translators = new Map<AppLanguage, Translator>()

/** Um `Translator` por idioma, reaproveitado (identidade estável: seguro em dependências de hook). */
export function createTranslator(language: AppLanguage): Translator {
  const cached = translators.get(language)
  if (cached) return cached
  const t = ((key: MessageKey, params?: TranslateParams) => real.translateKey(language, key, params)) as Translator
  Object.defineProperty(t, 'language', { value: language, enumerable: true })
  t.plural = (base, n, params) => real.pluralKey(language, base, n, params)
  translators.set(language, t)
  return t
}
