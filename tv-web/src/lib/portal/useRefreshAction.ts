import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../catalog/db'
import type { RefreshScope } from './portalAgent'
import { refreshPortal } from './portalRuntime'
import { portalTables } from './portalTables'

/** Pausa do botão depois de apertado (FR-004); o agente aplica a mesma pausa por escopo como segunda barreira. */
export const REFRESH_PAUSE_MS = 10_000

export type RefreshStatus = 'idle' | 'loading' | 'done' | 'nothing' | 'wait' | 'offline' | 'failed'

export interface RefreshResult { ok: boolean; changed: boolean }

export interface RefreshAction {
  status: RefreshStatus
  /** Código não secreto da falha (`PortalRequestError.code`), só com `status: 'failed'`. */
  code?: string
  /** Dentro da pausa: o botão fica "soft disabled" (focável) e apertar só mostra a espera. */
  paused: boolean
  run(): Promise<RefreshResult>
}

/**
 * Impressão digital do que o Atualizar pode mudar, para distinguir "atualizado" de "sem novidades" sem inventar
 * número: listas = ids/versões das listas locais + revisões do portal; licença = o JWS guardado.
 */
export async function refreshFingerprint(scope: RefreshScope): Promise<string> {
  const tables = portalTables(db)
  if (scope === 'license') return (await tables.license.get('entitlement'))?.jws ?? ''
  const [sources, revisions] = await Promise.all([db.sources.toArray(), tables.revisions.toArray()])
  return JSON.stringify([
    sources.map(source => [source.id, source.updatedAt]).sort(),
    revisions.map(row => [row.sourceId, row.revision, row.tombstone ?? false]).sort(),
  ])
}

const OFFLINE_CODES = new Set(['offline', 'network_error'])

/**
 * Estado de um botão Atualizar (feature 071, FR-003/FR-004): um aperto = uma chamada ao agente
 * (`refreshPortal(scope)`); nada roda por foco, montagem ou tempo.
 */
export function useRefreshAction(scope: RefreshScope, options: { fingerprint?: (scope: RefreshScope) => Promise<string> } = {}): RefreshAction {
  const fingerprint = options.fingerprint ?? refreshFingerprint
  const [status, setStatus] = useState<RefreshStatus>('idle')
  const [code, setCode] = useState<string>()
  const [paused, setPaused] = useState(false)
  const mounted = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const busy = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current) }
  }, [])

  const run = useCallback(async (): Promise<RefreshResult> => {
    if (busy.current) return { ok: false, changed: false }
    if (timer.current) {
      // Ainda na pausa: explica e não consulta.
      setStatus('wait')
      return { ok: false, changed: false }
    }
    busy.current = true
    setStatus('loading'); setCode(undefined); setPaused(true)
    timer.current = setTimeout(() => { timer.current = undefined; if (mounted.current) setPaused(false) }, REFRESH_PAUSE_MS)
    try {
      const before = await fingerprint(scope).catch(() => '')
      const outcome = await refreshPortal(scope)
      if (!mounted.current) return { ok: outcome.ok, changed: false }
      if (!outcome.ok) {
        const reason = outcome.code ?? 'sync_error'
        if (reason === 'wait') setStatus('wait')
        else if (OFFLINE_CODES.has(reason)) setStatus('offline')
        else { setStatus('failed'); setCode(reason) }
        return { ok: false, changed: false }
      }
      const after = await fingerprint(scope).catch(() => before)
      const changed = after !== before
      if (mounted.current) setStatus(changed ? 'done' : 'nothing')
      return { ok: true, changed }
    } finally { busy.current = false }
  }, [fingerprint, scope])

  return { status, code, paused, run }
}

/** Chave de texto do estado (o chamador usa `t`). `loading` e `idle` também têm texto/ausência definidos. */
export function refreshMessageKey(status: RefreshStatus, scope: RefreshScope) {
  switch (status) {
    case 'loading': return 'portal.refresh.loading' as const
    case 'done': return scope === 'license' ? 'portal.refresh.licenseDone' as const : 'portal.refresh.listsDone' as const
    case 'nothing': return 'portal.refresh.nothing' as const
    case 'wait': return 'portal.refresh.wait' as const
    case 'offline': return 'portal.refresh.offline' as const
    case 'failed': return 'portal.refresh.failed' as const
    default: return undefined
  }
}
