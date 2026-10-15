# Data Model — 071

## TV (IndexedDB, Dexie)

> Reler a versão livre do schema (`dbSchema`/`registerLateCatalogSchemas`) antes de migrar. Acessores tipados; nada disso entra em exportação/backup.

### `localTrial` (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `'trial'` | Registro único. |
| `startedAt` | number (ms) | Gravado na 1ª abertura do build comercial; nunca avança; reconciliado com a âncora por `reconcileTrialStart` (só diminui). |
| `highWatermark` | number (ms) | Maior instante observado; sobe em checkpoints (≥ 30 s) e ao ocultar; nunca diminui. |
| `anchoredAt` | number? | Quando o serviço confirmou o início (diagnóstico; não usado na decisão). |

### `sourceUploads` (nova)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `sourceId` | string (chave) | Mesma identidade lógica da lista local. |
| `uploadedRevision` | number | Última revisão aceita pelo serviço (`stored`/`unchanged`). |

A decisão do que subir sai de `planSourceUploads({ sources, uploaded })` (contrato C5). Revisão local = contador existente de `sourceRevisions`.

### Tabelas existentes alteradas

- `portalDevice.nextSyncAt`/`syncRetry`: deixam de ser lidos (ficam por compatibilidade; remoção em migração futura).
- `portalDevice.deviceKey`: continua guardada em claro no IndexedDB (já hoje); **agora também** serve ao QR fixo e à tela de bloqueio.

## Serviço (Firestore)

### `devices/{deviceId}` (alterado no cadastro)

| Campo | Mudança |
| --- | --- |
| `trial_started_at` / `trial_expires_at` | Passam a ser gravados **no cadastro** com `min(created_at, trialStartedAt do cliente)`; continuam imutáveis. |

### `devices/{deviceId}/configurations/{sourceId}` (origem TV)

Mesmo documento cifrado da 069. Para itens vindos da TV: `applied_revision = revision` enviado, `active_operation_id = null`, nenhuma `operations/*` criada, `pending_operation_count` inalterado.

## Retenção

Credenciais enviadas seguem a retenção da configuração corrente (069 D-008): enquanto a lista existir; exclusão elimina ciphertext e versões e grava tombstone.