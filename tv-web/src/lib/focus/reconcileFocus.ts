/**
 * Reconciliação do foco por identidade (constitution, "Voltar Restaura Foco e
 * Posição"; feature 038, FR-027).
 *
 * O foco de uma lista é guardado pelo id do item. Quando a lista muda debaixo
 * dele (a renovação em segundo plano tirou o item que estava em foco), o foco
 * vai para o vizinho mais próximo — o item que agora ocupa a posição onde o
 * focado estava — e nunca pula para o topo. Numa lista DIFERENTE (outra
 * categoria), a posição anterior não vale: começa no primeiro item.
 */

export interface LastFocus {
  /** Identidade da lista (categoria/entrada) onde o índice foi visto. */
  listKey: string
  index: number
}

export function locateOrNeighbor<T>(
  items: readonly T[],
  matches: (item: T) => boolean,
  listKey: string,
  last: LastFocus | null,
): number {
  if (items.length === 0) return 0
  const found = items.findIndex(matches)
  if (found !== -1) return found
  if (last && last.listKey === listKey) return Math.min(Math.max(last.index, 0), items.length - 1)
  return 0
}
