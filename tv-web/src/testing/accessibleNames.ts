/**
 * Verificador de nomes acessíveis para os testes de tela (feature 028,
 * FR-015–FR-017, `logic/nomes-acessiveis.md`). Só testes importam este
 * módulo — nunca o código do app.
 */
import { computeAccessibleName } from 'dom-accessibility-api'

export type UnnamedReason = 'no-name' | 'disabled-unannounced'

export interface UnnamedControl {
  element: Element
  reason: UnnamedReason
  /** Identificação legível do controle (tag, classe, texto) para a mensagem de falha. */
  description: string
}

/** `logic/nomes-acessiveis.md` §1 — controles focáveis/interativos, tabindex=-1 fora. */
const INTERACTIVE_SELECTOR =
  'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), ' +
  '[role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="link"], [role="switch"], ' +
  '[role="checkbox"], [role="slider"]'

/** §3 — "em breve"/"indisponível", com ou sem acento, sem diferenciar maiúsculas. */
const UNAVAILABLE_TEXT = /em breve|indispon[ií]vel/i

function isHidden(el: Element): boolean {
  return el.closest('[aria-hidden="true"], [hidden]') !== null
}

function describe(el: Element, name: string): string {
  const cls = el.className && typeof el.className === 'string' ? ` class="${el.className}"` : ''
  return `<${el.tagName.toLowerCase()}${cls}> "${name}"`
}

/**
 * Controles focáveis/interativos de `root` que falham FR-015 (sem nome
 * acessível) ou FR-016 (soft/hard disabled sem anunciar a indisponibilidade),
 * em ordem de documento, no máximo uma entrada por elemento.
 */
export function findUnnamedControls(root: ParentNode): UnnamedControl[] {
  const out: UnnamedControl[] = []

  for (const el of Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR))) {
    if (isHidden(el)) continue

    const name = computeAccessibleName(el).trim()

    if (!name) {
      out.push({ element: el, reason: 'no-name', description: describe(el, '') })
      continue
    }

    const isSoftOrHard = el.classList.contains('is-soft-disabled') || el.classList.contains('is-hard-disabled')
    if (!isSoftOrHard) continue

    const announced = el.getAttribute('aria-disabled') === 'true' || UNAVAILABLE_TEXT.test(name)
    if (!announced) {
      out.push({ element: el, reason: 'disabled-unannounced', description: describe(el, name) })
    }
  }

  return out
}
