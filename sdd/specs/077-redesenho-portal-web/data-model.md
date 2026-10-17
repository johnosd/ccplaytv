# Data Model — 077 Redesenho do portal web

Só o que é novo ou muda. O resto (dispositivo, configurações de lista, operações de lista, backup, licença) segue como está.

## 1. `devices/{deviceId}/integrations/tmdb` — `TmdbIntegrationDocument` (novo, serviço)

Um documento por TV (só o estado corrente), mesma família de `backups/current`. A chave pendente é a única coisa secreta.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `operation_id` | `OpaqueId` | id da operação corrente (a do `Idempotency-Key` do navegador) |
| `action` | `'set' \| 'remove'` | operação corrente |
| `state` | `'pending' \| 'applied' \| 'rejected' \| 'cancelled' \| 'expired'` | `pending` até a TV confirmar; `cancelled` (portal) e `expired` (7 dias, outra época ou envelope ilegível) encerram a operação sem resultado e apagam o envelope |
| `retry_reason` | `'offline' \| 'rate_limited' \| None` | só com `pending`: a TV tentou e não conseguiu |
| `envelope` | `CipherEnvelope \| None` | **só** com `action='set'` e `state='pending'`; contexto `CipherContext(device_id, "tmdb-key", operation_id)`; apagado ao aplicar, recusar, cancelar, expirar ou trocar a chave de acesso |
| `auth_epoch` | `Revision` | época de autenticação da TV na criação; operação de outra época é descartada |
| `created_at` / `updated_at` / `expires_at` | `AwareDatetime` | `expires_at = created_at + 7 dias` (só `pending`), como as operações de lista |
| `last_action` / `last_result` / `last_reason` / `last_at` | `set\|remove` / `applied\|rejected` / `refused\|invalid_format\|None` / data | último resultado concluído pela TV; sobrevive à próxima operação |

Regras:
- **Uma** pendente por TV: um novo `PUT`/`POST remove` substitui a anterior (apaga o envelope antigo na mesma transação) e mantém `last_*`.
- O **valor da chave nunca** aparece em `last_*`, log, erro, resposta do navegador ou índice; contagem/tamanho também não.
- `rejected`/`applied` preenchem `last_*`, zeram `envelope` e `retry_reason`.
- A coleção `integrations` entra na lista de coleções permitidas do repositório de controle (`repositories/control.py`) e na retenção (apagada junto com o aparelho, como `backups`).

## 2. `SnapshotDocument.integrations` (novo campo opcional, serviço + TV)

`integrations: { tmdb: 'none' | 'configured' } | None`. A TV o preenche ao publicar o snapshot do Atualizar de listas (`getTmdbStatus`: há chave guardada?). Ausente (TV antiga) = desconhecido. Entra no `SnapshotInput` como opcional (retrocompatível) e é devolvido no `GET /snapshot` do navegador. **Nunca** contém o valor, o formato nem o fim da chave.

## 3. Estado exibido no portal (derivado, não persistido)

`TmdbServiceState = { pending?, last?, tvReported? }` → `resolveTmdbView` (`logic/tmdb-estado.md`). O navegador monta o estado de `GET /integrations/tmdb` (que já devolve `tvReported` copiado do snapshot) e só guarda em memória.

## 4. ID lembrado (novo, navegador)

`localStorage["ccplay-portal-last-device"]` = `XX:XX:XX:XX:XX:XX` (maiúsculas). Só o ID, só após entrada bem-sucedida (manual ou QR); nada de chave, sessão ou CSRF. Limpo por "Usar outra TV". Indisponível ⇒ funciona sem lembrar. A sessão continua em `sessionStorage` (`ccplay-portal-session`), sem mudança.

## 5. Sem mudança

`ConfigurationDocument`, `OperationDocument` (listas), `UsageBackupDocument`, `LicenseDevice`, pedidos de pagamento. O backup continua com um documento por TV; "excluir backups" é `DELETE /portal/v1/backup`.
