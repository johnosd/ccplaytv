# Data Model: 015-capa-real-filmes-series

Campo novo no banco local `ccplaytv` (`tv-web/src/lib/catalog/db.ts`).
**Sem bump de versão** — `iconUrl` não é indexado, e Dexie só versiona
tabelas/índices declarados em `.stores()`, não o conjunto de campos que um
registro pode ter (confirmado: feature 010 já adicionou vários campos de
valor a `CatalogRecord`/`CategoryRecord` sem `this.version(N)` dedicado).

## 1. `CatalogRecord` — campo novo

| Campo | Tipo | Significado |
| --- | --- | --- |
| `iconUrl` | `string \| undefined` | URL de capa declarada pela fonte para um filme ou série. `undefined` = fonte não declarou (D-001). **Nunca existe em registro `kind: 'channel'`** (FR-009) nem em registro gravado antes desta feature (D-009). |

`StoredCatalogRecord` (`Omit<CatalogRecord, 'id'|'sourceId'|'generation'|'categoryId'>`)
herda `iconUrl` automaticamente — nenhuma mudança própria necessária.

## 2. Pipeline interno — mesmo campo, nomes por camada

| Camada | Tipo | Campo |
| --- | --- | --- |
| Parser M3U classificado | `ClassifiedEntry` (`classifier.ts`) | `iconUrl?: string` |
| Entrada mapeada (Xtream ou M3U) | `MappedChannel` (`xtreamConnector.ts`, `extends ClassifiedEntry`) | `iconUrl?: string` (herdado) |
| Registro do catálogo local | `CatalogRecord`/`StoredCatalogRecord` (`db.ts`) | `iconUrl?: string` |
| DTO de fronteira (tela) | `CatalogItemOut` (`catalogApi.ts`) | `icon_url?: string \| null` (convenção `snake_case` já usada neste tipo) |

## 3. Origem por caminho de importação (D-001/D-004)

| Caminho | Fonte do valor |
| --- | --- |
| Xtream, filme (`mapVodEntry`) | `raw.stream_icon` (resposta de `get_vod_streams`) |
| Xtream, série (`mapSeriesEntry`) | `raw.cover` (resposta de `get_series`) |
| Xtream, canal (`mapLiveEntry`) | Nunca lido (FR-009) |
| M3U, qualquer entrada classificada (`classifyEntry`) | `entry.attributes['tvg-logo']` |
| Série sintética M3U (`createSeriesGrouper`) | `iconUrl` do primeiro episódio que formou a série (D-003) — nunca um valor novo |

Um valor ausente, vazio, ou que `new URL(...)` rejeita é tratado como
`undefined` desde a captura, por uma função pura única —
`normalizeIconUrl` (`classifier.ts`, plan.md D-001b) — chamada pelas três
capturas (`classifyEntry`, `mapVodEntry`, `mapSeriesEntry`), nunca
reimplementada em cada uma. O valor nunca chega a `CatalogRecord` como
string inválida — `PosterArt` não precisa revalidar a URL de novo na
renderização além do que o próprio `new Image()`/`<img>` do navegador já
faz ao tentar carregar.

## 4. O que não muda

- `channels`: mesmos índices. `iconUrl` é só mais um campo de valor, como
  `streamExtension`/`providerCategoryId` já são.
- `categories`, `storedEntries`, `sources`, `userStates`: nada.
- Nenhuma tabela nova, nenhum índice novo, nenhum `.upgrade()`.
