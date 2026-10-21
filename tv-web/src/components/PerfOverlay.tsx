import { useEffect, useState, useSyncExternalStore } from 'react'
import { createActiveFrameTracker, type ActiveFrameStats } from '../lib/perf/activeFrames'
import { subscribeEntryReports, takeEntryReports, type EntryReport } from '../lib/perf/entryTiming'
import { emitMetric } from '../lib/perf/metricsChannel'
import { probeBudget } from '../lib/catalog/storageBudget'

/**
 * Painel de medição da feature 038 (FR-012), só no build de medição
 * (`VITE_CCPLAY_PERF=1`) — a TV não entrega console. Mostra as últimas
 * entradas medidas, **só números** e a seção; nunca nome de categoria/item,
 * URL ou credencial. Não é focável e não intercepta tecla.
 */
let snapshot: EntryReport[] = []
function getSnapshot(): EntryReport[] {
  const all = takeEntryReports()
  if (all.length !== snapshot.length) snapshot = all
  return snapshot
}

export function PerfOverlay() {
  const reports = useSyncExternalStore(subscribeEntryReports, getSnapshot)
  const [slowFrames, setSlowFrames] = useState(0)
  // Feature 082 (SC-003): quadros lentos com o controle PARADO (sem tecla há 2 s, depois dos 15 s da abertura) isolam o
  // trabalho em segundo plano — pré-carga, conversão, guia — da navegação e das capas, que o total mistura.
  const [idleSlowFrames, setIdleSlowFrames] = useState(0)
  // Feature 083 (SC-006): fps, pior quadro e quadros > 50 ms medidos SÓ com tecla nos últimos 2 s (janela de 4 s).
  const [keyedFrames, setKeyedFrames] = useState<ActiveFrameStats | null>(null)
  useEffect(() => {
    const mountedAt = performance.now()
    let lastKey = mountedAt
    const tracker = createActiveFrameTracker()
    const onKey = () => { lastKey = performance.now(); tracker.onKey(lastKey) }
    const refresh = window.setInterval(() => setKeyedFrames(tracker.snapshot(performance.now())), 500)
    window.addEventListener('keydown', onKey, true)
    // Feature 085: a cada ~5 s os quadros lentos e a janela de tecla vão ao canal (no-op fora do build de medição).
    let slow = 0
    let idleSlow = 0
    // Feature 086 (FR-026): o pico de heap da sessão entra junto dos quadros; só existe no Chromium da TV.
    let peakHeap = 0
    const heapNow = (): number => {
      const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory
      return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : 0
    }
    const report = window.setInterval(() => {
      const keyed = tracker.snapshot(performance.now())
      peakHeap = Math.max(peakHeap, heapNow())
      emitMetric({ source: 'frames', slow, idleSlow, ...(keyed ? { fps: keyed.fps, worstMs: keyed.worstMs, over50: keyed.over50 } : {}),
        ...(peakHeap > 0 ? { heapMB: Math.round(peakHeap / 1048576), heapNowMB: Math.round(heapNow() / 1048576) } : {}) })
    }, 5_000)
    // Feature 085/082: o orçamento medido sem gravar nada, 3× (20 s, 80 s e 140 s depois de abrir), para ter as etapas
    // no app real. **Opt-in desde a feature 086 (T088)**: na TV estas três chamadas custaram 1,2–4,9 s cada e apareceram
    // disputando o aparelho com a abertura das telas — ou seja, a medição alterava o que estava medindo. Ligue com
    // `VITE_CCPLAY_BUDGET_PROBE=1` quando o alvo for o orçamento; para medir a montagem, deixe desligado.
    const budgetTimers = import.meta.env.VITE_CCPLAY_BUDGET_PROBE === '1'
      ? [20_000, 80_000, 140_000].map((delay) => window.setTimeout(() => { void probeBudget() }, delay))
      : []
    let previous = performance.now()
    let active = true
    let frame = 0
    const tick = (now: number) => {
      if (!active) return
      tracker.onFrame(now)
      if (now - previous > 100) {
        slow += 1
        setSlowFrames((count) => count + 1)
        if (now - mountedAt > 15_000 && previous - lastKey > 2_000) {
          idleSlow += 1
          setIdleSlowFrames((count) => count + 1)
        }
      }
      previous = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { active = false; cancelAnimationFrame(frame); window.clearInterval(refresh); window.clearInterval(report); budgetTimers.forEach((timer) => window.clearTimeout(timer)); window.removeEventListener('keydown', onKey, true) }
  }, [])
  const last = reports.slice(-6)
  // A entrada mais recente que já pintou a 1ª página (SC-002 é lido na TV a cada entrada).
  const firstPage = [...reports].reverse().find((report) => report.phases.firstPaint !== undefined)?.phases.firstPaint
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 99999,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        font: '18px/1.4 monospace',
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      {`quadros>100ms=${slowFrames} parado>100ms=${idleSlowFrames} primeiraPágina=${firstPage ?? '?'}ms\n` +
        `tecla: ${keyedFrames ? `${keyedFrames.fps}fps pior=${keyedFrames.worstMs}ms >50ms=${keyedFrames.over50}` : 'sem tecla'}\n` + (last.length === 0
        ? 'perf: entre numa categoria'
        : last
            .map(
              (r) =>
                `${r.kind} ${r.items ?? '?'}it ` +
                Object.entries(r.phases)
                  .map(([name, ms]) => `${name.slice(0, 5)}=${ms}`)
                  .join(' '),
            )
            .join('\n'))}
    </div>
  )
}
