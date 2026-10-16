import { useEffect, useState } from 'react'
import type { PortalDeviceRecord } from '../../lib/portal/portalTables'

/**
 * Olho do código de recuperação (ADR-019): começa oculto a cada abertura, alterna por SELECT sem modal nem prazo e
 * volta a ocultar em segundo plano, ao sair da aba (desmontar zera), ao regenerar (a versão muda) e quando o painel
 * sai do Avançado (`active` vira `false` — feature 076, D-005). O valor guardado é a versão do código revelado, então
 * um código novo nunca nasce visível.
 */
export function useCodeReveal(device?: PortalDeviceRecord, active = true) {
  const [shown, setShown] = useState<{ version: number }>()
  const revealed = active && !!device && shown?.version === device.recoveryCodeVersion
  useEffect(() => {
    const hide = () => setShown(undefined)
    const onVisibility = () => { if (document.visibilityState === 'hidden') hide() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', hide)
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', hide) }
  }, [])
  useEffect(() => { if (!active) setShown(undefined) }, [active])
  const toggle = () => { if (active && device) setShown(revealed ? undefined : { version: device.recoveryCodeVersion }) }
  return { revealed, toggle }
}
