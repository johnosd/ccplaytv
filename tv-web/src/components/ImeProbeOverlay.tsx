import { useEffect, useSyncExternalStore } from 'react'
import { formatImeProbeEntry, getImeProbeEntries, startImeProbe, subscribeImeProbe } from '../lib/imeProbe'

/**
 * Painel da sonda do IME (feature 045, T001), só com `VITE_CCPLAY_IME_PROBE=1`.
 * Mostra os últimos eventos de teclado/foco — **nunca o valor de um campo**.
 * Não é focável e não intercepta tecla.
 */
export function ImeProbeOverlay() {
  useEffect(() => startImeProbe(), [])
  const entries = useSyncExternalStore(subscribeImeProbe, getImeProbeEntries)
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 99999,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        font: '16px/1.35 monospace',
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      {entries.length === 0 ? 'ime: aperte uma tecla' : entries.map(formatImeProbeEntry).join('\n')}
    </div>
  )
}
