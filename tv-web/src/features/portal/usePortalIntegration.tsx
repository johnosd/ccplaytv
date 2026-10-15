import { LicenseGate } from './LicenseGate'
import { commercialBuild, licenseAuthority, licenseMonitor } from '../../lib/licensing/licenseRuntime'
import { createLicenseSync } from '../../lib/licensing/licenseSync'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '../../lib/catalog/db'
import { getPortalConnection } from '../../lib/portal/portalRuntime'
import { localImportSource } from '../../lib/portal/remoteImportOutbox'
import { createPortalSync } from '../../lib/portal/portalSync'
import { usePortalAgent } from '../../lib/portal/usePortalAgent'
import { runBackupStep } from '../../lib/backup/backupStep'
import { PortalSyncConfirmation } from './PortalSyncConfirmation'
import { RestoreOffer } from './RestoreOffer'

export function usePortalIntegration({ activeSourceId, leaveSource, sourceDeleted, catalogChanged, resumeEntry }: {
  activeSourceId?: string; leaveSource(sourceId?: string): void; sourceDeleted(id: string): void; catalogChanged(): void
  /** Retoma a entrada negada quando o Atualizar da tela de bloqueio libera a licença (071/FR-007). */
  resumeEntry(sourceId: string): void
}) {
  useEffect(() => commercialBuild ? licenseMonitor.start() : undefined, [])
  const queryClient = useQueryClient()
  const latest = useRef({ activeSourceId, leaveSource, sourceDeleted, catalogChanged })
  useEffect(() => { latest.current = { activeSourceId, leaveSource, sourceDeleted, catalogChanged } }, [activeSourceId, leaveSource, sourceDeleted, catalogChanged])
  const [connection] = useState(() => { try { return getPortalConnection() } catch { return undefined } })
  // 071/D-004: o cadastro do dispositivo NÃO roda no mount. Acontece quando uma tela precisa de ID/chave
  // (Adicionar lista, bloqueio, Portal & licença), no Atualizar ou no primeiro envio de lista.
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
    ? createLicenseSync(db, connection, licenseAuthority) : undefined,
    // 072: passo de backup de uso no fim do Atualizar de listas e no botão Fazer backup agora.
    backup: connection ? async (signal: AbortSignal) => { await runBackupStep(db, connection, { signal }) } : undefined }))
  usePortalAgent(db, agentPorts, !!connection)
  return <><LicenseGate activeSourceId={activeSourceId} onStop={leaveSource} onResume={resumeEntry} connection={connection} />{decide && <PortalSyncConfirmation onDecide={decide.complete} />}
    {connection && <RestoreOffer connection={connection} />}</>
}
