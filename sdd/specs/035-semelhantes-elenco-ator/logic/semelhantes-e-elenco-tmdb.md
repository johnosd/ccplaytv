# Lógica — Semelhantes e elenco na MESMA consulta do detalhe

Arquivos: `lib/metadata/tmdbLookup.ts`, `tmdbMapping.ts`, `tmdbConnector.ts`,
`titleMetadata.ts`. Contrato: `titleMetadata.semelhantes.contract.test.ts`.

## 1. Parâmetros do detalhe (D-001)

`lookupTmdb` monta `detailParams` por tipo — as duas rotas que pedem detalhe
(pelo `tmdb_id` e pelo candidato da busca) usam os mesmos:

| Tipo | `append_to_response` |
| --- | --- |
| filme (`/movie/{id}`) | `credits,videos,recommendations,similar` |
| série (`/tv/{id}`) | `aggregate_credits,videos,recommendations,similar` |

`language=pt-BR` e `include_video_language=pt,en,null` continuam. A chamada de
fallback de idioma (FR-021 da 032) **não** ganha `append_to_response`.
Nenhuma requisição nova: é a mesma chamada que o detalhe já fazia.

## 2. Mapeamento (`mapTmdbDetail`)

```text
similar:
  se nem 'recommendations' nem 'similar' estão no detalhe → ausente (não é resposta da 035)
  lista = recommendations.results ++ similar.results   (nessa ordem)
  para cada r: id numérico, título não vazio (title|name), id ≠ id do próprio detalhe
  sem repetir id (primeira ocorrência vence) · no máximo 20
  kind = o do detalhe (filme → 'movie', tv → 'series')  — NÃO ler media_type
  year = yearOfDate(release_date ?? first_air_date)
  posterUrl = poster_path ? tmdbImageUrl(poster_path, 'w342') : ausente
  overview = trim, só se não vazio; originalTitle só se presente
  resultado sempre presente ([] quando nada serve)

castPeople:
  filme: credits.cast ; série: aggregate_credits.cast
  ordenar por `order` (ausente = fim), manter id numérico + nome não vazio, sem repetir id, no máximo 20
  character: filme → `character`; série → o `roles[]` com maior `episode_count` → `character`
  (string vazia = ausente)
  photoUrl = profile_path ? tmdbImageUrl(profile_path, 'w185') : ausente

cast (texto, 032): filme continua de credits.cast; série passa a vir de
aggregate_credits.cast (os 10 primeiros por `order`), já que `credits` deixa
de ser pedido para série.
```

`tmdbImageUrl(path, size = 'w1280')` ganha o tamanho como 2º parâmetro; o
backdrop continua `w1280`. Nunca chave em URL de imagem.

## 3. Quando o TMDB é consultado (D-002 — amplia a FR-018 da 032)

A 032 só consultava o TMDB quando o provedor deixava algum campo vazio
(`providerLeavesGaps`). Semelhantes e elenco com identidade **só existem no
TMDB**, então essa trava sai:

```text
enrichFromTmdb(record):
  cached = titleMetadata.get(stableId)
  precisa =
       cached?.tmdbFetchedAt ausente
    OU vencido (> TMDB_CACHE_MS)
    OU tmdbLacksVideos(cached.tmdb)            // 033
    OU tmdbLacks035(cached.tmdb)               // matched && fields.similar === undefined
  se !precisa → return
  credencial ausente | state 'refused' | pausedUntil > now → return (sem requisição)
  hint = cached?.providerTmdbId ?? (cached?.tmdb?.status === 'matched' ? cached.tmdb.tmdbId : undefined)
  lookupTmdb({ record, providerTmdbId: hint, ... }) → storeTmdbResult  (resto igual à 032)
```

- A mescla não muda: provedor vence nos campos da 032; TMDB só preenche.
- O ramo `'deferred'` da série (esperar o `seriesLoader`) continua igual.
- Reabrir dentro da validade: zero requisição (contrato).
- `hint` com o id já casado evita repetir a busca por título num título M3U
  cujo casamento já foi feito — o ano do detalhe ainda é conferido.

## 4. Visão mesclada

`mergeTitleMetadata` acrescenta:

```ts
if (tmdb) view.tmdbMatch = tmdb.status
if (tmdb?.status === 'matched') {
  if (tmdb.fields.similar !== undefined) view.similar = tmdb.fields.similar
  if (tmdb.fields.castPeople?.length) view.castPeople = tmdb.fields.castPeople
}
```

## 5. Testes existentes afetados (não travados — o executor atualiza)

`titleMetadata.tmdb.test.ts`/`tmdbMapping`/`tmdbLookup` têm casos que
assumem "provedor completo → sem TMDB" ou `credits` na série. Atualizar para
a regra nova, sem tocar os contratos travados da 032/033 (que continuam
verdes: nenhum deles afirma a ausência de chamada ao TMDB com chave).
