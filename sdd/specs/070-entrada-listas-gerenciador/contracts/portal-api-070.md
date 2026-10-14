# Contrato HTTP — mudanças da 070 (sobre `069/contracts/portal-api.md`)

| Rota | Mudança |
| --- | --- |
| `POST /portal/v1/devices/enroll` | Corpo aceita `mac?: string` (opcional, já normalizado; o servidor revalida). Resposta inclui `displayId` e `deviceKey` de 10 dígitos. Origem `null`/ausente, como hoje. |
| `POST /portal/v1/device/revoke` (rotação) | Credenciais emitidas incluem `displayId` (inalterado) e nova `deviceKey` de 10 dígitos. Executa o upgrade D-004 para registros antigos (cria `display_id`/claim se faltar). |
| `POST /portal/v1/sessions/manual` | Corpo `{ displayId, deviceKey }` (em vez de `deviceId` opaco). Formato inválido, ID inexistente, chave errada ou TV revogada → `401 invalid_credentials` idêntico; limite → `429` com `Retry-After`. Mesma origem/CSRF/cookie da 069. |
| `GET /portal/v1/session/device` | Resposta inclui `displayId` e o estado da licença (`state`, `expiresAt`) para o cabeçalho do painel. |
| `GET /portal/v1/configurations/{sourceId}/values` (novo) | Sessão `manage` da mesma TV. Resposta: `{ type, displayName, m3uUrl? , providerDns?, providerUsername?, providerPassword?, epgManualUrl? }` da versão corrente. Fonte excluída/tombstone/inexistente/de outra TV → `404 not_found`. `Cache-Control: no-store`. Nunca em log. |

Inalterados: convite QR (`/device/invites`, efêmero, uso único, sem chave), operações/ACK/exclusão bidirecional, licença e pagamento.
