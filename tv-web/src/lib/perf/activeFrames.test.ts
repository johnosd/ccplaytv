import { describe, expect, it } from 'vitest'
import { createActiveFrameTracker, summarizeGaps } from './activeFrames'

describe('summarizeGaps', () => {
  it('sem quadros não há resumo', () => {
    expect(summarizeGaps([])).toBeNull()
  })

  it('calcula fps médio, pior intervalo e quadros acima de 50 ms', () => {
    // 10 quadros de 16 ms e um de 133 ms: 11 quadros em 293 ms.
    const stats = summarizeGaps([...Array(10).fill(16), 133])
    expect(stats).toEqual({ frames: 11, fps: 38, worstMs: 133, over50: 1 })
  })
})

describe('createActiveFrameTracker', () => {
  function run(tracker: ReturnType<typeof createActiveFrameTracker>, from: number, to: number, step: number) {
    for (let t = from; t <= to; t += step) tracker.onFrame(t)
  }

  it('só conta quadros com tecla nos últimos 2 s', () => {
    const tracker = createActiveFrameTracker()
    run(tracker, 0, 1_000, 16) // sem tecla: não conta
    expect(tracker.snapshot(1_000)).toBeNull()
    tracker.onKey(1_000)
    run(tracker, 1_016, 2_000, 16)
    expect(tracker.snapshot(2_000)?.over50).toBe(0)
    expect(tracker.snapshot(2_000)?.fps).toBeGreaterThanOrEqual(61) // ~16 ms por quadro
    run(tracker, 3_016, 3_500, 16) // depois de 2 s da tecla, o quadro de 1 s de intervalo não conta
    expect(tracker.snapshot(3_500)).toMatchObject({ over50: 0 }) // o intervalo de 1 s fora da janela ativa não entra
  })

  it('registra o quadro lento provocado pela tecla', () => {
    const tracker = createActiveFrameTracker()
    run(tracker, 0, 500, 16)
    tracker.onKey(520)
    tracker.onFrame(636) // 140 ms depois do último quadro (496)
    expect(tracker.snapshot(636)).toMatchObject({ frames: 1, worstMs: 140, over50: 1 })
  })

  it('descarta quadros mais velhos que a janela', () => {
    const tracker = createActiveFrameTracker(2_000, 1_000)
    tracker.onKey(0)
    tracker.onFrame(0)
    tracker.onFrame(100)
    expect(tracker.snapshot(100)?.frames).toBe(1)
    expect(tracker.snapshot(1_500)).toBeNull()
  })
})
