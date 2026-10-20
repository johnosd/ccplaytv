import { useEffect } from 'react'
import { markEntry } from './entryTiming'

/**
 * Fecha a medição da entrada numa categoria (feature 038, FR-012) no primeiro quadro com itens: o efeito roda depois do
 * commit e o `requestAnimationFrame` depois da pintura. `painted` = a categoria cujos itens já estão na tela (ou
 * `undefined`). Vale para a leitura inteira e para a janela (feature 082: categoria grande no formato comprimido abre por
 * janela e ficava sem número na TV). Sem a medição ligada, `markEntry` não faz nada.
 */
export function useEntryFirstPaint(painted: { id: number; kind: string } | undefined): void {
  const id = painted?.id
  const kind = painted?.kind
  useEffect(() => {
    if (id === undefined || kind === undefined) return
    const frame = requestAnimationFrame(() => markEntry(id, kind, 'firstPaint'))
    return () => cancelAnimationFrame(frame)
  }, [id, kind])
}
