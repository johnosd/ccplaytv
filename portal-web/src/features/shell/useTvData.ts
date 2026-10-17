import { useCallback, useEffect, useRef, useState } from 'react'
import { api, PortalApiError, type Dashboard, type LicenseDevice, type Session } from '../api'

/** Intervalo único de leitura do portal (10 s, só com a aba visível) — substitui os timers de cada tela (D-003). */
const REFRESH_MS = 10000

/**
 * Leitura compartilhada do painel (listas, operações, snapshot) e do dispositivo/licença. A casca a monta **uma vez** e
 * as telas leem do contexto (`TvDataProvider`); nenhuma tela tem timer próprio. Falhas viram `PortalApiError` (código
 * não secreto). `refresh` serializa: uma leitura em andamento não dispara outra.
 */
export function useTvData(session: Session) {
  const [dashboard, setDashboard] = useState<Dashboard>()
  const [dashboardError, setDashboardError] = useState<PortalApiError>()
  const [device, setDevice] = useState<LicenseDevice>()
  const [deviceError, setDeviceError] = useState<PortalApiError>()
  const alive = useRef(true)
  const loading = useRef(false)
  const refresh = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    const fail = (caught: unknown) => caught instanceof PortalApiError ? caught : new PortalApiError('network')
    try {
      const [board, info] = await Promise.allSettled([api.dashboard(), api.licenseDevice()])
      if (!alive.current) return
      if (board.status === 'fulfilled') { setDashboard(board.value); setDashboardError(undefined) } else setDashboardError(fail(board.reason))
      if (info.status === 'fulfilled') {
        if (info.value.deviceId !== session.deviceId || !info.value.displayId) setDeviceError(new PortalApiError('invalid'))
        else { setDevice(info.value); setDeviceError(undefined) }
      } else setDeviceError(fail(info.reason))
    } finally { loading.current = false }
  }, [session.deviceId])
  useEffect(() => {
    alive.current = true
    void refresh()
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [refresh])
  return { dashboard, dashboardError, device, deviceError, refresh, setDashboardError }
}
export type TvData = ReturnType<typeof useTvData>
