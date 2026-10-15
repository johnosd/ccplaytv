import { liveQuery } from 'dexie'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PortalRequestError } from './portalClient'
import type { PortalConnection } from './portalConnection'
import { DEVICE_KEY_PATTERN } from './displayId'
import { buildFixedQrUrl } from './fixedQr'
import { portalTables, type PortalDeviceRecord } from './portalTables'

export function codeOf(error: unknown): string {
  return error instanceof PortalRequestError ? error.code : error instanceof Error ? error.name : 'unexpected_error'
}

/** Endereço exibido: o site do painel; em `dev:portal` o site roda separado da origem proxied da API. */
export function portalSite(connection: PortalConnection): string {
  const site = import.meta.env.VITE_PORTAL_SITE_URL as string | undefined
  try { return new URL(site || connection.origin).origin } catch { return new URL(connection.origin).origin }
}

export type PairingState = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * ID, chave e QR fixo do dispositivo para as telas que os exibem (Adicionar lista e bloqueio; feature 071,
 * D-004). Abrir a tela é a ação que cadastra o dispositivo (uma vez) e, para TV anterior à 070, faz o upgrade
 * D-004; depois disso nada consulta — o QR sai do registro local, sem requisição. Falha vira estado + código.
 */
export function usePairingCredentials(connection: PortalConnection | undefined, active = true) {
  const [device, setDevice] = useState<PortalDeviceRecord>()
  const [state, setState] = useState<PairingState>('idle')
  const [code, setCode] = useState<string>()
  const attempt = useRef(0)

  const ensure = useCallback(async () => {
    if (!connection) return
    const current = ++attempt.current
    setState('loading'); setCode(undefined)
    try {
      await connection.ensurePairing()
      if (current === attempt.current) setState('ready')
    } catch (error) {
      if (current === attempt.current) { setState('failed'); setCode(codeOf(error)) }
    }
  }, [connection])

  useEffect(() => {
    if (!connection || !active) return
    const subscription = liveQuery(() => portalTables(connection.database).device.get('device'))
      .subscribe({ next: setDevice, error: () => { setState('failed'); setCode('local_storage_error') } })
    void ensure()
    return () => { subscription.unsubscribe(); attempt.current++ }
  }, [connection, active, ensure])

  const site = connection ? portalSite(connection) : undefined
  const qrUrl = useMemo(() => {
    if (!site || !device?.displayId || !DEVICE_KEY_PATTERN.test(device.deviceKey)) return undefined
    try { return buildFixedQrUrl({ site, displayId: device.displayId, deviceKey: device.deviceKey }) } catch { return undefined }
  }, [site, device?.displayId, device?.deviceKey])

  return { device, site, qrUrl, state, code, retry: ensure }
}
