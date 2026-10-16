/**
 * País da TV (feature 074, FR-011; `logic/radio-tela.md` §3.2): a região do primeiro idioma do sistema que tiver uma
 * (`pt-BR` → `BR`). Aproximação assumida (Analyze A-003): é o idioma do aparelho, não uma configuração de país.
 * `null` quando nenhum idioma traz região.
 */

const REGION = /^[A-Z]{2}$/

function systemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages
  return navigator.language ? [navigator.language] : []
}

export function tvCountryCode(languages: readonly string[] = systemLanguages()): string | null {
  for (const tag of languages) {
    const parts = String(tag).replace(/_/g, '-').split('-')
    for (const part of parts.slice(1)) {
      const region = part.toUpperCase()
      if (REGION.test(region)) return region
    }
  }
  return null
}
