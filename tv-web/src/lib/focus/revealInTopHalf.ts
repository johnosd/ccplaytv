/**
 * Cobertura do campo pelo teclado (feature 045, US3, FR-016, D-011,
 * `logic/ime-teclas-e-cobertura.md` §3): o bloco do campo (rótulo + campo +
 * dica + erro) fica inteiro na **metade superior** do contêiner rolável, onde
 * o teclado da Samsung não chega.
 */

export interface VerticalRect {
  top: number
  bottom: number
  height: number
}

/** Onde ancorar o bloco quando precisa rolar: a 10% do topo do contêiner. */
const ANCHOR_RATIO = 0.1

/**
 * Quanto rolar (px, no espaço do **layout**, positivo = para baixo) para o bloco
 * caber na metade superior do contêiner. `0` quando já cabe. Pura.
 */
export function topHalfScrollDelta(block: VerticalRect, container: VerticalRect): number {
  if (container.height <= 0) return 0
  const limit = container.top + container.height / 2
  if (block.bottom <= limit && block.top >= container.top) return 0
  return block.top - (container.top + container.height * ANCHOR_RATIO)
}

function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let current = element.parentElement; current; current = current.parentElement) {
    const overflowY = getComputedStyle(current).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return current
  }
  return null
}

/**
 * Rola o ancestral rolável mais próximo até o bloco ficar na metade superior.
 * O palco 1920×1080 pode estar escalado (`lib/stage.ts`): os retângulos vêm em
 * pixels da tela e `scrollTop` é do layout, então o delta é dividido pela escala.
 * Sem ancestral rolável, não faz nada. Roda no quadro seguinte, com o layout assentado.
 */
export function revealInTopHalf(block: HTMLElement): void {
  requestAnimationFrame(() => {
    const container = scrollParentOf(block)
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const scale = container.clientHeight > 0 && containerRect.height > 0 ? containerRect.height / container.clientHeight : 1
    const delta = topHalfScrollDelta(block.getBoundingClientRect(), containerRect)
    if (delta !== 0) container.scrollTop += delta / scale
  })
}
