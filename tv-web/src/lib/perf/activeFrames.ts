/**
 * Quadros medidos só enquanto há tecla recente (feature 083, T016): é o que revela o custo do foco, que o contador
 * de quadros lentos do `PerfOverlay` mistura com o trabalho em segundo plano. Só números — nunca nome de item.
 * Só existe no build de medição (`VITE_CCPLAY_PERF=1`).
 */
export interface ActiveFrameStats {
  frames: number
  fps: number
  worstMs: number
  over50: number
}

interface Sample {
  at: number
  gap: number
}

export interface ActiveFrameTracker {
  onKey(now: number): void
  onFrame(now: number): void
  snapshot(now: number): ActiveFrameStats | null
}

/** Resume intervalos entre quadros (ms): fps médio, pior intervalo e quantos passaram de 50 ms. */
export function summarizeGaps(gaps: number[]): ActiveFrameStats | null {
  if (gaps.length === 0) return null
  const total = gaps.reduce((sum, gap) => sum + gap, 0)
  return {
    frames: gaps.length,
    fps: total > 0 ? Math.round(gaps.length / (total / 1000)) : 0,
    worstMs: Math.round(Math.max(...gaps)),
    over50: gaps.filter((gap) => gap > 50).length,
  }
}

/**
 * Um quadro conta quando houve tecla nos últimos `activeMs`; o resumo olha os quadros contados nos últimos `windowMs`.
 * O intervalo é medido entre quadros consecutivos mesmo quando o anterior era "parado" — assim o quadro que a
 * tecla provoca (o mais caro) entra.
 */
export function createActiveFrameTracker(activeMs = 2_000, windowMs = 4_000): ActiveFrameTracker {
  let lastKey = Number.NEGATIVE_INFINITY
  let previous: number | null = null
  let samples: Sample[] = []
  return {
    onKey(now) {
      lastKey = now
    },
    onFrame(now) {
      if (previous !== null && now - lastKey <= activeMs) samples.push({ at: now, gap: now - previous })
      previous = now
      if (samples.length > 0 && now - samples[0].at > windowMs) samples = samples.filter((sample) => now - sample.at <= windowMs)
    },
    snapshot(now) {
      return summarizeGaps(samples.filter((sample) => now - sample.at <= windowMs).map((sample) => sample.gap))
    },
  }
}
