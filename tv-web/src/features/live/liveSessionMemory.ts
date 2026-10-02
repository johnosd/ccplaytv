/**
 * Memória de foco da Live TV (feature 046, `logic/memoria-foco-live.md`) —
 * vive só enquanto o app está aberto (módulo em memória, nunca
 * `localStorage`/IndexedDB), por lista ativa + entrada, como
 * `vodSessionMemory` faz em Filmes/Séries.
 */

/** Chave estável de uma entrada da trilha da Live — nunca índice de trilha. */
export type LiveEntryKey = 'favorites' | 'all' | `category:${string}`

export interface LiveRecalledFocus {
  channelId: string
  /** Posição vista por último — só dica de vizinho se o canal sumir (FR-010); nunca identidade. */
  index: number
}

const focusByEntry = new Map<string, LiveRecalledFocus>()

function entryMemoryKey(sourceId: string, entry: LiveEntryKey): string {
  return `${sourceId}|live|${entry}`
}

export function rememberLiveFocus(sourceId: string, entry: LiveEntryKey, channelId: string, index: number): void {
  focusByEntry.set(entryMemoryKey(sourceId, entry), { channelId, index })
}

export function recalledLiveFocus(sourceId: string, entry: LiveEntryKey): LiveRecalledFocus | null {
  return focusByEntry.get(entryMemoryKey(sourceId, entry)) ?? null
}

/** Descarta tudo de uma lista (excluir a lista — FR-013). */
export function forgetLiveSource(sourceId: string): void {
  const prefix = `${sourceId}|live|`
  for (const key of [...focusByEntry.keys()]) {
    if (key.startsWith(prefix)) focusByEntry.delete(key)
  }
}

/** Só para testes: volta ao estado de app recém-aberto. */
export function resetLiveSessionMemory(): void {
  focusByEntry.clear()
}
