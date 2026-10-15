/** Feature 072: formato do backup dos dados de uso (`data-model.md` §1). Só tipos — sem lógica. */
import type { UserStateRecord } from '../catalog/db'
import type { CategoryPreferenceRecord, ParentalListPinRecord } from '../catalog/parentalTables'

export interface UsageBackupCounts {
  favorites: number
  history: number
  progress: number
  categoryPreferences: number
  listPins: number
}

/** O que a TV envia e recebe. `secrets` só existe para ser cifrado no serviço e devolvido à mesma TV (FR-005/FR-015). */
export interface UsageBackupPayload {
  format: 1
  createdAt: number
  counts: UsageBackupCounts
  usage: {
    userStates: UserStateRecord[]
    categoryPreferences: CategoryPreferenceRecord[]
    listPins: ParentalListPinRecord[]
    /** Configurações do app (chave de armazenamento → valor). Nada de lista, credencial ou URL. */
    settings: Record<string, string>
  }
  secrets: { tmdb?: { key: string; format: 'v3' | 'v4' } }
}

/** Dados de uma lista ainda ausente na TV, aplicados quando ela voltar; descartados em `expiresAt` (FR-011). */
export interface PendingRestoreRecord {
  sourceId: string
  expiresAt: number
  userStates: UserStateRecord[]
  categoryPreferences: CategoryPreferenceRecord[]
  listPin?: ParentalListPinRecord
}

/**
 * Estado local do backup (`logic/backup.md` §1). `disabled`: a pessoa apagou o backup (TV ou site); nada sobe sozinho até
 * ela apertar "Fazer backup agora" (SC-006).
 */
export type BackupState = 'unknown' | 'offered' | 'settled' | 'disabled'

/** O que o serviço disse do backup desta TV; `unavailable` = não foi possível perguntar agora. */
export type RemoteBackupSummary = { exists: false } | { exists: true; createdAt: number; counts: UsageBackupCounts } | 'unavailable'

export type BackupAction = 'upload' | 'offer' | 'skip'
