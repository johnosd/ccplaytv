# Data Model — 070

## Portal (Firestore)

### `devices/{deviceId}` (alterado)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `display_id` | str `^[0-9A-F]{2}(:[0-9A-F]{2}){5}$` | Novo. Fixado no cadastro (D-002). Opcional só para documentos anteriores à 070 até o upgrade (D-004). |
| `display_id_source` | `"mac" \| "generated"` | Novo. Diagnóstico; nunca exibido como dado do aparelho. |
| `device_key_hash` | Digest | Mantido; passa a ser HMAC de uma chave `^\d{10}$` (D-003). |

**Atualização (ADR-015):** `display_id_source` ganha `"derived"` (ID derivado da identidade, usado em todas as atribuições novas sem MAC útil); `"generated"` só existe em registros antigos, preservados. `display_id` é imutável depois de gravado — o repositório recusa troca ou remoção.

### `displayIdClaims/{hmac(display_id)}` (novo)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `device_id` | OpaqueId | Dono exclusivo. Criado na mesma transação do cadastro/upgrade; colisão → servidor gera outro ID. |
| `created_at` | datetime | — |

Retenção: segue o documento do dispositivo (removido junto em exclusão/retenção da 069). O `display_id` não é segredo, mas não vai a logs junto de IP.

### Rate limit (reuso de `rateLimits`)

Escopos da sessão manual passam a usar `hmac(display_id)`: par (display_id+IP) 5/15 min, dispositivo 25/15 min, IP 25/15 min, global 100/15 min, com bloqueio até o fim da janela.

## TV (IndexedDB `portalDevice`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `displayId` | string | Novo, validado por `DISPLAY_ID_PATTERN` antes de persistir. |
| `deviceKey` | string | Passa a exigir `^\d{10}$`; registros antigos (43 caracteres) disparam o upgrade D-004 e continuam válidos até ele concluir. |

## Leitura de valores para edição na TV

`db.sources` já guarda `m3uUrl`, `providerDns`, `providerUsername`, `providerPassword`. A edição lê por um acessor em `lib/catalog/sourceRepository.ts` (sem tabela nova), consumido por um hook em `features/import`.
