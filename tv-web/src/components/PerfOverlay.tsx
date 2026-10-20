import { useEffect, useState, useSyncExternalStore } from 'react'
import { createActiveFrameTracker, type ActiveFrameStats } from '../lib/perf/activeFrames'
import { subscribeEntryReports, takeEntryReports, type EntryReport } from '../lib/perf/entryTiming'

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
    let previous = performance.now()
    let active = true
    let frame = 0
    const tick = (now: number) => {
      if (!active) return
      tracker.onFrame(now)
      if (now - previous > 100) {
        setSlowFrames((count) => count + 1)
        if (now - mountedAt > 15_000 && previous - lastKey > 2_000) setIdleSlowFrames((count) => count + 1)
      }
      previous = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { active = false; cancelAnimationFrame(frame); window.clearInterval(refresh); window.removeEventListener('keydown', onKey, true) }
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
