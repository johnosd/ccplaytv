# Contrato HTTP — mudanças da 071 (sobre 069 e 070)

| Rota | Mudança |
| --- | --- |
| `POST /portal/v1/devices/enroll` | Corpo aceita `trialStartedAt?: number` (ms; 422 se fora de `[agora−30 d, agora+60 s]`). Resposta inclui `trialStartedAt` (gravado, já com `min`). Idempotente por identidade: reinstalação devolve o início existente. |
| `POST /portal/v1/device/sources` (novo) | Bearer da TV. Corpo `{ sources: [{ sourceId, revision, input }…] }` com 1–10 itens. `input` = `{ type, displayName, m3uUrl? , providerDns?, providerUsername?, providerPassword?, epgManualUrl?, epgOffsetHours? }` (allowlist por tipo, mesma de `ConfigurationPatch`). Resposta `200 { results: [{ sourceId, state }] }`, `state ∈ stored | unchanged | conflict | gone | invalid`. `gone` = fonte com tombstone. Corpo nunca em log; `Cache-Control: no-store`. Respeita limite de payload (≤ 64 KiB). |
| `GET /portal/v1/device/operations` | Inalterada; chamada só pelo Atualizar de listas. |
| `PUT /portal/v1/device/snapshot` | Inalterada; chamada só pelo Atualizar de listas e após exclusão no ato. |
| `POST /portal/v1/device/entitlement/refresh` | Inalterada; chamada só por Atualizar de licença/bloqueio. |
| `POST /portal/v1/device/invites` | Deixa de ser usada pela TV para `purpose=manage`; recuperação (069) permanece. |
| `POST /portal/v1/sessions/manual` | Inalterada; passa a ser chamada pelo `portal-web` ao consumir `#id=&key=`. |

Erros usam os códigos existentes (`unauthorized`, `try_again`, `rate_limited` com `Retry-After`). Nenhuma resposta ecoa valores enviados.