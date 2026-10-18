import { useEffect, useState, useSyncExternalStore } from 'react'
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
  useEffect(() => {
    let previous = performance.now()
    let active = true
    let frame = 0
    const tick = (now: number) => {
      if (!active) return
      if (now - previous > 100) setSlowFrames((count) => count + 1)
      previous = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { active = false; cancelAnimationFrame(frame) }
  }, [])
  const last = reports.slice(-6)
  const firstPage = reports.find((report) => report.phases.firstPaint !== undefined)?.phases.firstPaint
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
      {`quadros>100ms=${slowFrames} primeiraPágina=${firstPage ?? '?'}ms\n` + (last.length === 0
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
