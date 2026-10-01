import { useSyncExternalStore } from 'react'
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
  const last = reports.slice(-6)
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
      {last.length === 0
        ? 'perf: entre numa categoria'
        : last
            .map(
              (r) =>
                `${r.kind} ${r.items ?? '?'}it ` +
                Object.entries(r.phases)
                  .map(([name, ms]) => `${name.slice(0, 5)}=${ms}`)
                  .join(' '),
            )
            .join('\n')}
    </div>
  )
}
