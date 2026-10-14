import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActivityGate } from '../../lib/catalog/prefetch/activityGate'
import type { SpeedTestOptions, SpeedTestOutcome, SpeedTestResult } from '../../lib/network/speedTest'
import { useSpeedTest } from './useSpeedTest'
import type { SpeedTestRepositoryOptions } from '../../lib/network/speedTestRepository'

const measured: SpeedTestResult = {
  version: 1, destination: 'cloudflare', measuredAt: 1_800_000_000_000, downloadMbps: 30, latencyMs: 20, jitterMs: 2,
  status: 'complete', reason: 'completed', durationMs: 3500, requestedBytes: 26_000_009, receivedBytes: 26_000_009, latencySamples: 8, downloadSamples: 3,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('useSpeedTest — lifecycle e compromisso', () => {
  it('expõe código de leitura/escrita, conserva medição e limpa código após sucesso', async () => {
    const read = vi.fn(async (options?: SpeedTestRepositoryOptions) => {
      options?.onUnavailable?.('NET-R-TABLE')
      throw new Error('storage_unavailable')
    })
    let unavailable = true
    const save = vi.fn(async (_outcome: SpeedTestOutcome, options?: SpeedTestRepositoryOptions) => {
      if (unavailable) { options?.onUnavailable?.('NET-W-QUOTA'); return 'unavailable' as const }
      return 'written' as const
    })
    const run = vi.fn(async () => ({ state: 'completed', result: measured } as const))
    const gate = createActivityGate()
    const { result } = renderHook(() => useSpeedTest({ read, save, run, gate }))
    await waitFor(() => expect(result.current.storageCode).toBe('NET-R-TABLE'))
    await act(async () => { await result.current.start() })
    expect(result.current.storageCode).toBe('NET-W-QUOTA')
    expect(result.current.storageUnavailable).toBe(true)
    expect(result.current.result).toEqual(measured)
    unavailable = false
    await act(async () => { await result.current.start() })
    expect(result.current.lastResult).toEqual(measured)
    expect(result.current.storageCode).toBeUndefined()
    expect(result.current.storageUnavailable).toBe(false)
  })

  it('fechar após iniciar compromisso aguarda escrita e atualiza último resultado sem reabrir', async () => {
    const writing = deferred<'written' | 'unavailable'>()
    const run = vi.fn(async () => ({ state: 'completed', result: measured } as const))
    const save = vi.fn(() => writing.promise)
    const read = vi.fn(async () => null)
    const onSaved = vi.fn()
    const gate = createActivityGate()
    const { result } = renderHook(() => useSpeedTest({ run, save, read, onSaved, gate }))
    act(() => { void result.current.start() })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    let closing!: Promise<void>
    act(() => { closing = result.current.cancel() })
    expect(onSaved).not.toHaveBeenCalled()
    await act(async () => { writing.resolve('written'); await closing })
    expect(result.current.phase).toBe('ready')
    expect(result.current.result).toBeNull()
    expect(result.current.lastResult).toEqual(measured)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
  it('monta sem medir e bloqueia mídia; cancelamento descarta resultado tardio sem gravar', async () => {
    const gate = createActivityGate()
    const release = gate.acquirePlayback()
    const outcome = deferred<SpeedTestOutcome>()
    let signal!: AbortSignal
    const run = vi.fn((options: SpeedTestOptions) => { signal = options.signal; return outcome.promise })
    const read = vi.fn(async () => measured)
    const save = vi.fn(async () => 'written' as const)
    const { result } = renderHook(() => useSpeedTest({ gate, run, read, save }))
    await waitFor(() => expect(result.current.lastResult).toEqual(measured))
    expect(run).not.toHaveBeenCalled()
    await act(async () => { await result.current.start() })
    expect(result.current.phase).toBe('blocked')
    expect(run).not.toHaveBeenCalled()
    act(() => release())
    act(() => { void result.current.start(); void result.current.start() })
    expect(run).toHaveBeenCalledTimes(1)
    act(() => { void result.current.cancel() })
    expect(signal.aborted).toBe(true)
    await act(async () => { outcome.resolve({ state: 'completed', result: measured }); await outcome.promise })
    expect(save).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('ready')
    expect(result.current.lastResult).toEqual(measured)
  })

  it('pagehide e mídia que surge cancelam; retorno não reinicia, desmontagem também aborta', async () => {
    const gate = createActivityGate()
    const outcomes: ReturnType<typeof deferred<SpeedTestOutcome>>[] = []
    const signals: AbortSignal[] = []
    const run = vi.fn((options: SpeedTestOptions) => {
      signals.push(options.signal)
      const value = deferred<SpeedTestOutcome>()
      outcomes.push(value)
      return value.promise
    })
    const read = vi.fn(async () => null)
    const save = vi.fn(async () => 'written' as const)
    const hook = renderHook(() => useSpeedTest({ gate, run, read, save }))
    act(() => { void hook.result.current.start() })
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(signals[0].aborted).toBe(true)
    await act(async () => { outcomes[0].resolve({ state: 'cancelled' }); await outcomes[0].promise })
    act(() => window.dispatchEvent(new Event('pageshow')))
    expect(run).toHaveBeenCalledTimes(1)
    act(() => { void hook.result.current.start() })
    let release!: () => void
    act(() => { release = gate.acquirePlayback() })
    expect(signals[1].aborted).toBe(true)
    await act(async () => { outcomes[1].resolve({ state: 'cancelled' }); await outcomes[1].promise })
    act(() => release())
    act(() => { void hook.result.current.start() })
    hook.unmount()
    expect(signals[2].aborted).toBe(true)
    outcomes[2].resolve({ state: 'completed', result: measured })
    await outcomes[2].promise
    expect(save).not.toHaveBeenCalled()
  })

  it('repete só após compromisso pendente e conserva resultado atual em falha de guarda', async () => {
    const writing = deferred<'written' | 'unavailable'>()
    const run = vi.fn(async () => ({ state: 'completed', result: measured } as const))
    const save = vi.fn(() => writing.promise)
    const read = vi.fn(async () => null)
    const onSaved = vi.fn()
    const gate = createActivityGate()
    const { result } = renderHook(() => useSpeedTest({ run, save, read, onSaved, gate }))
    act(() => { void result.current.start() })
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(result.current.result).toEqual(measured)
    await act(async () => { await result.current.start() })
    expect(run).toHaveBeenCalledTimes(1)
    await act(async () => { writing.resolve('unavailable'); await writing.promise })
    expect(result.current.storageUnavailable).toBe(true)
    expect(result.current.result).toEqual(measured)
    expect(onSaved).not.toHaveBeenCalled()
  })
})
