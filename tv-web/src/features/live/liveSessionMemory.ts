/**
 * Memória de foco da Live TV (feature 046, `logic/memoria-foco-live.md`) —
 * vive só enquanto o app está aberto (módulo em memória, nunca
 * `localStorage`/IndexedDB), por lista ativa + entrada, como
 * `vodSessionMemory` faz em Filmes/Séries.
 *
 * STUB do sdd-plan (não travado) — a assinatura é a definitiva; o corpo é do
 * executor (T008).
 */

/** Chave estável de uma entrada da trilha da Live — nunca índice de trilha. */
export type LiveEntryKey = 'favorites' | 'all' | `category:${string}`

export interface LiveRecalledFocus {
  channelId: string
  /** Posição vista por último — só dica de vizinho se o canal sumir (FR-010); nunca identidade. */
  index: number
}

export function rememberLiveFocus(_sourceId: string, _entry: LiveEntryKey, _channelId: string, _index: number): void {
  throw new Error('not implemented')
}

export function recalledLiveFocus(_sourceId: string, _entry: LiveEntryKey): LiveRecalledFocus | null {
  throw new Error('not implemented')
}

/** Descarta tudo de uma lista (excluir/trocar a lista ativa — FR-013). */
export function forgetLiveSource(_sourceId: string): void {
  throw new Error('not implemented')
}

/** Só para testes: volta ao estado de app recém-aberto. */
export function resetLiveSessionMemory(): void {
  // no-op provisório (T008 o implementa): existe pra os contratos limparem o estado sem quebrar antes da hora.
}
