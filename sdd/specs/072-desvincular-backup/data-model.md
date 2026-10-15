# Data Model — 072

## 1. TV (Dexie)

### `portalDevice` — ids novos (sem mudança de esquema; a tabela é chaveada por `id`)

| id | Campos | Ciclo de vida |
| --- | --- | --- |
| `relink` | `deviceId`, `displayId?`, `recoveryCode`, `recoveryCodeVersion`, `savedAt` | Criado pelo Desvincular; apagado ao concluir a reassociação. Nunca exportado/logado. |
| `backup` | `state: 'unknown' \| 'offered' \| 'settled'`, `lastBackupAt?`, `offer?: { createdAt, counts }` | Ausente = `unknown`. Desvincular grava `unknown`. |

`device` e `bootstrap` continuam como na 069. `unlinkPortal` apaga `device`, `bootstrap`, `licenseCache`
(`entitlement`) e `sourceUploads`; preserva o resto (plan D-003).

### `pendingRestore` — tabela nova, **v25** (`'sourceId, expiresAt'`)

`PendingRestoreRecord` (`lib/backup/usageBackupTypes.ts`): `sourceId`, `expiresAt` (restauração + 5 dias),
`userStates[]`, `categoryPreferences[]`, `listPin?`. Aplicado (e apagado) quando `sources` tiver o `sourceId`;
apagado quando `expiresAt` passou ou quando o backup é apagado.

### Dados de uso que entram no backup (já existem)

| Origem | Chave de mescla | Vence |
| --- | --- | --- |
| `userStates` (`UserStateRecord`) | `stableId` (já contém lista + tipo + id + episódio) | maior `updatedAt` |
| `categoryPreferences` | `sourceId + kind + matchKey` | maior `updatedAt` |
| `parentalPins` (`ParentalListPinRecord`) | `sourceId` | maior `createdAt` |
| `localStorage` (allowlist plan D-008) | chave | sempre o do backup na restauração (é a mesma pessoa) |
| `integrations/tmdb` | — | o do backup só se a TV não tiver chave |

## 2. Serviço (Firestore)

### `devices/{deviceId}/backups/current` — `UsageBackupDocument`

| Campo | Tipo | Observação |
| --- | --- | --- |
| `format` | int | 1 |
| `created_at` | datetime | instante do `PUT` (servidor) |
| `client_created_at` | datetime | `createdAt` do payload (TV) |
| `counts` | dict (`favorites`, `history`, `progress`, `categoryPreferences`, `listPins`) | inteiros ≥ 0 |
| `envelope` | `CipherEnvelope` | payload JSON inteiro (inclui `secrets`) |

Apagado por `DELETE` (TV/site) e pela retenção quando o aparelho é removido (`retention.py`).

### `devices/{deviceId}` — sem campo novo

A reassociação reutiliza `auth_epoch`, `recovery_code_hmac`, `recovery_code_version` e `identity_hmac` existentes.
