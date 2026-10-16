/** Controle da 069 no aparelho. Nunca incluir estas tabelas em snapshots/exportações. */
import type { Table } from 'dexie'
import type { CatalogDb } from '../catalog/db'

export interface PortalDeviceRecord {
  id: 'device'
  deviceId: string
  /** ID exibido `XX:XX:XX:XX:XX:XX` (feature 070, D-002); ausente em registros anteriores à 070 (upgrade D-004). */
  displayId?: string
  bearer: string
  deviceKey: string
  authEpoch: number
  recoveryEpoch: string
  /** Código privado: exibição somente por ação explícita, nunca em QR/URL. */
  recoveryCode: string
  recoveryCodeVersion: number
  /** 073/D-008: versão do código cuja cópia cifrada o serviço já aceitou (reenvia quando difere). */
  escrowedCodeVersion?: number
  nextSyncAt: number
  lastSuccessfulSync?: number
  syncRetry?: { attempt: number; dueAt: number }
}

/** Emissão pendente: persistir prova antes da rede e credenciais antes do ACK. */
export interface PortalBootstrapRecord {
  id: 'bootstrap'
  createdAt: number
  enrollmentNonce?: string
  recoveryRequest?: { nonce: string; startedAt: number }
  pendingRecovery?: { claimId: string; deviceId: string; token: string; claimSecret: string; expiresAt: number }
  pendingAck?: { operationId: string; authEpoch: number; createdAt: number; purpose?: 'revoke' | 'rotate' | 'recovery' }
  pendingRotation?: { operationId: string; claimSecret: string; purpose: 'revoke' | 'rotate';
    deviceId: string; authEpoch: number; startedAt: number }
}

export interface SourceRevisionRecord {
  sourceId: string
  revision: number
  importGenerationFloor?: number
  tombstone?: boolean
  deletedAt?: number
}

export interface PortalOperationRecord {
  operationId: string
  sourceId: string
  digest: string
  result: { state: 'applied' | 'conflict'; sourceId: string; revision: number }
  createdAt: number
}

export interface PendingImportRecord {
  sourceId: string
  configRevision: number
  operationId: string
  state: 'queued' | 'running' | 'completed' | 'error'
  acknowledgedState?: 'completed' | 'error'
  runId?: string
  owner?: string
  leaseUntil?: number
}

export interface PendingPortalDeleteRecord {
  deletionId: string
  sourceId: string
  revision: number
  createdAt: number
  serverAckAt?: number
}

export interface LicenseCacheRecord {
  id: 'entitlement'
  deviceId: string
  jws: string
  generation: number
  timeHighWatermark: number
  signedServerTime: number
  lastSuccessfulSync: number
  nextDueAt: number
}

/** 071/D-005: teste de 7 dias contado no aparelho; startedAt só diminui (âncora), highWatermark só sobe. */
export interface LocalTrialRecord {
  id: 'trial'
  startedAt: number
  highWatermark: number
  /** Quando o serviço confirmou o início (diagnóstico; não entra na decisão). */
  anchoredAt?: number
}

/** 071/D-010: última revisão da lista aceita pelo serviço. Sem credencial: só identidade e número. */
export interface SourceUploadRecord {
  sourceId: string
  uploadedRevision: number
}

export function portalTables(database: CatalogDb) {
  return {
    device: database.table('portalDevice') as Table<PortalDeviceRecord, 'device'>,
    // Duas chaves discriminadas na tabela; consultar get(id), nunca exportar/toArray.
    bootstrap: database.table('portalDevice') as Table<PortalBootstrapRecord, 'bootstrap'>,
    revisions: database.table('sourceRevisions') as Table<SourceRevisionRecord, string>,
    operations: database.table('portalOperations') as Table<PortalOperationRecord, string>,
    imports: database.table('pendingImportOutbox') as Table<PendingImportRecord, string>,
    deletes: database.table('pendingPortalDeletes') as Table<PendingPortalDeleteRecord, string>,
    license: database.table('licenseCache') as Table<LicenseCacheRecord, 'entitlement'>,
    localTrial: database.table('localTrial') as Table<LocalTrialRecord, 'trial'>,
    uploads: database.table('sourceUploads') as Table<SourceUploadRecord, string>,
  }
}
