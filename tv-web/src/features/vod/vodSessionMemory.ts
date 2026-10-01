/**
 * Memória de sessão de Filmes/Séries (feature 025, FR-021, FR-030, FR-032,
 * FR-007) — vive só enquanto o app está aberto (módulo em memória, nunca
 * `localStorage`), e sobrevive à tela desmontar (ir ao Início e voltar).
 *
 * - foco por entrada da side nav (§41 do DS V14);
 * - ordenação escolhida por seção;
 * - se o "↺ Histórico" de uma seção já foi aberto nesta sessão (a contagem
 *   só aparece depois disso).
 *
 * `logic/foco-vod.md` §4. STUB do sdd-plan (não travado) — a forma já é a
 * definitiva; o executor pode completar.
 */

import type { VodSortOption } from './vodSort'

export type VodSection = 'movies' | 'series'

/** Chave estável de uma entrada da side nav — nunca índice. */
export type VodEntryKey = 'favorites' | 'history' | 'all' | `category:${string}`

const focusByEntry = new Map<string, string>()
const sortBySection = new Map<VodSection, VodSortOption>()
const historyKnown = new Set<string>()

function entryMemoryKey(sourceId: string, section: VodSection, entry: VodEntryKey): string {
  return `${sourceId}|${section}|${entry}`
}

export function rememberFocus(sourceId: string, section: VodSection, entry: VodEntryKey, itemId: string | null): void {
  const key = entryMemoryKey(sourceId, section, entry)
  if (itemId === null) focusByEntry.delete(key)
  else focusByEntry.set(key, itemId)
}

export function recalledFocus(sourceId: string, section: VodSection, entry: VodEntryKey): string | null {
  return focusByEntry.get(entryMemoryKey(sourceId, section, entry)) ?? null
}

export function sessionSort(section: VodSection): VodSortOption {
  return sortBySection.get(section) ?? 'source'
}

export function setSessionSort(section: VodSection, option: VodSortOption): void {
  sortBySection.set(section, option)
}

export function markHistoryKnown(sourceId: string, section: VodSection): void {
  historyKnown.add(`${sourceId}|${section}`)
}

export function isHistoryKnown(sourceId: string, section: VodSection): boolean {
  return historyKnown.has(`${sourceId}|${section}`)
}

/** Só para testes: volta ao estado de app recém-aberto. */
export function resetVodSessionMemory(): void {
  focusByEntry.clear()
  sortBySection.clear()
  historyKnown.clear()
}
