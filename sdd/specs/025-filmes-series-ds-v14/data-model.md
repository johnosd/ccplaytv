# Data Model: Filmes e Séries no DS V14 (feature 025)

Nenhuma tabela nova, nenhum índice novo, **nenhum bump de versão do Dexie**.
Todos os campos novos são de valor, sem índice (mesmo padrão de `iconUrl`,
feature 015, D-009 dela).

## 1. `CatalogRecord` (`tv-web/src/lib/catalog/db.ts`)

| Campo | Tipo | Quem grava | Significado |
|---|---|---|---|
| `year` | `number?` | `categoryLoader`/`importPipeline` (filme, série do provedor) | Ano declarado em campo próprio. Ausente = não declarado/ilegível/implausível, ou gravado antes da feature. |
| `addedAt` | `number?` (epoch ms) | idem (só filme) | Inclusão declarada (`added`). Nunca `last_modified`. |
| `durationSeconds` | `number?` | `seriesLoader` (só episódio do provedor) | Duração declarada; denominador da barra de progresso. |
| `iconUrl` (existente) | `string?` | agora também `seriesLoader` para episódio do provedor | Imagem do episódio (`info.movie_image`). |

Registros existentes ganham os campos na próxima leitura normal da categoria
(janela de frescor da 010) ou da série (janela da 012), ou numa
ressincronização. Sem migração forçada.

## 2. `ClassifiedEntry` (`classifier.ts`)

Mesmos três campos (`year`, `addedAt`, `durationSeconds`), preenchidos pelos
mapeadores do provedor (`logic/metadados-vod.md`). O caminho M3U não os
preenche.

## 3. Formas de tela (`catalogApi.ts`)

- `CatalogItemOut`: `year: number | null`, `added_at: number | null`
  (opcionais no tipo, como os demais campos de catálogo).
- `EpisodeOut`: `icon_url: string | null`, `duration_seconds: number | null`.

## 4. `UserStateRecord` — inalterado

O Histórico é uma leitura (`listPlayed`) dos registros com `lastWatched`,
pelo índice `lastWatched` que já existe (`getContinueWatching` o usa).
Filme: prefixo `<sourceId>|movie|`. Série: prefixo `<sourceId>|episode|`,
agregado por série em `loadHistory` (`logic/historico.md`).

## 5. `CategoryScreenSnapshot` (`features/catalog/categoryScreenSnapshot.ts`)

- `SnapshotTrailKey` e `SnapshotEntered` ganham `{ kind: 'history' }`.
- Novo campo opcional `focusedIndexHint?: number`: só dica de vizinho quando o
  card de origem não existe mais ao voltar (`logic/foco-vod.md` §4), nunca
  identidade.

## 6. Memória de sessão (`features/vod/vodSessionMemory.ts`, só em memória)

| Chave | Valor |
|---|---|
| `sourceId\|section\|entryKey` | último `focusedItemId` da entrada |
| `section` | `VodSortOption` escolhida |
| `sourceId\|section` | Histórico já aberto nesta sessão (habilita a contagem) |

Nunca vai para `localStorage` nem IndexedDB (FR-021, FR-032).

## 7. Registro de mocks (`tv-web/src/lib/comingSoon.ts`)

| id | message | backlogItem |
|---|---|---|
| `trailer` | "Trailer do filme ou da série." | 32 |
| `cast` | "Elenco e equipe técnica." | 45 |
| `similar` | "Títulos semelhantes a este." | 45 |
