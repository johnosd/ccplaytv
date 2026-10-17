import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../catalog/db'
import type { RefreshScope } from './portalAgent'
import { refreshPortal } from './portalRuntime'
import { portalTables } from './portalTables'

/** Pausa do botão depois de apertado (FR-004); o agente aplica a mesma pausa por escopo como segunda barreira. */
export const REFRESH_PAUSE_MS = 10_000

export type RefreshStatus = 'idle' | 'loading' | 'done' | 'nothing' | 'wait' | 'offline' | 'failed'

/** `newSourceIds`: listas locais que passaram a existir com este Atualizar (só no escopo lists). */
export interface RefreshResult { ok: boolean; changed: boolean; newSourceIds: string[] }

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
  // O serviço assina um JWS novo a cada Atualizar (horário do servidor); "mudou" é situação/validade, não o texto.
  if (scope === 'license') return licenseFingerprint((await tables.license.get('entitlement'))?.jws ?? '')
  // 072: o backup "mudou" quando o serviço confirmou um novo (instante do último backup).
  if (scope === 'backup') return String((await db.table('portalDevice').get('backup'))?.lastBackupAt ?? '')
  // 077: a chave TMDB "mudou" quando o registro local trocou de revisão/estado (nunca compara nem guarda a chave).
  if (scope === 'tmdb') { const row = await db.integrations.get('tmdb'); return row ? row.revision + ':' + row.state : '' }
  const [sources, revisions] = await Promise.all([db.sources.toArray(), tables.revisions.toArray()])
  return JSON.stringify([
    sources.map(source => [source.id, source.updatedAt]).sort(),
    revisions.map(row => [row.sourceId, row.revision, row.tombstone ?? false]).sort(),
  ])
}

/** Claims públicas do JWS (só para comparar; quem confia na licença é o verificador). */
export function licenseFingerprint(jws: string): string {
  try {
    const claims: unknown = JSON.parse(atob((jws.split('.')[1] ?? '').replaceAll('-', '+').replaceAll('_', '/')))
    const { state, expiresAt } = (claims ?? {}) as Record<string, unknown>
    if (typeof state === 'string' && typeof expiresAt === 'number') return state + ':' + expiresAt
  } catch { /* JWS malformado: compara o texto. */ }
  return jws
}

const OFFLINE_CODES = new Set(['offline', 'network_error'])
const localSourceIds = async () => (await db.sources.toCollection().primaryKeys()) as string[]

/**
 * Estado de um botão Atualizar (feature 071, FR-003/FR-004): um aperto = uma chamada ao agente
 * (`refreshPortal(scope)`); nada roda por foco, montagem ou tempo.
 */
export function useRefreshAction(scope: RefreshScope, options: {
  fingerprint?: (scope: RefreshScope) => Promise<string>
  /** Ids das listas locais (para `newSourceIds`); injetável em teste, onde o Dexie não convive com timers falsos. */
  sourceIds?: () => Promise<string[]>
} = {}): RefreshAction {
  const fingerprint = options.fingerprint ?? refreshFingerprint
  const sourceIds = options.sourceIds ?? localSourceIds
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
    if (busy.current) return { ok: false, changed: false, newSourceIds: [] }
    if (timer.current) {
      // Ainda na pausa: explica e não consulta.
      setStatus('wait')
      return { ok: false, changed: false, newSourceIds: [] }
    }
    busy.current = true
    setStatus('loading'); setCode(undefined); setPaused(true)
    timer.current = setTimeout(() => { timer.current = undefined; if (mounted.current) setPaused(false) }, REFRESH_PAUSE_MS)
    try {
      const known = new Set(scope === 'lists' ? await sourceIds().catch(() => [] as string[]) : [])
      const before = await fingerprint(scope).catch(() => '')
      const outcome = await refreshPortal(scope)
      if (!mounted.current) return { ok: outcome.ok, changed: false, newSourceIds: [] }
      if (!outcome.ok) {
        const reason = outcome.code ?? 'sync_error'
        if (reason === 'wait') setStatus('wait')
        else if (OFFLINE_CODES.has(reason)) setStatus('offline')
        else { setStatus('failed'); setCode(reason) }
        return { ok: false, changed: false, newSourceIds: [] }
      }
      const after = await fingerprint(scope).catch(() => before)
      const changed = after !== before
      if (mounted.current) setStatus(changed ? 'done' : 'nothing')
      const newSourceIds = scope === 'lists'
        ? (await sourceIds().catch(() => [] as string[])).filter(id => !known.has(id)) : []
      return { ok: true, changed, newSourceIds }
    } finally { busy.current = false }
  }, [fingerprint, scope, sourceIds])

  return { status, code, paused, run }
}

/** Chave de texto do estado (o chamador usa `t`). `loading` e `idle` também têm texto/ausência definidos. */
export function refreshMessageKey(status: RefreshStatus, scope: RefreshScope) {
  switch (status) {
    case 'loading': return 'portal.refresh.loading' as const
    case 'done': return scope === 'license' ? 'portal.refresh.licenseDone' as const
      : scope === 'backup' ? 'portal.backup.done' as const
      : scope === 'tmdb' ? 'portal.refresh.tmdbDone' as const : 'portal.refresh.listsDone' as const
    case 'nothing': return scope === 'license' ? 'portal.refresh.licenseNothing' as const
      : scope === 'tmdb' ? 'portal.refresh.tmdbNothing' as const : 'portal.refresh.nothing' as const
    case 'wait': return 'portal.refresh.wait' as const
    case 'offline': return 'portal.refresh.offline' as const
    case 'failed': return 'portal.refresh.failed' as const
    default: return undefined
  }
}
