import type { LastFocus } from '../../lib/focus/reconcileFocus'
import type { RadioEntryKey } from '../../lib/radio/radioTypes'

/**
 * Memória da Rádio (feature 074, FR-003/FR-011; `logic/radio-tela.md` §6).
 *
 * - Foco e última entrada: só enquanto o app está aberto (módulo em memória), como `liveSessionMemory.ts`.
 * - Último país: `localStorage` (`ccplaytv:radio-last-country`), fora do backup de uso (`data-model.md` §4). Nada aqui
 *   lança: armazenamento indisponível = não lembra.
 */

export const LAST_COUNTRY_STORAGE_KEY = 'ccplaytv:radio-last-country'

export interface RadioRecalledFocus {
  stationId: string
  /** Posição vista por último — só dica de vizinho se a estação sumir; nunca identidade. */
  index: number
}

const focusByEntry = new Map<RadioEntryKey, RadioRecalledFocus>()
let lastEntry: RadioEntryKey | null = null

export function rememberRadioFocus(entry: RadioEntryKey, stationId: string, index: number): void {
  focusByEntry.set(entry, { stationId, index })
}

export function recalledRadioFocus(entry: RadioEntryKey): RadioRecalledFocus | null {
  return focusByEntry.get(entry) ?? null
}

/** Dica de vizinho para `locateOrNeighbor`. */
export function recalledRadioLastFocus(entry: RadioEntryKey): LastFocus | null {
  const recalled = focusByEntry.get(entry)
  return recalled ? { listKey: entry, index: recalled.index } : null
}

export function rememberRadioEntry(entry: RadioEntryKey): void {
  lastEntry = entry
}

export function recalledRadioEntry(): RadioEntryKey | null {
  return lastEntry
}

export function readLastRadioCountry(): string | null {
  try {
    const value = globalThis.localStorage?.getItem(LAST_COUNTRY_STORAGE_KEY)
    return value && /^[A-Z]{2}$/.test(value) ? value : null
  } catch {
    return null
  }
}

export function writeLastRadioCountry(code: string): void {
  try {
    globalThis.localStorage?.setItem(LAST_COUNTRY_STORAGE_KEY, code)
  } catch {
    // Sem armazenamento: a próxima abertura usa o país da TV.
  }
}

/** Volta ao estado de app recém-aberto (testes). O `localStorage` não é tocado aqui. */
export function resetRadioSessionMemory(): void {
  focusByEntry.clear()
  lastEntry = null
}
