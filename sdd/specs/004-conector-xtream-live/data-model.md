# Data Model — 004-conector-xtream-live

Nenhuma entidade nova. Duas existentes ganham campos, e há **uma migração
Alembic** — diferente da feature 003, que não precisou de nenhuma. Hoje
existe uma única migração no repositório
(`0d784ce0fa89_create_sources_import_jobs_catalog_items.py`).

## `Source` — o que o painel informou sobre a conta

| Campo | Para quê | Requisito |
| --- | --- | --- |
| formatos de reprodução permitidos | escolher o formato da URL de live em vez de assumir; guardar todos permite tentar outro no futuro (item 20) | FR-008, FR-009 |
| modo de importação | distinguir fonte lida pelo protocolo JSON de fonte lida em modo limitado, para a Home sinalizar | FR-010, FR-011 |
| marca de migração | saber se aquela fonte já foi reimportada pelo conector novo, para a migração acontecer **uma vez** | FR-012, FR-014 |

Campos que **já existem** e passam a ser preenchidos com mais precisão:

| Campo existente | Mudança |
| --- | --- |
| `connection_state` (`never_synced` / `synced` / `error`) | hoje só vira `synced` ao fim de uma publicação bem-sucedida, e **nunca** vira `error`. Passa a refletir também o resultado da consulta de estado da conta (FR-016). |
| `last_successful_sync_at` | continua marcando sucesso — e passa a ser o dado que a política de idade lê para decidir atualizar (FR-020). Uma atualização que falha **não** o avança (FR-023). |

`provider_dns`, `provider_username` e `provider_password` continuam onde
estão, com o mesmo tratamento: nunca serializados em resposta, nunca em log.
A base normalizada substitui o valor cru colado pelo usuário.

## `CatalogItem` — identidade que vem do provedor

| Campo | Para quê | Requisito |
| --- | --- | --- |
| identificador do provedor | chave estável do canal, independente de nome e de URL | FR-006 |
| referência à categoria do provedor | preservar o vínculo declarado, além do nome já guardado em `original_group` | FR-007 |

Ambos são opcionais: itens vindos do caminho M3U (modo limitado) não os têm,
e continuam válidos.

**Por que isso importa além desta feature**: a constitution exige que
favoritos, histórico e posição de retomada sejam chaveados por identidade
lógica estável — nunca pela URL. Hoje um canal de provedor só tem nome e URL.
Com o identificador do provedor gravado, a chave estável passa a existir, e
os itens 12, 13 e 25 do backlog têm em que se apoiar.

## Ciclo de publicação — o que muda no comportamento dos dados

As colunas `published` e `import_job_id` **já existem** em `catalog_items` e
hoje são subutilizadas: a importação grava `published=True` direto e nunca
remove o que veio antes. Daí o R-001 — resync duplica o catálogo.

O novo ciclo (D-002):

1. O job corrente grava seus itens com `published=False`.
2. O catálogo anterior segue publicado e servindo a TV — é o que a ADR-004 §6
   exige ("conservar a versão anterior utilizável enquanto a nova é
   preparada").
3. Ao concluir, uma transação publica os itens do job corrente e remove os
   dos jobs anteriores daquela fonte.
4. Se o job falhar ou for cancelado, os itens despublicados são descartados e
   **o catálogo anterior permanece intacto** (FR-013, FR-023).

Consequência de escala a resolver na implementação: a fonte real tem 311.367
entradas. A remoção do catálogo anterior não pode ser uma transação única de
centenas de milhares de linhas — precisa acompanhar a lógica de lotes que o
importador já usa.

## O que não muda

- `ImportJob` — as etapas, contadores e o cancelamento cooperativo por lote
  continuam como estão.
- `m3u_parser.py` e `classifier.py` — o caminho M3U é o fallback (FR-010);
  mexer nele arriscaria fontes que funcionam hoje.
- Nenhuma tabela nova. Séries e VOD, que exigiriam hierarquia própria, estão
  fora desta fatia (D-007).
