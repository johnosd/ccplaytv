import { useState } from 'react'
import { clamp } from '../useRemoteNav'

/**
 * Foco por item dentro de uma linha, por **id** (constitution, "Voltar
 * Restaura Foco e Posição") — nunca por índice cru. Usado por `HomeContent`
 * (feature 026, rails do Início) e `SearchScreen` (rails de resultado).
 *
 * `lastIndex` é o que satisfaz "id sumiu → mesmo índice clampado": tanto na
 * restauração inicial (id ainda não encontrado porque a consulta não
 * terminou) quanto durante a sessão (item removido da lista com a linha já
 * em foco).
 */
export function useIdFocus<T extends { id: string }>(items: T[], initialId: string | null) {
  const [focusedId, setFocusedId] = useState<string | null>(initialId)
  const [lastIndex, setLastIndex] = useState(0)

  let index = focusedId !== null ? items.findIndex((item) => item.id === focusedId) : -1
  if (index === -1) index = clamp(lastIndex, 0, Math.max(0, items.length - 1))

  function moveTo(nextIndex: number) {
    const safe = clamp(nextIndex, 0, Math.max(0, items.length - 1))
    setLastIndex(safe)
    const item = items[safe]
    if (item) setFocusedId(item.id)
  }

  if (index !== lastIndex) setLastIndex(index)

  return { index, moveTo }
}
