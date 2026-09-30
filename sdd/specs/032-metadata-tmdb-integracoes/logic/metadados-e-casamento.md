# Lógica — obter, casar e mesclar metadata (feature 032)

Módulo: `tv-web/src/lib/metadata/` (`titleMetadata.ts`, `providerMetadata.ts`,
`tmdbConnector.ts`, `tmdbLookup.ts`, `tmdbMatch.ts`, `tmdbMapping.ts`,
`titleMetadataStore.ts`, `tmdbKeyRepository.ts`). Contrato:
`titleMetadata.metadata-tmdb.contract.test.ts`.

## 1. `ensureTitleMetadata(itemId, {database, now, fetchImpl})`

```
record ← channels.get(itemId); se não é movie/series → {}
stableId ← buildStableId(record)          // mesma chave do userState
cached ← titleMetadata.get(stableId)

// 1) Provedor
se fonte tem credencial (readCredential) E (cached?.providerFetchedAt ausente OU > 24 h):
    filme  → get_vod_info&vod_id=providerStreamId
    série  → get_series_info&series_id=seriesId   (ver §5 — só quando os episódios JÁ estão frescos;
             senão ADIA: quem grava é o seriesLoader, e o passo 2 também é adiado nesta passada)
    sucesso → grava provider + providerTmdbId + providerFetchedAt=now
    falha   → mantém o que havia, não avança providerFetchedAt, segue (FR-006)

// 2) TMDB — só se há chave "usável" E algum campo de FR-003 vazio no provedor
se precisaTmdb(provider) E tmdbUsável(now) E (cached?.tmdbFetchedAt ausente OU > 182 dias):
    tmdb ← casarEBuscar(record, provider, providerTmdbId)   // §2
    grava tmdb + tmdbFetchedAt=now   (inclusive no_match / dead_id)
    erro 401 → integrations.state='refused' (para de tentar até nova chave)
    erro rede → state='offline'; 429 → 'rate_limited', pausedUntil=now+10min
    (em erro NÃO grava tmdbFetchedAt: tenta de novo no próximo detalhe aberto, nunca em laço)

return mesclar(provider, tmdb)   // §4
```

Single-flight por `stableId` (FR-025): `Map<string, Promise>` como
`seriesLoader.inFlight`. Nunca lança — erro inesperado vira `{}` ou o que
já havia (FR-006). **Nenhum** `console.*` com URL, chave ou erro cru.

`tmdbUsável`: linha `integrations` existe, `state !== 'refused'`, e
`pausedUntil` ausente ou já passado. `offline` continua usável.

`precisaTmdb`: pelo menos um de `synopsis, backdropUrl, genres,
durationSeconds, director, country, cast` ausente no provedor. Com tudo
preenchido, zero chamadas TMDB.

## 2. Casamento com o TMDB (FR-019/FR-020)

Endpoints: filme `/3/movie/{id}`, série `/3/tv/{id}`; busca
`/3/search/movie` (`query`, `year`) e `/3/search/tv` (`query`,
`first_air_date_year`). Sempre `language=pt-BR`; detalhe com
`append_to_response=credits`.

```
ano ← record.year ?? anoNoTítulo(originalName)   // "(2021)" ou " - 2021" final; só para casar, NUNCA exibido
se providerTmdbId:
    d ← GET detalhe(providerTmdbId)
    404 → marca o id como morto e vai para a busca (se a busca não casar: 'dead_id')
    se ano E |anoDe(d) − ano| > 1 → descarta o id (contradito) e vai para a busca
    senão → matched(d)
busca:
    se não há ano → 'no_match'           // FR-020: sem ano não enriquece
    q ← títuloNormalizado(originalName)
    r ← GET search(query=q, year=ano)
    candidatos ← r.results com anoDe(c) definido E |anoDe(c) − ano| ≤ 1
                 E (comparável(c.title|c.name) === comparável(q)
                    OU comparável(c.original_title|c.original_name) === comparável(q))
    exatamente 1 → GET detalhe(c.id) → matched
    0 ou ≥ 2 → 'no_match'
```

`títuloNormalizado`: remove `[...]`, `(...)`, tokens de qualidade/idioma
isolados (`4K, UHD, FHD, HD, SD, H265, HEVC, DV, HDR, LEG, DUB, DUAL,
NAC`), `" - 2021"` final; colapsa espaços; trim. O `query` enviado mantém
acentos e maiúsculas ("Duna (2021) [LEG]" → "Duna").
`comparável(x)` = `títuloNormalizado(x)` em minúsculas e sem acentos.

`anoDe`: `release_date`/`first_air_date` (`YYYY`).

## 3. Sinopse vazia em pt-BR (FR-021)

Se `overview` pt-BR vazio → um GET do detalhe com
`language=<original_language>`; se vier texto, a sinopse carrega
`synopsisLanguage=original_language`. Se `original_language === 'pt'`, não
repete. Vazio nos dois → sem sinopse.

## 4. Mescla (FR-007/FR-018/FR-022)

Por campo: `provider[c]` presente → `{value, origin:'provider'}`; senão
`tmdb.fields[c]` (só em `matched`) presente → `{value, origin:'tmdb'}` (+
`language` na sinopse quando ≠ `pt`); senão ausente. Título, duração de
**reprodução**, URL e categoria nunca passam por aqui.

## 5. Série e a chamada `get_series_info`

`seriesLoader.fetchAndStore` já chama `get_series_info` para os episódios.
`fetchSeriesDetail` (irmão de `fetchSeriesInfo`, que manteve a assinatura —
R-008) devolve `{ episodes, info }`, e o `seriesLoader` grava a metadata do
provedor (`providerFetchedAt=now`) **e a sinopse de cada episódio** (`info.plot`,
FR-028) na mesma ida — uma só requisição.

As duas queries da tela (`useSeriesEpisodes` e `useTitleMetadata`) rodam **em
paralelo**; para não haver duas requisições idênticas (R-010):

- `ensureTitleMetadata` só pergunta `get_series_info` sozinho quando os
  episódios já estão **frescos** e a metadata do provedor não (série aberta antes
  desta feature — uma vez, R-004). Com os episódios ainda por buscar, o provedor
  fica **adiado** (`deferred`) — e o TMDB também: ele só completa o que o
  provedor NÃO trouxe, e ainda não se sabe o que ele trouxe.
- `useSeriesEpisodes` invalida `title-metadata` quando termina em `fetched`, e a
  tela relê a metadata já gravada.

## 6. O que nunca fazer

- Buscar metadata por foco, na grade, no hero do catálogo ou em lote.
- Casar por título sem ano, ou aceitar o "primeiro resultado".
- Tentar o TMDB de novo em laço após erro.
- Substituir a categoria da fonte por gênero (constitution).
- Exibir o ano extraído do título.
