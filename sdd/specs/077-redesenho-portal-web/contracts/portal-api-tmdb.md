# Contrato de API — chave TMDB pelo portal (feature 077, US4)

Prefixo `/portal/v1`. Mesmas regras das demais rotas: JSON, `Cache-Control: no-store`, `Input` com `extra=forbid`, erros só com códigos já existentes (`invalid_input` 422, `rate_limited` 429, `try_again` 409…), **nenhum corpo, log ou erro contém a chave**. Navegador = cookie de sessão + `X-CSRF-Token` + `Idempotency-Key` (`op-<ms>-<43>`, mesma validação de `request_time`) nas mutações. TV = `Authorization: Bearer …` sem `Origin` (`tv_principal`).

## Navegador (sessão `manage` da própria TV)

| Método e rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /integrations/tmdb` | — | `200 { "pending": { "action": "set"\|"remove", "createdAt": ISO, "retryReason"?: "offline"\|"rate_limited" } \| null, "last": { "action", "result": "applied"\|"rejected", "reason"?: "refused"\|"invalid_format", "at": ISO } \| null, "tvReported": "none"\|"configured"\|null }` |
| `PUT /integrations/tmdb` | `{ "key": string }` (16–600 caracteres, só `[A-Za-z0-9._-]`; o formato real v3/v4 é validado pela TV) | `202 { "operationId", "action": "set", "state": "pending" }` — cifra a chave, substitui a pendente |
| `POST /integrations/tmdb/remove` | `{}` | `202 { "operationId", "action": "remove", "state": "pending" }` |
| `DELETE /integrations/tmdb/pending` | — | `204` — cancela a pendente (apaga o envelope); sem pendente = `204` também |

- `tvReported` vem do último snapshot da TV (`integrations.tmdb`); `null` = a TV ainda não informou.
- Limite: 10 mutações/hora por TV (`RateConstraint` com `digest("rate_limit", "tmdb/" + deviceId)`), recusa uniforme 429.
- Pendente com `expires_at` vencido ou `auth_epoch` diferente do principal é tratada como inexistente e o envelope é apagado.

## TV (bearer)

| Método e rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /device/integrations/tmdb` | — | `200 { "operation": { "operationId", "action": "set"\|"remove", "key"?: string } \| null }` — `key` só em `set`; limite **próprio** de 3 por 10 s por TV (`tmdb-pull/`), não o de `pull` das listas: o Atualizar faz os dois pedidos em sequência |
| `POST /device/integrations/tmdb/ack` | `{ "operationId", "state": "applied"\|"rejected"\|"retry", "reason"?: "refused"\|"invalid_format"\|"offline"\|"rate_limited" }` | `200 { "operationId", "state" }` |

- `applied`/`rejected`: grava `last_*`, apaga o envelope, `state` ≠ `pending`. `retry`: mantém `pending` e grava `retry_reason` (`offline`/`rate_limited`); o envelope fica.
- Ack de operação que não é mais a corrente (substituída/cancelada/expirada) devolve `200` sem efeito (idempotente), nunca erro que revele o estado.
- Reentrega: o `GET` devolve a mesma operação até o ack terminal; a TV é quem decide parar (ack `retry` não apaga nada).
- `POST …/ack` tem limite próprio de 20 por minuto por TV (`tmdb-ack/`). Ack `applied` com `reason`, `state` fora da lista ou campo extra = `422`.

## Snapshot (mudança retrocompatível)

`PUT /device/snapshot` aceita `integrations?: { tmdb: "none"\|"configured" }`; `GET /snapshot` devolve o campo quando presente.

## Fora do contrato

Nada devolve a chave ao navegador, nem para "editar": Substituir sempre envia uma nova. Backup continua guardando a chave cifrada, sem relação com este fluxo.
