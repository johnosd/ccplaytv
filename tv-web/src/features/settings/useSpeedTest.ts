import { useCallback, useEffect, useRef, useState } from 'react'
import { prefetchGate } from '../../lib/catalog/prefetch'
import type { ActivityGate } from '../../lib/catalog/prefetch/activityGate'
import { runConnectionTest } from '../../lib/network/connectionTest'
import type { SpeedTestError, SpeedTestOptions, SpeedTestOutcome, SpeedTestProgress, SpeedTestResult } from '../../lib/network/speedTest'
import { readLastSpeedTestResult, saveLastSpeedTestResult } from '../../lib/network/speedTestRepository'
import type { SpeedTestStorageCode } from '../../lib/network/storageFailure'

interface Options {
  run?: (options: SpeedTestOptions) => Promise<SpeedTestOutcome>
  read?: typeof readLastSpeedTestResult
  save?: typeof saveLastSpeedTestResult
  gate?: Pick<ActivityGate, 'blockReason' | 'subscribe'>
  onSaved?: () => void
}

/** Uma tentativa por superfície; o motor também protege concorrência global. */
export function useSpeedTest(options: Options = {}) {
  const run = options.run ?? runConnectionTest
  const read = options.read ?? readLastSpeedTestResult
  const save = options.save ?? saveLastSpeedTestResult
  const gate = options.gate ?? prefetchGate
  const onSaved = options.onSaved
  const [phase, setPhase] = useState<'ready' | 'running' | 'result' | 'error' | 'blocked'>('ready')
  const [lastResult, setLastResult] = useState<SpeedTestResult | null>(null)
  const [result, setResult] = useState<SpeedTestResult | null>(null)
  const [progress, setProgress] = useState<SpeedTestProgress>()
  const [error, setError] = useState<SpeedTestError>()
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [storageCode, setStorageCode] = useState<SpeedTestStorageCode>()
  const mounted = useRef(false)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const pending = useRef<Promise<void> | null>(null)
  const onUnavailable = useCallback((code: SpeedTestStorageCode) => {
    if (mounted.current) setStorageCode(code)
  }, [])

  const cancel = useCallback(async () => {
    generation.current += 1
    controller.current?.abort()
    await pending.current
    if (mounted.current) { setPhase('ready'); setProgress(undefined); setResult(null) }
  }, [])

  useEffect(() => {
    mounted.current = true
    void read({ onUnavailable }).then((last) => {
      if (mounted.current) setLastResult((current) => current ?? last)
    }).catch(() => { if (mounted.current) setStorageUnavailable(true) })
    const stop = () => { void cancel() }
    const visibility = () => { if (document.visibilityState === 'hidden') stop() }
    const unsubscribe = gate.subscribe(() => {
      const reason = gate.blockReason(Date.now(), 0)
      if (reason === 'playback' || reason === 'hidden') stop()
    })
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', stop)
    window.addEventListener('blur', stop)
    return () => {
      mounted.current = false
      generation.current += 1
      controller.current?.abort()
      unsubscribe()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', stop)
      window.removeEventListener('blur', stop)
    }
  }, [cancel, gate, onUnavailable, read])

  const start = useCallback(async () => {
    if (pending.current) return
    if (gate.blockReason(Date.now(), 0) === 'playback') {
      setError('playback_active'); setPhase('blocked'); return
    }
    if (document.visibilityState === 'hidden') return
    if (navigator.onLine === false) { setError('offline'); setPhase('error'); return }
    const id = ++generation.current
    const abort = new AbortController()
    controller.current = abort
    setResult(null); setProgress(undefined); setError(undefined); setPhase('running')
    const current = () => mounted.current && generation.current === id && !abort.signal.aborted
    const work = (async () => {
      try {
        const outcome = await run({ signal: abort.signal, onProgress: (value) => { if (current()) setProgress(value) } })
        if (!current()) return
        if (outcome.state === 'cancelled') { setPhase('ready'); return }
        if (outcome.state === 'failed') { setError(outcome.error); setPhase('error'); return }
        setResult(outcome.result)
        setPhase('result')
        // Compromisso serializado: repetir espera esta escrita terminar.
        const saved = await save(outcome, { onUnavailable })
        // Fechar após o compromisso não desfaz a gravação; atualizar sua consulta local.
        if (saved === 'written' && mounted.current) { setLastResult(outcome.result); onSaved?.() }
        if (!current()) return
        setStorageUnavailable(saved === 'unavailable')
        if (saved !== 'unavailable') setStorageCode(undefined)
      } catch {
        if (current()) { setError('destination_unavailable'); setPhase('error') }
      }
    })()
    pending.current = work
    await work
    if (pending.current === work) pending.current = null
  }, [gate, onSaved, onUnavailable, run, save])

  return { phase, lastResult, result, progress, error, storageUnavailable, storageCode, start, cancel }
}
