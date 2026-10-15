/** Feature 072: chamadas de backup da TV (`contracts/portal-api-072.md`), sempre com o bearer desta TV. */
import type { PortalConnection } from '../portal/portalConnection'
import { PortalRequestError } from '../portal/portalClient'
import type { RemoteBackupSummary, UsageBackupCounts, UsageBackupPayload } from './usageBackupTypes'

function validCounts(value: unknown): value is UsageBackupCounts {
  if (!value || typeof value !== 'object') return false
  return ['favorites', 'history', 'progress', 'categoryPreferences', 'listPins']
    .every((key) => Number.isSafeInteger((value as Record<string, unknown>)[key]))
}

export function backupClient(connection: PortalConnection) {
  const bearer = async () => (await connection.ready()).bearer
  return {
    async summary(signal?: AbortSignal): Promise<RemoteBackupSummary> {
      const view = await connection.client.request<{ exists: boolean; createdAt?: number; counts?: unknown }>(
        '/portal/v1/device/backup/summary', { method: 'GET', bearer: await bearer(), signal })
      if (!view?.exists) return { exists: false }
      if (!Number.isSafeInteger(view.createdAt) || !validCounts(view.counts)) throw new PortalRequestError('service_unavailable')
      return { exists: true, createdAt: view.createdAt as number, counts: view.counts }
    },
    /** `expectExisting`: a TV já tinha backup; se a pessoa o apagou, o serviço responde `not_found` e não recria. */
    async put(payload: UsageBackupPayload, expectExisting: boolean, signal?: AbortSignal): Promise<{ createdAt: number; counts: UsageBackupCounts }> {
      const saved = await connection.client.request<{ createdAt: number; counts: unknown }>('/portal/v1/device/backup',
        { method: 'PUT', bearer: await bearer(), body: { ...payload, expectExisting }, signal })
      if (!Number.isSafeInteger(saved?.createdAt) || !validCounts(saved.counts)) throw new PortalRequestError('service_unavailable')
      return { createdAt: saved.createdAt, counts: saved.counts }
    },
    async get(signal?: AbortSignal): Promise<UsageBackupPayload> {
      const payload = await connection.client.request<UsageBackupPayload>('/portal/v1/device/backup',
        { method: 'GET', bearer: await bearer(), signal })
      if (payload?.format !== 1 || !payload.usage || !Array.isArray(payload.usage.userStates)) throw new PortalRequestError('service_unavailable')
      return payload
    },
    async remove(signal?: AbortSignal): Promise<void> {
      await connection.client.request('/portal/v1/device/backup', { method: 'DELETE', bearer: await bearer(), signal })
    },
  }
}
