import { LicenseGate } from './LicenseGate'
import { commercialBuild, licenseAuthority, licenseMonitor } from '../../lib/licensing/licenseRuntime'
import { createLicenseSync } from '../../lib/licensing/licenseSync'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { liveQuery } from 'dexie'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '../../lib/catalog/db'
import { getPortalConnection, portalQuickMode, subscribePortalQuick } from '../../lib/portal/portalRuntime'
import { portalTables } from '../../lib/portal/portalTables'
import { localImportSource } from '../../lib/portal/remoteImportOutbox'
import { createPortalSync } from '../../lib/portal/portalSync'
import { usePortalAgent } from '../../lib/portal/usePortalAgent'
import { PortalSyncConfirmation } from './PortalSyncConfirmation'

export function usePortalIntegration({ activeSourceId, leaveSource, sourceDeleted, catalogChanged, openPortal }: {
  activeSourceId?: string; leaveSource(sourceId?: string): void; sourceDeleted(id: string): void; catalogChanged(): void; openPortal(): void
}) {
  useEffect(() => commercialBuild ? licenseMonitor.start() : undefined, [])
  const queryClient = useQueryClient()
  const latest = useRef({ activeSourceId, leaveSource, sourceDeleted, catalogChanged })
  useEffect(() => { latest.current = { activeSourceId, leaveSource, sourceDeleted, catalogChanged } }, [activeSourceId, leaveSource, sourceDeleted, catalogChanged])
  const [connection] = useState(() => { try { return getPortalConnection() } catch { return undefined } })
  useEffect(() => { if (commercialBuild && connection) void connection.ready().catch(() => { /* Portal exibe tentativa explícita; cache vigente continua local. */ }) }, [connection])
  const quick = useSyncExternalStore(subscribePortalQuick, portalQuickMode, () => false)
  // Observar apenas identidade/epoch: escrita de deadline não remonta o agente.
  const [identity, setIdentity] = useState<string>()
  useEffect(() => {
    if (!connection) return
    const subscription = liveQuery(async () => {
      const device = await portalTables(db).device.get('device')
      return device ? device.deviceId + ':' + device.authEpoch + ':' + device.recoveryEpoch : undefined
    }).subscribe({ next: setIdentity, error: () => setIdentity(undefined) })
    return () => subscription.unsubscribe()
  }, [connection])
  const [decide, setDecide] = useState<{ complete(value: boolean): void }>()
  const pending = useRef<((value: boolean) => void) | undefined>(undefined)
  useEffect(() => () => { pending.current?.(false) }, [])
  const [ports] = useState(() => connection ? createPortalSync({
    database: db, connection, importSource: localImportSource(db),
    activeSourceId: () => latest.current.activeSourceId,
    confirmDestructive: (mutation, signal) => new Promise<boolean>(resolve => {
      if (signal.aborted) { resolve(false); return }
      pending.current?.(false)
      const complete = (value: boolean) => {
        signal.removeEventListener('abort', cancel)
        if (pending.current !== complete) return
        pending.current = undefined
        setDecide(undefined)
        // Desmontagem executa o gravador/close existentes antes do commit de configuração.
        if (value && latest.current.activeSourceId === mutation.sourceId) flushSync(() => latest.current.leaveSource())
        resolve(value)
      }
      const cancel = () => complete(false)
      pending.current = complete
      signal.addEventListener('abort', cancel, { once: true })
      setDecide({ complete })
    }),
    committed: async mutation => {
      if (mutation.action === 'delete') latest.current.sourceDeleted(mutation.sourceId)
      await Promise.all(['sources', 'catalog-items', 'catalog-counts', 'catalog-item', 'categories',
        'category-content', 'catalog-search-index', 'epg'].map(key => queryClient.invalidateQueries({ queryKey: [key] })))
      latest.current.catalogChanged()
    },
  }) : { flushDeletions: async () => {}, pull: async () => {}, publishSnapshot: async () => {} })
  const [agentPorts] = useState(() => ({ ...ports, refreshLicense: connection && commercialBuild
    ? createLicenseSync(db, connection, licenseAuthority) : undefined }))
  usePortalAgent(db, agentPorts, quick, !!connection && !!identity)
  return <><LicenseGate activeSourceId={activeSourceId} onStop={leaveSource} onPortal={openPortal} />{decide && <PortalSyncConfirmation onDecide={decide.complete} />}</>
}
