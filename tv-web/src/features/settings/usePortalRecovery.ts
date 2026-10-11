import { useEffect } from 'react'
import type { PortalConnection } from '../../lib/portal/portalConnection'
/** Polling restrito à recuperação visível, serial e com prazo absoluto após standby. */
export function usePortalRecovery(connection: PortalConnection | undefined, active: boolean,
  onReady: () => void, onExpired: () => void) {
  useEffect(() => {
    if (!connection || !active) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let running: AbortController | undefined
    let dueAt = Date.now()
    let failures = 0
    let visible = document.visibilityState !== 'hidden'
    const clear = () => { if (timer) clearTimeout(timer); timer = undefined }
    function schedule() {
      clear()
      if (!stopped && visible && navigator.onLine && !running) timer = setTimeout(() => { void poll() }, Math.max(0, dueAt - Date.now()))
    }
    async function poll() {
      if (stopped || running || !visible || !navigator.onLine) return
      const controller = new AbortController()
      running = controller
      try {
        const state = await connection!.pollRecovery(controller.signal)
        if (controller.signal.aborted || stopped) return
        failures = 0
        if (state === 'ready') { stopped = true; onReady(); return }
        if (state === 'expired') { stopped = true; onExpired(); return }
        dueAt = Date.now() + 10000
      } catch {
        if (!controller.signal.aborted) { failures++; dueAt = Date.now() + Math.min(60000, 10000 * 2 ** Math.min(failures - 1, 3)) }
      } finally { running = undefined; schedule() }
    }
    const lifecycle = () => {
      visible = document.visibilityState !== 'hidden'
      if (!visible || !navigator.onLine) { clear(); running?.abort() }
      else schedule()
    }
    const hide = () => { visible = false; clear(); running?.abort() }
    document.addEventListener('visibilitychange', lifecycle)
    window.addEventListener('online', lifecycle)
    window.addEventListener('offline', lifecycle)
    window.addEventListener('pageshow', lifecycle)
    window.addEventListener('pagehide', hide)
    schedule()
    return () => { stopped = true; clear(); running?.abort(); document.removeEventListener('visibilitychange', lifecycle);
      window.removeEventListener('online', lifecycle); window.removeEventListener('offline', lifecycle);
      window.removeEventListener('pageshow', lifecycle); window.removeEventListener('pagehide', hide) }
  }, [connection, active, onReady, onExpired])
}
