# Contrato de API — chave de legenda pelo portal (feature 091)

Prefixo `/portal/v1`. Mesmas regras das demais rotas (e do contrato da chave TMDB, `sdd/specs/077-redesenho-portal-web/contracts/portal-api-tmdb.md`):
JSON, `Cache-Control: no-store`, `Input` com `extra=forbid`, erros só com códigos já existentes (`invalid_input` 422,
`rate_limited` 429, `try_again` 409…), **nenhum corpo, log ou erro** contém a chave. `provider` ∈ `opensubtitles | subdl`.

## Navegador (sessão `manage` da própria TV)

| Método e rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /integrations/subtitles` | — | `200 { "opensubtitles": V, "subdl": V }` |
| `PUT /integrations/subtitles/{provider}` | `{ "key": string }` (8–200 caracteres, só `[A-Za-z0-9._-]`) | `202 { "operationId", "provider", "action": "set", "state": "pending" }` — cifra a chave, substitui a pendente **daquele fornecedor** |
| `POST /integrations/subtitles/{provider}/remove` | `{}` | `202 { "operationId", "provider", "action": "remove", "state": "pending" }` |

`V = { "pending": { "action": "set"|"remove", "createdAt": ISO, "retryReason"?: "offline"|"rate_limited" } | null,
"last": { "action", "result": "applied"|"rejected", "reason"?: "refused"|"invalid_format", "at": ISO } | null,
"tvReported": "none"|"configured"|"rejected"|"rate_limited"|null }`.

- `Idempotency-Key` obrigatório nas mutações (formato da 077); repetir o mesmo não duplica.
- `provider` fora da lista ⇒ `422 invalid_input`. Corpo extra ou chave fora do formato ⇒ `422`.
- Limite: 10 mutações/hora por TV, **os dois fornecedores somados** (`subtitle-key`), recusa uniforme 429.
- Pendente com `expires_at` vencido ou `auth_epoch` diferente do principal é tratada como inexistente e o envelope é apagado.
- Não existe `DELETE …/pending` nesta feature.

## TV (bearer)

| Método e rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /device/integrations/subtitles` | — | `200 { "operations": [ { "provider", "operationId", "action": "set"\|"remove", "key"?: string } ] }` — `key` só em `set`; no máximo uma por fornecedor; ordem `opensubtitles`, `subdl` |
| `POST /device/integrations/subtitles/ack` | `{ "provider", "operationId", "state": "applied"\|"rejected"\|"retry", "reason"?: "refused"\|"invalid_format"\|"offline"\|"rate_limited" }` | `200 { "operationId", "state" }` |

- Limites próprios por TV: pull 3 por 10 s (`subtitle-pull`); ack 20 por minuto (`subtitle-ack`).
- `applied`/`rejected`: grava `last_*`, apaga o envelope, `state` ≠ `pending`. `retry`: mantém `pending` e grava
  `retry_reason` (`offline`/`rate_limited`); o envelope fica. `applied` com `reason`, `state` fora da lista ou campo
  extra ⇒ `422`.
- Ack de operação que não é a corrente, ou de **outro fornecedor**, devolve `200` sem efeito (idempotente), nunca erro
  que revele o estado.
- Reentrega: o `GET` devolve a mesma operação até o ack terminal; a TV decide parar.

## Snapshot (mudança retrocompatível)

`PUT /device/snapshot` aceita `integrations.subtitles?: { "opensubtitles": S, "subdl": S }`, com
`S ∈ none|configured|rejected|rate_limited`; `integrations.tmdb` continua obrigatório. `GET /snapshot` devolve o campo
quando presente. TV antiga não manda `subtitles` ⇒ `tvReported: null` ⇒ o portal mostra "Estado desconhecido".

## Fora do contrato

Nada devolve a chave ao navegador, nem para "editar": Substituir sempre envia uma nova. O backup (072) não guarda a chave de legenda.
