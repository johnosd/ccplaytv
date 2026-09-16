# Data Model: Importação de Fonte M3U por URL e por Provedor

Escopo: apenas as entidades que esta feature cria ou popula. Enriquecimento
(TMDB/IMDb), favoritos/histórico e opções de reprodução detalhadas ficam
para features futuras (ver Riscos e Decisões em `plan.md`, R-002).

## Source

Origem de conteúdo adicionada pela pessoa (FR-001, FR-002).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `type` | enum: `m3u_url`, `provider_credentials` | Imutável após criação. |
| `display_name` | string, obrigatório | Definido pelo usuário (FR-001/002; decisão da entrevista: sem geração automática). |
| `m3u_url` | string, nullable | Preenchido apenas quando `type = m3u_url`. |
| `provider_dns` | string, nullable | Endereço do servidor. Preenchido apenas quando `type = provider_credentials`. |
| `provider_username` | string, nullable | Idem. |
| `provider_password` | string (armazenamento protegido), nullable | Nunca retornado em respostas HTTP comuns (constitution: Segredos Fora dos Clientes e dos Logs). |
| `connection_state` | enum: `never_synced`, `synced`, `error` | Reflete o último `ImportJob` concluído. |
| `created_at` / `updated_at` | timestamp | — |
| `last_successful_sync_at` | timestamp, nullable | Atualizado apenas quando um `ImportJob` chega a `completed`/`completed_with_warnings`. |

**Invariantes**: exatamente um dos pares (`m3u_url`) ou
(`provider_dns`+`provider_username`+`provider_password`) é preenchido,
conforme `type`. `display_name` nunca vazio (FR-001/002).

## ImportJob

Trabalho de importação associado a uma `Source` (FR-004, FR-005, FR-010).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `source_id` | UUID (FK → Source) | — |
| `status` | enum: `queued`, `running`, `completed`, `completed_with_warnings`, `failed`, `cancelled` | FR-005. |
| `current_step` | enum: `acquiring`, `parsing`, `classifying`, `publishing`, `done` | Distinto de `status` (FR-005). |
| `entries_read` / `channels_count` / `movies_count` / `series_count` / `episodes_count` / `unclassified_count` / `invalid_count` | integer, default 0 | Contadores reais e distintos (FR-006). |
| `warnings` | lista de string sanitizada | Avisos por item inválido, nunca segredo (FR-013, FR-014). |
| `request_key` | string, único | Identifica a submissão de origem; usado para não duplicar job em reenvio de rede (FR-018). |
| `cancel_requested_at` | timestamp, nullable | Marca pedido de cancelamento antes da confirmação (FR-010). |
| `created_at` / `updated_at` / `finished_at` | timestamp | `finished_at` nulo enquanto `status` não é terminal. |

**Invariantes**: `status` só avança para `cancelled` depois que o processo
de importação reconhece `cancel_requested_at` (FR-010). Nenhum
`CatalogItem` de um lote incompleto no momento do cancelamento fica
associado como `published` (ver campo em `CatalogItem`).

## CatalogItem

Item resultante da importação, já classificado (FR-008, FR-011).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `source_id` | UUID (FK → Source) | Proveniência (ADR-005 §1). |
| `import_job_id` | UUID (FK → ImportJob) | Lote que publicou este item. |
| `kind` | enum: `channel`, `movie`, `series`, `episode`, `unclassified` | FR-008. |
| `parent_id` | UUID (FK → CatalogItem), nullable | Preenchido apenas quando `kind = episode`, aponta para o item `kind = series` correspondente. |
| `name` | string | Nome normalizado para exibição/busca. |
| `original_name` | string | Nome original da entrada, sem normalização (preservação de dados originais). |
| `original_group` | string, nullable | `group-title` original da fonte (ADR-005 §1 — nunca substituído por gênero externo). |
| `season_number` / `episode_number` | integer, nullable | Preenchidos apenas quando `kind = episode` e a evidência permitir. |
| `playback_url` | string, protegido | Ver nota de simplificação abaixo. |
| `published` | boolean | `false` para itens de um lote ainda incompleto ou de um job cancelado antes de publicar o lote (FR-011). |
| `created_at` / `updated_at` | timestamp | — |

**Nota de simplificação (registrada como risco em `plan.md`, R-002)**:
ADR-005 §2 propõe separar formalmente **obra**, **entrada da fonte** e
**opção de reprodução**. Esta feature ainda não lida com múltiplas fontes
para a mesma obra nem com reconciliação entre fontes (isso é o item 12 do
backlog, pós-MVP) — por isso `CatalogItem` incorpora `playback_url`
diretamente em vez de uma entidade `PlaybackOption` separada. Quando a
feature de múltiplas fontes/reconciliação for planejada, essa separação
deve ser revisitada.

**Invariantes**: `kind = episode` sempre tem `parent_id` apontando para um
`CatalogItem` com `kind = series`. Evidência insuficiente para qualquer
classificação → `kind = unclassified`, nunca inventada (constitution: IA e
Classificação Nunca Inventam Dados).
