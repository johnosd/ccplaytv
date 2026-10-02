/**
 * Navegação por página nas listas verticais (feature 049, FR-001..FR-003,
 * `sdd/specs/049-navegacao-por-pagina/logic/paginacao.md`).
 *
 * `pageSizeFor`/`pagedIndex` são puras: o índice de destino ao paginar e o
 * tamanho da página. `measuredRowPitch` e `scrollByPage` são o pouco de DOM
 * que mantém o item focado na mesma linha da tela: a lista rola, junto com o
 * foco, a mesma distância de uma página.
 */

/** Passo (altura de item + espaço) assumido para a trilha quando o layout não dá medida (ex.: jsdom). */
export const TRAIL_ROW_PITCH_FALLBACK = 56

/** Distância, em itens, de uma página: o que cabe na área visível, no mínimo 1. */
export function pageSizeFor(viewportHeight: number, rowPitch: number): number {
  if (!Number.isFinite(viewportHeight) || !Number.isFinite(rowPitch) || rowPitch <= 0) return 1
  return Math.max(1, Math.floor(viewportHeight / rowPitch))
}

/**
 * Índice focado depois de paginar: `index ± pageSize`, preso a `[0, total - 1]`
 * (sem dar a volta). `null` com a lista vazia. `pageSize < 1` conta como 1.
 */
export function pagedIndex(index: number, total: number, pageSize: number, direction: 'next' | 'previous'): number | null {
  if (total <= 0) return null
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1
  const from = Math.min(Math.max(Number.isFinite(index) ? Math.floor(index) : 0, 0), total - 1)
  return direction === 'next' ? Math.min(total - 1, from + size) : Math.max(0, from - size)
}

/**
 * Passo vertical entre dois itens vizinhos de uma trilha (`offsetTop` do 2º − do 1º);
 * `TRAIL_ROW_PITCH_FALLBACK` quando não há 2 itens ou o layout não informa (0).
 */
export function measuredRowPitch(container: HTMLElement | null, itemSelector: string): number {
  const items = container?.querySelectorAll<HTMLElement>(itemSelector)
  if (!items || items.length < 2) return TRAIL_ROW_PITCH_FALLBACK
  const pitch = items[1].offsetTop - items[0].offsetTop
  return pitch > 0 ? pitch : TRAIL_ROW_PITCH_FALLBACK
}

/**
 * Rola o contêiner `pageSize` linhas na direção da página, ANTES de o foco mudar
 * (`logic/paginacao.md` §3): o item de destino chega na mesma linha da tela em que
 * o atual estava. O navegador prende a rolagem às pontas; nunca passa do conteúdo.
 */
export function scrollByPage(
  container: HTMLElement | null,
  direction: 'next' | 'previous',
  pageSize: number,
  rowPitch: number,
): void {
  if (!container) return
  const delta = Math.max(1, pageSize) * rowPitch * (direction === 'next' ? 1 : -1)
  container.scrollTop = Math.max(0, container.scrollTop + delta)
}
