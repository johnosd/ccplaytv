import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const emitted = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock('../perf/metricsChannel', () => ({ emitMetric: (line: Record<string, unknown>) => { emitted.push(line) } }))

import { useScreenAssembly } from './useScreenAssembly'
import type { AssemblySlot } from './screenAssembly'

/** Feature 086 (FR-026/FR-019): o canal recebe o tempo de cada leitura e o tempo de desenho, só com rótulos aceitos. */
function Screen({ slots }: { slots: readonly AssemblySlot<'hero' | 'added-movies'>[] }) {
  const assembly = useScreenAssembly({ screen: 'home', slots, imageUrls: [], loadImage: () => Promise.resolve() })
  return <div data-phase={assembly.phase} />
}

beforeEach(() => {
  emitted.length = 0
  vi.stubEnv('VITE_CCPLAY_PERF', '1')
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('medição da montagem (086)', () => {
  it('emite <leitura>Ms por slot resolvido e paintMs, com chaves que o canal aceita', async () => {
    const slots: AssemblySlot<'hero' | 'added-movies'>[] = [
      { key: 'hero', status: 'ready', primary: true },
      { key: 'added-movies', status: 'ready' },
    ]
    render(<Screen slots={slots} />)
    await new Promise((resolve) => setTimeout(resolve, 10))

    const line = emitted.find((entry) => entry.source === 'assembly')
    expect(line).toBeDefined()
    expect(line).toHaveProperty('heroMs')
    expect(line).toHaveProperty('addedMoviesMs') // o hífen vira camelCase: o canal recusa `added-movies`
    expect(typeof line?.paintMs).toBe('number')
    for (const key of Object.keys(line ?? {})) expect(key).toMatch(/^[a-z][A-Za-z0-9]{0,39}$/)
  })
})
