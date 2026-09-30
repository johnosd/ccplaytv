# Data Model — 032 Metadata de Filmes e Séries + TMDB (BYOK)

Dexie **v12** (`tv-web/src/lib/catalog/db.ts`): duas tabelas novas, sem
`.upgrade()` (não há dado antigo a converter). Nenhum campo novo em
`channels`/`sources`.

## 1. `titleMetadata` — cache de metadata por título

`'stableId, sourceId'` — chave primária `stableId`, índice `sourceId`
(descarte por fonte, FR-026).

| Campo | Tipo | Regra |
| --- | --- | --- |
| `stableId` | `string` | Mesma chave de `userStateRepository.buildStableId` (fonte + tipo + id estável). **Nunca** URL. Sobrevive a resync/nova geração (como `userStates`). |
| `sourceId` | `string` | Para apagar tudo da fonte removida. |
| `kind` | `'movie' \| 'series'` | |
| `provider` | `ProviderMetadata \| undefined` | Campos do provedor já normalizados (§3). `undefined` = nunca obtido ou fonte sem protocolo (M3U). |
| `providerFetchedAt` | `number \| undefined` | Última obtenção **bem-sucedida** do provedor. Validade: 24 h (`STALE_AFTER_MS`, mesma janela de categorias/episódios). Falha não avança. |
| `providerTmdbId` | `number \| undefined` | `info.tmdb_id` do `get_vod_info` (filme). Série: o painel não declara `tmdb_id` no nível da série (medido 2026-09-29, só por episódio) → sempre `undefined`. |
| `tmdb` | `TmdbResult \| undefined` | §2. Apagado inteiro por `removeTmdbKey` (FR-014). |
| `tmdbFetchedAt` | `number \| undefined` | Validade: 182 dias (6 meses, FR-023), inclusive para `no_match`/`dead_id`. |

## 2. `TmdbResult`

```ts
type TmdbResult =
  | { status: 'matched'; tmdbId: number; fields: TmdbFields }
  | { status: 'no_match' }                 // zero ou vários candidatos, ou sem ano
  | { status: 'dead_id'; tmdbId: number }  // id do provedor 404 no TMDB e busca sem casamento
```

`TmdbFields` = mesmos campos de `ProviderMetadata` (§3), já em pt-BR, com
`synopsisLanguage` quando a sinopse veio do idioma original.

Guarda-se **o registro TMDB inteiro**, mesmo campos que hoje o provedor
tem: o merge é na leitura (`logic/metadados-e-casamento.md` §4).

## 3. `ProviderMetadata` / `TmdbFields`

Todos opcionais; string vazia, `"0"`, lista vazia → ausente (nunca gravado
como valor). Formatos confirmados no painel real em 2026-09-29.

| Campo | Filme (`get_vod_info.info`) | Série (`get_series_info.info`) | TMDB |
| --- | --- | --- | --- |
| `synopsis` | `plot` → `description` | `plot` | `overview` (pt-BR; fallback original) |
| `backdropUrl` | `backdrop_path[0]` (array de string) ou string | idem | `https://image.tmdb.org/t/p/w1280` + `backdrop_path` |
| `genres` | `genre` (texto) | `genre` | `genres[].name` juntos por ", " |
| `durationSeconds` | `duration_secs` → `duration` "HH:MM:SS" → `episode_run_time` (min) | `episode_run_time` (min, por episódio; string) | filme `runtime` (min); série `episode_run_time[0]` |
| `director` | `director` | `director` | filme: `credits.crew[job=Director]`; série: não preenche |
| `country` | `country` (como veio, ex. "United States of America") | — (painel não declara) | `production_countries[].iso_3166_1` → nome pt-BR via `Intl.DisplayNames` |
| `cast` | `cast` → `actors` | `cast` | `credits.cast` (até 10 nomes) |

## 4. `integrations` — chave BYOK

`'id'` — uma linha por serviço; hoje só `id: 'tmdb'`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | `'tmdb'` | |
| `key` | `string` | **Segredo** (constitution 1.6.0, exceção BYOK). Só `tmdbKeyRepository`/`tmdbConnector` leem; nunca em log, estado de tela, erro, exportação, nem em requisição que não seja `api.themoviedb.org`. |
| `format` | `'v3' \| 'v4'` | v3 = 32 hex → `?api_key=`; v4 = JWT (`eyJ…`, 3 segmentos) → `Authorization: Bearer`. |
| `state` | `'connected' \| 'refused' \| 'offline' \| 'rate_limited'` | Atualizado pelo teste e pelo enriquecimento (FR-024). |
| `lastTestedAt` | `number` | |
| `pausedUntil` | `number \| undefined` | Depois de `429`: nenhuma chamada TMDB até esse instante (agora + 10 min). |

Sem linha = `not_configured`. `removeTmdbKey` apaga a linha **e** remove
`tmdb`/`tmdbFetchedAt` de toda linha de `titleMetadata`.

## 5. Descarte

- `deleteSource(id)` ganha `titleMetadata.where('sourceId').equals(id).delete()` (FR-026).
- Nada é apagado por geração: `stableId` é estável entre gerações.
