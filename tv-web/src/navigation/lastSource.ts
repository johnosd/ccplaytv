import type { PreferenceStorage } from '../lib/motionPreference'

/**
 * Última lista escolhida (feature 023, FR-004/FR-005): só o id, nunca
 * credencial nem URL — serve apenas para o foco inicial da tela de perfis.
 * Mesmo tratamento de armazenamento indisponível de `motionPreference.ts`:
 * nada aqui lança.
 */
export const LAST_SOURCE_STORAGE_KEY = 'ccplaytv:last-source'

/**
 * `storage` omitido (`undefined`) = tenta `window.localStorage`, `null` se
 * indisponível. `storage` explícito (inclusive `null`) é usado como está —
 * é o que permite aos testes simularem "sem armazenamento".
 */
function resolveStorage(storage?: PreferenceStorage | null): PreferenceStorage | null {
  if (storage !== undefined) return storage
  try {
    return window.localStorage
  } catch {
    // Acessar `window.localStorage` pode lançar (armazenamento bloqueado)
    // antes mesmo de chamar um método.
    return null
  }
}

/** Id da última lista escolhida, ou `null` (nunca gravado, vazio, ou armazenamento indisponível). */
export function readLastSourceId(storage?: PreferenceStorage | null): string | null {
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    const value = target.getItem(LAST_SOURCE_STORAGE_KEY)
    return value ? value : null
  } catch {
    return null
  }
}

export function writeLastSourceId(sourceId: string, storage?: PreferenceStorage | null): void {
  const target = resolveStorage(storage)
  if (!target) return
  try {
    target.setItem(LAST_SOURCE_STORAGE_KEY, sourceId)
  } catch {
    // Armazenamento cheio ou bloqueado: a última lista simplesmente não
    // persiste — nunca impede a abertura do app.
  }
}
