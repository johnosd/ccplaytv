/**
 * Palco lógico do Design System V14 (§4.1, feature 021): a interface é
 * desenhada em 1920×1080 e escalada uniformemente para caber inteira na
 * viewport, centralizada, preservando 16:9.
 *
 * Em 1920×1080 (TV de referência) o resultado é a identidade e `transform`
 * é `null` — nenhuma transformação é aplicada, para não mudar a composição
 * da camada web sobre o plano de vídeo de hardware (D-003 do plan.md).
 */

export const STAGE_WIDTH = 1920
export const STAGE_HEIGHT = 1080

export interface StageLayout {
  /** Fator uniforme aplicado ao palco (1 = tamanho real). */
  scale: number
  /** Deslocamento horizontal do palco escalado, em px da viewport (centralização). */
  offsetX: number
  /** Deslocamento vertical do palco escalado, em px da viewport (centralização). */
  offsetY: number
  /** Valor CSS de `transform` para o palco, ou `null` quando é a identidade. */
  transform: string | null
}

export function computeStageLayout(viewportWidth: number, viewportHeight: number): StageLayout {
  const scale = Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_HEIGHT)
  const offsetX = (viewportWidth - STAGE_WIDTH * scale) / 2
  const offsetY = (viewportHeight - STAGE_HEIGHT * scale) / 2

  // Identidade exata (1920×1080): sem `transform` — a camada web nunca
  // ganha uma transformação que pudesse desalinhar o plano de vídeo de
  // hardware na TV de referência (D-003 do plan.md, R-002).
  if (scale === 1 && offsetX === 0 && offsetY === 0) {
    return { scale, offsetX, offsetY, transform: null }
  }

  return { scale, offsetX, offsetY, transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }
}
