import { useEffect, useMemo, useRef } from 'react'
import { getPortalConnection } from '../../lib/portal/portalRuntime'
import { useRefreshAction } from '../../lib/portal/useRefreshAction'

/**
 * "Atualizar" da tela de listas (feature 071, FR-003/FR-006): busca no site as listas novas e envia a fila da TV.
 * Só existe com portal configurado e nada roda ao abrir ou focar — a consulta é o SELECT no botão. A lista que chega
 * depois do aperto é entregue a `onNewSource`, para o foco ir a ela por id (nunca por índice).
 */
export function useProfilesRefresh(sources: { id: string }[], onNewSource: (id: string) => void) {
  const portalAvailable = useMemo(() => {
    try { return !!getPortalConnection() } catch { return false }
  }, [])
  const refresh = useRefreshAction('lists')
  const idsBefore = useRef<Set<string> | null>(null)

  useEffect(() => {
    const known = idsBefore.current
    if (!known) return
    const fresh = sources.find((source) => !known.has(source.id))
    if (!fresh) return
    idsBefore.current = null
    onNewSource(fresh.id)
  }, [sources, onNewSource])

  async function run() {
    idsBefore.current = new Set(sources.map((source) => source.id))
    const result = await refresh.run()
    if (!result.ok || !result.changed) idsBefore.current = null
  }

  return { portalAvailable, refresh, run }
}
