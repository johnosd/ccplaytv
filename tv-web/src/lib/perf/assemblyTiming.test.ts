import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordAssembly, recordDeferred, takeAssemblyReports } from './assemblyTiming'

const report = { screen: 'home', revealMs: 812, reason: 'cap', pending: ['added-movies'], deferred: [], images: { requested: 3, settled: 3 } }

afterEach(() => {
  vi.unstubAllEnvs()
  delete (globalThis as { __ccplayAssemblyTimings?: unknown }).__ccplayAssemblyTimings
})

describe('assemblyTiming', () => {
  it('desligado por padrão: não registra nada', () => {
    expect(recordAssembly(report)).toBeNull()
    expect(takeAssemblyReports()).toEqual([])
  })

  it('ligado: só números e chaves de fileira, nunca URL ou título', () => {
    vi.stubEnv('VITE_CCPLAY_PERF', '1')
    const entry = recordAssembly(report)
    recordDeferred(entry, ['channels'])
    const [saved] = takeAssemblyReports()
    expect(saved).toEqual({ ...report, deferred: ['channels'] })
    expect(JSON.stringify(saved)).not.toMatch(/https?:|\/\//)
  })
})
