/**
 * Preferência interna de "reduzir movimento" (DS V14 §10, feature 021).
 *
 * Soma-se à media query `prefers-reduced-motion` (qualquer uma ligada =
 * movimento reduzido): o motor da TV pode não expor a media query, e a
 * Onda 5 liga um controle visível a esta preferência. Aqui não há UI.
 *
 * Armazenamento local pode estar bloqueado (acesso lança) ou cheio
 * (gravação lança): nenhuma das funções deixa isso escapar (FR-019).
 */

/** Classe aplicada ao elemento raiz quando a preferência interna está ligada. */
export const REDUCED_MOTION_CLASS = 'reduce-motion'

export const REDUCED_MOTION_STORAGE_KEY = 'ccplaytv:reduce-motion'

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * `storage` omitido (`undefined`) = tenta `window.localStorage`, `null` se
 * indisponível. `storage` explícito (inclusive `null`) é usado como está —
 * é o que permite aos testes simularem "sem armazenamento" sem depender de
 * `window.localStorage` de verdade.
 */
function resolveStorage(storage?: PreferenceStorage | null): PreferenceStorage | null {
  if (storage !== undefined) return storage
  try {
    return window.localStorage
  } catch {
    // Acessar `window.localStorage` pode lançar (armazenamento bloqueado
    // pelo motor/política de privacidade) antes mesmo de chamar um método.
    return null
  }
}

/** `storage` omitido = armazenamento local do navegador, se acessível. */
export function readReducedMotionPreference(storage?: PreferenceStorage | null): boolean {
  const target = resolveStorage(storage)
  if (!target) return false
  try {
    return target.getItem(REDUCED_MOTION_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeReducedMotionPreference(enabled: boolean, storage?: PreferenceStorage | null): void {
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.setItem(REDUCED_MOTION_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // Armazenamento cheio ou bloqueado na gravação (FR-019) — a preferência
    // simplesmente não persiste; não impede a abertura do app.
  }
}

/** Liga/desliga `REDUCED_MOTION_CLASS` em `root` (padrão: `<html>`) conforme a preferência gravada. */
export function applyMotionPreference(root?: HTMLElement, storage?: PreferenceStorage | null): void {
  const target = root ?? document.documentElement
  target.classList.toggle(REDUCED_MOTION_CLASS, readReducedMotionPreference(storage))
}
