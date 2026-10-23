# Modelo de dados — chave de legenda pelo portal (feature 091)

## 1. Serviço (Firestore): `devices/{device_id}/integrations/subtitles-{provider}`

Um documento por TV e por fornecedor (`opensubtitles`, `subdl`). Mesmo schema do `TmdbIntegrationDocument` (077), que
passa a ter o alias `KeyOperationDocument` — **nenhuma migração** do documento do TMDB.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `operation_id` | opaco | O `Idempotency-Key` do navegador. |
| `action` | `set \| remove` | |
| `state` | `pending \| applied \| rejected \| cancelled \| expired` | `cancelled` só pela classe-base (sem rota nesta feature). |
| `retry_reason` | `offline \| rate_limited \| null` | Só com `pending`. |
| `envelope` | envelope cifrado \| null | **Só** com `action='set'` e `state='pending'`; contexto `(device_id, "subtitle-key:"+provider, operation_id)`. |
| `auth_epoch`, `created_at`, `updated_at`, `expires_at` | | `expires_at = created_at + 7 dias`; época diferente do principal ⇒ morta. |
| `last_action`, `last_result`, `last_reason`, `last_at` | | Último resultado concluído; **nunca** a chave. |

Índices: nenhum novo (acesso sempre por caminho). Limitador: três escopos novos em `rateLimits/` (`subtitle-key`,
`subtitle-pull`, `subtitle-ack`).

## 2. Snapshot (`devices/{id}/snapshot/current`)

`integrations.subtitles` opcional: `{ opensubtitles, subdl }`, cada um `none | configured | rejected | rate_limited`.
Nunca valor, máscara, formato ou fim da chave.

## 3. TV (IndexedDB)

**Sem tabela nova e sem mudança de schema.** A chave aplicada vai para `subtitleCredentials` (feature 090, Dexie v27) pelo
caminho normal (`saveSubtitleKey`); fica fora do backup 072 e de `deleteSource`. A operação pendente **não** é guardada
na TV (vive no serviço até o ack).

## 4. Portal web

Nada persistido. O estado vem de `GET /integrations/subtitles`; a chave só existe no campo e no corpo do `PUT`; o
`operationId` pendente de reenvio vive em `useRef` (memória do componente), nunca em storage.
