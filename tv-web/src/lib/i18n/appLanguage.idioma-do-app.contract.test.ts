import { describe, expect, it } from 'vitest'
import type { PreferenceStorage } from '../motionPreference'
import { APP_LANGUAGE_STORAGE_KEY, resolveAppLanguage } from './appLanguage'
import { en } from './messages/en'
import { es } from './messages/es'
import { pt } from './messages/pt'

/**
 * Feature 054 — contrato da escolha do idioma e dos catálogos.
 * `sdd/specs/054-idioma-do-app/logic/idioma-do-app.md` §1 e §3.
 */

function memory(initial: Record<string, string> = {}): PreferenceStorage {
  const data = { ...initial }
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

const LEGACY_KEY = 'ccplaytv:player-preferences'

describe('idioma do app — contrato (feature 054)', () => {
  it('FR-011/FR-012/US5: gravado vence; depois o legado de trailers; depois o idioma da TV suportado; senão português', () => {
    // Gravado e válido vence até do sistema.
    expect(resolveAppLanguage({ storage: memory({ [APP_LANGUAGE_STORAGE_KEY]: 'en' }), systemLanguages: ['es-MX'] })).toBe('en')
    // Gravado inválido é ignorado, não derruba o app.
    expect(resolveAppLanguage({ storage: memory({ [APP_LANGUAGE_STORAGE_KEY]: 'xx' }), systemLanguages: ['es-MX'] })).toBe('es')
    // Migração (SC-007): "Idioma preferido (trailers)" gravado antes vira o idioma do app.
    expect(
      resolveAppLanguage({ storage: memory({ [LEGACY_KEY]: JSON.stringify({ preferredLanguage: 'en' }) }), systemLanguages: ['es'] }),
    ).toBe('en')
    // Sem nada gravado: o primeiro idioma suportado da lista do sistema (região é ignorada).
    expect(resolveAppLanguage({ storage: memory(), systemLanguages: ['ja-JP', 'es-MX', 'en-US'] })).toBe('es')
    // Nenhum suportado, ou sem armazenamento algum: português, sem lançar.
    expect(resolveAppLanguage({ storage: memory(), systemLanguages: ['ja-JP'] })).toBe('pt')
    expect(resolveAppLanguage({ storage: null, systemLanguages: [] })).toBe('pt')
  })

  it('FR-004/SC-001: en e es têm exatamente as chaves e os {marcadores} do catálogo-base em português', () => {
    const keys = (catalog: Record<string, string>) => Object.keys(catalog).sort()
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()

    expect(keys(en)).toEqual(keys(pt))
    expect(keys(es)).toEqual(keys(pt))
    for (const key of keys(pt)) {
      expect(placeholders(en[key] ?? '')).toEqual(placeholders(pt[key as keyof typeof pt]))
      expect(placeholders(es[key] ?? '')).toEqual(placeholders(pt[key as keyof typeof pt]))
      // Chave traduzida nunca vazia: vazio apareceria como botão sem rótulo.
      expect(en[key]?.trim()).toBeTruthy()
      expect(es[key]?.trim()).toBeTruthy()
    }
  })
})
