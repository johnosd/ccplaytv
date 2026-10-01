# Data Model: Live TV no DS V14 (feature 024)

Nenhuma tabela nova, nenhum índice novo, **nenhum bump de versão do Dexie**:
os campos novos são de valor comum, sem índice. É o mesmo padrão do
`iconUrl` na feature 015 (D-009 dela). Registro antigo simplesmente não os
tem.

## `CatalogRecord` (`tv-web/src/lib/catalog/db.ts`)

| Campo | Tipo | Muda | Regra |
|---|---|---|---|
| `iconUrl` | `string?` | **passa a valer também para `kind: 'channel'`** | M3U: `tvg-logo`; provedor: `stream_icon` de `get_live_streams`. Normalizado por `normalizeIconUrl`. Inverte o FR-009 da 015 (R-003). |
| `categoryPosition` | `number?` (novo) | gravado | Índice 0-based do item no array que `storeCategoryItems`/`storeStoredCategory` recebem, que é a ordem da fonte. Gravado para todo `kind` que passa por essas duas funções (simples e inofensivo); só a Live lê. |
| `sourceNumber` | `number?` (novo) | gravado **só se o R1 de `research.md` confirmar** | `num` de `get_live_streams`, inteiro positivo; qualquer outro valor vira `undefined`. |

`StoredCatalogRecord` (conteúdo guardado da 014) ganha o `iconUrl` de canal
pelo classificador. `categoryPosition` **não** entra nele: é atribuído na
leitura (`storeStoredCategory`), pela ordem dos blocos, que já é a ordem do
arquivo.

## `CatalogItemOut` (`tv-web/src/features/catalog/catalogApi.ts`)

Mapeados em `toItemOut`, o ponto único que Live, "Todos" e "★ Favoritos"
já usam:

| Campo | De |
|---|---|
| `icon_url` | `record.iconUrl ?? null` (já existia; agora vem preenchido para canal) |
| `category_id` | `record.categoryId ?? null` |
| `category_position` | `record.categoryPosition ?? null` |
| `source_number` | `record.sourceNumber ?? null` |

Os tipos já foram adicionados como stub pelo `sdd-plan`. O mapeamento é
tarefa do execute.

## `CatalogCategory`

Sem mudança. A contagem "conhecida" é derivada (`knownCategoryCount`,
`logic/numero-do-canal.md` §3), nunca gravada.

## Registro de mocks (`tv-web/src/lib/comingSoon.ts`)

| id | message | backlogItem |
|---|---|---|
| `epg-guide` | "Guia de programação completo dos canais." | 42 |

## Navegação (`tv-web/src/navigation/appNav.ts`)

Ação nova `{ type: 'switch-top'; screen: AppScreen }`: troca `screen`,
mantém `history` e `activeSource` (D-004).
