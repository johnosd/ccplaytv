# Contrato da API — 072

Todas as respostas: `Cache-Control: no-store`. Erros no formato existente (`{code, retryable}`), sem eco de valores.
Nenhum corpo é logado. Limites por `rate_limit` (padrão do serviço).

## TV (bearer da TV; `Origin` ausente ou `null`)

### `POST /portal/v1/devices/recovery/self` (sem bearer)

Corpo: `{ platformIdentity: string(1..512), nonce: token43, recoveryCode: string, mac?: string }`.

- 200 → `{ operationId, deviceId, displayId, bearer, deviceKey, authEpoch, recoveryEpoch, recoveryCode,
  recoveryCodeVersion, trialStartedAt }` (mesmo formato do `enroll`); a TV confirma com `/devices/recovery/ack`.
- Efeitos: mesmo `deviceId`/`display_id`; `auth_epoch + 1` (derruba sessões do painel e o QR antigo); chave nova;
  código novo (versão + 1); listas, licença, teste e backup intactos.
- 401 `invalid_credentials` uniforme (identidade sem registro, código errado, versão antiga).
- 429 `rate_limited`: 5/h por identidade, 20/h por IP, global igual ao `confirm` da 069.
- Repetição com o mesmo `nonce` dentro de 5 min devolve a mesma emissão (idempotente, como o `enroll`).

### `PUT /portal/v1/device/backup`

Corpo: `UsageBackupPayload` (`tv-web/src/lib/backup/usageBackupTypes.ts`), ≤ 512 KB. 200 → `{ createdAt, counts }`.
422 se maior, malformado ou `format` desconhecido. 20 req/h por TV.

### `GET /portal/v1/device/backup/summary`

200 → `{ exists: false }` ou `{ exists: true, createdAt, counts }`.

### `GET /portal/v1/device/backup`

200 → `UsageBackupPayload` (decifrado, inclui `secrets`). 404 se não existe.

### `DELETE /portal/v1/device/backup`

204 (idempotente).

## Painel (sessão da mesma TV)

### `GET /portal/v1/backup`

200 → `{ exists, createdAt?, counts? }`. Nunca payload, títulos, PIN ou chave.

### `DELETE /portal/v1/backup`

Mutação de navegador: `Origin` = origem pública + CSRF. 204.
