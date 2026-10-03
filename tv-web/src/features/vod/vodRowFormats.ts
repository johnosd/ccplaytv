import type { RowFormat } from './vodShowcaseRows'

/**
 * Medidas dos formatos de fileira da tela hero (feature 053, D-003/D-006) — fonte única: o `Rail` precisa de
 * largura/altura fixas em px, e o CSS lê as mesmas por variáveis inline (`--vod-card-w`/`--vod-card-h`).
 * `itemWidth` = card + respiro; `cardWidth` = largura do card; `rowHeight` = título + trilho (altura fixa da fileira
 * na pilha virtualizada, sem medição).
 */
export interface RowFormatMetrics {
  itemWidth: number
  itemHeight: number
  cardWidth: number
  rowHeight: number
}

/** Título da fileira (`--fs-h2` + respiro) somado ao trilho. */
const ROW_TITLE_BLOCK = 56
/** Folga vertical entre fileiras. */
const ROW_GAP = 32

function metrics(cardWidth: number, itemWidth: number, itemHeight: number): RowFormatMetrics {
  return { cardWidth, itemWidth, itemHeight, rowHeight: ROW_TITLE_BLOCK + itemHeight + ROW_GAP }
}

export const ROW_FORMATS: Record<RowFormat, RowFormatMetrics> = {
  'poster-xl': metrics(300, 324, 440),
  poster: metrics(260, 284, 383),
  'poster-compact': metrics(200, 224, 300),
  top10: metrics(340, 360, 300),
  wide: metrics(400, 424, 240),
}
