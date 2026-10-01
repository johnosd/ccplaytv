import { describe, expect, it } from 'vitest'
import { computeStageLayout } from './stage'

describe('021 — palco 1920×1080 escalado', () => {
  // US2/AC1–AC3 · FR-009, FR-010 · D-003 (identidade = sem transform)
  it('escala uniforme e centralizada; em 1920×1080 é a identidade, sem transform', () => {
    expect(computeStageLayout(1920, 1080)).toEqual({ scale: 1, offsetX: 0, offsetY: 0, transform: null })

    const hd = computeStageLayout(1280, 720)
    expect(hd.scale).toBeCloseTo(2 / 3, 5)
    expect(hd.offsetX).toBeCloseTo(0, 5)
    expect(hd.offsetY).toBeCloseTo(0, 5)
    expect(hd.transform).not.toBeNull()

    expect(computeStageLayout(3840, 2160).scale).toBeCloseTo(2, 5)

    // Proporção mais larga que 16:9: altura limita, sobra horizontal dividida ao meio.
    const wide = computeStageLayout(2560, 1080)
    expect(wide.scale).toBeCloseTo(1, 5)
    expect(wide.offsetX).toBeCloseTo(320, 5)
    expect(wide.offsetY).toBeCloseTo(0, 5)
    expect(wide.transform).not.toBeNull()

    // Proporção mais alta que 16:9: largura limita, sobra vertical dividida ao meio.
    const tall = computeStageLayout(1920, 1200)
    expect(tall.scale).toBeCloseTo(1, 5)
    expect(tall.offsetX).toBeCloseTo(0, 5)
    expect(tall.offsetY).toBeCloseTo(60, 5)
  })
})
