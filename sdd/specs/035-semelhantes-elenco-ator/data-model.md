# Data Model — 035 Semelhantes, fotos do elenco e página de ator

Tudo fica no IndexedDB do aparelho (Dexie, `tv-web/src/lib/catalog/db.ts`).
Nenhum dado desta feature carrega chave, URL com chave ou credencial do
provedor. Imagens (`image.tmdb.org`) são montadas **sem** chave.

## 1. Campos novos em `TitleFields` (só no lado TMDB de `titleMetadata`)

Tipos já criados pelo `sdd-plan` em `db.ts` (stubs de tipo):

```ts
interface TmdbTitleRef {
  tmdbId: number
  kind: 'movie' | 'series'        // 'tv' do TMDB vira 'series'
  title: string                   // `title` (filme) | `name` (série), pt-BR
  originalTitle?: string          // `original_title` | `original_name`
  year?: number                   // de `release_date` | `first_air_date`
  posterUrl?: string              // tmdbImageUrl(poster_path, 'w342')
  overview?: string               // `overview` com trim, só se não vazio
}

interface CastPerson {
  personId: number                // `id` da pessoa no TMDB
  name: string
  character?: string              // filme: `character`; série: papel com mais episódios em `roles[]`
  photoUrl?: string               // tmdbImageUrl(profile_path, 'w185')
}

interface TitleFields {
  similar?: TmdbTitleRef[]        // até 20; `[]` = pedido e nada veio; AUSENTE = registro anterior à 035
  castPeople?: CastPerson[]       // até 20, na ordem `order` do TMDB
  // ...campos da 032/033 inalterados
}
```

- **Sem bump do Dexie**: são valores dentro de `titleMetadata.tmdb.fields`,
  sem índice (mesmo padrão de `trailerVideos`, feature 033).
- `similar`/`castPeople` **nunca** vêm do provedor; `mergeTitleMetadata` só
  os lê de `tmdb.status === 'matched'`.
- Validade: a mesma do registro TMDB (`TMDB_CACHE_MS`, 6 meses).
- Registro `matched` sem a chave `similar` = gravado antes da 035 → pedido de
  novo **uma vez** (FR-004). `no_match`/`dead_id` não são repetidos.

## 2. `TitleMetadataView` (visão mesclada, `lib/metadata/types.ts`)

Ganha (já no stub):

| Campo | Origem | Regra |
| --- | --- | --- |
| `tmdbMatch?: 'matched' \| 'no_match' \| 'dead_id'` | `tmdb.status` | ausente = TMDB ainda não consultado |
| `similar?: TmdbTitleRef[]` | `tmdb.fields.similar` | só com `matched` |
| `castPeople?: CastPerson[]` | `tmdb.fields.castPeople` | só com `matched` |

`cast` (texto) continua como na 032 — provedor vence. A aba Elenco usa
`castPeople` quando ele tem pessoas; senão, o texto (D-006).

## 3. Tabela nova `tmdbPeople` (Dexie **v13**)

```ts
interface TmdbPersonRecord {
  personId: number                // chave primária
  name: string
  photoUrl?: string
  credits: TmdbTitleRef[]         // já filtrados/dedup/ordenados, até FILMOGRAPHY_STORED_MAX (200)
  fetchedAt: number
}
// this.version(13).stores({ tmdbPeople: 'personId' })
```

- Não é por fonte (a mesma pessoa serve a qualquer lista) — por isso não é
  apagada por `deleteSource`.
- **É apagada inteira** por `removeTmdbKey` (mesma transação que já limpa a
  parte TMDB de `titleMetadata`) — FR-021.
- Falha **nunca** é gravada. Biografia/nascimento nunca são lidos nem
  guardados (fora de escopo).
- ⚠️ A feature 034 está em andamento na mesma branch sem subir versão; se
  ela (ou outra) subir para v13 antes, esta vira a próxima livre (R-004).

## 4. Navegação (`tv-web/src/navigation/appNav.ts`)

```ts
| { name: 'movie-detail'; movieId: string; restore?: DetailSnapshot }
| { name: 'series-detail'; seriesId: string; restore?: DetailSnapshot }
| { name: 'person'; personId: number; personName: string; restore?: PersonSnapshot }

// features/vod/detailSnapshot.ts (stub já criado)
interface DetailSnapshot { tab: 'episodes' | 'details' | 'cast' | 'similar'; focusKey?: string }
// features/person/personSnapshot.ts (a criar)
interface PersonSnapshot { focusKey?: string }   // `tmdb:<kind>:<tmdbId>`
```

Chaves de foco (identidade, nunca índice): `tmdb:movie:604`,
`tmdb:series:1399`, `person:6384`.

## 5. Resultado do cruzamento (`ResolvedTitle`, `TitleResolution`)

Ver `logic/cruzamento-local.md`. `localItemId` é o id local (string) do
registro em `channels` — o mesmo formato de `CatalogItemOut.id`.
