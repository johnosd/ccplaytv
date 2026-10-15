/** Feature 072: decide o passo de backup do Atualizar sem nunca sobrescrever um backup ainda não decidido (`logic/backup.md` §2). */
import type { BackupAction, BackupState, RemoteBackupSummary } from './usageBackupTypes'

export function nextBackupAction({ state, remote }: { state: BackupState; remote?: RemoteBackupSummary }): BackupAction {
  if (state === 'settled') return 'upload'
  if (state === 'offered' || state === 'disabled') return 'skip'
  // `unknown`: TV recém-pareada/desvinculada. Sem saber se há backup, subir apagaria um que a pessoa quer restaurar.
  if (remote === undefined || remote === 'unavailable') return 'skip'
  return remote.exists ? 'offer' : 'upload'
}
