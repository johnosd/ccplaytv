/**
 * Cópia cifrada do código de recuperação no serviço (feature 073, US3, D-008, constitution 1.13.0 (i)). A TV envia o
 * código que já guarda, só no corpo HTTPS, quando a versão enviada ainda não é a atual — e só dentro de uma ação da
 * pessoa (Atualizar). O serviço confere o HMAC antes de guardar; o portal o mostra por ação explícita.
 * Falha não marca como enviado: o próximo Atualizar tenta de novo.
 */
import type { CatalogDb } from '../catalog/db'
import { portalTables } from './portalTables'

export type EscrowOutcome = 'sent' | 'skipped'

export interface EscrowTransport {
  request<T>(path: string, init: { bearer?: string; body?: unknown; signal?: AbortSignal; method?: 'GET' | 'POST' | 'PUT' | 'DELETE' }): Promise<T>
}

export async function escrowRecoveryCode(database: CatalogDb, transport: EscrowTransport, signal?: AbortSignal): Promise<EscrowOutcome> {
  const table = portalTables(database).device
  const device = await table.get('device')
  if (!device || !device.recoveryCode || device.escrowedCodeVersion === device.recoveryCodeVersion) return 'skipped'
  const { deviceId, recoveryCode, recoveryCodeVersion } = device
  await transport.request('/portal/v1/device/recovery-code/escrow', {
    method: 'PUT', bearer: device.bearer, body: { recoveryCode, recoveryCodeVersion }, signal,
  })
  // Só marca se o registro ainda é o mesmo (uma rotação no meio do envio deixa a versão nova para o próximo Atualizar).
  await database.transaction('rw', table, async () => {
    const current = await table.get('device')
    if (current && current.deviceId === deviceId && current.recoveryCodeVersion === recoveryCodeVersion) {
      await table.put({ ...current, escrowedCodeVersion: recoveryCodeVersion })
    }
  })
  return 'sent'
}
