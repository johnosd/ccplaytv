# Lógica: candidatos a trailer (de onde vêm, como se ordenam, como se guardam)

Feature 033. Código: `tv-web/src/lib/trailer/trailerCandidates.ts` (puro),
`tv-web/src/lib/metadata/{providerMetadata,tmdbMapping,tmdbLookup,titleMetadata,titleMetadataStore}.ts`.
Contratos: `trailerCandidates.trailers.contract.test.ts`, `titleMetadata.trailers.contract.test.ts`.

## 1. Referência e candidato

```ts
// db.ts — guardado
interface TrailerVideoRef { videoId: string; kind: 'trailer' | 'teaser'; language?: string; official?: boolean }
// trailerCandidates.ts — exibido/usado
interface TrailerCandidate extends TrailerVideoRef { origin: 'provider' | 'tmdb' }
```

`videoId` é SEMPRE validado por `isYoutubeVideoId` (`/^[A-Za-z0-9_-]{11}$/`)
antes de ser guardado ou usado. Valor inválido = ausente (nunca "consertado").

## 2. Ordem (`buildTrailerCandidates(provider, tmdb)`)

1. Os do provedor, na ordem em que vieram, só os de id válido (na prática, 0 ou 1).
2. Os do TMDB, ordenados por uma chave estável:
   1. `kind`: `trailer` antes de `teaser`;
   2. `official === true` antes de `false`/ausente (**R-012**: antes era o idioma; o
      dublado de um canal agregador passava na frente do oficial da distribuidora);
   3. idioma: `language === 'pt'` antes de qualquer outro (inclusive ausente);
   4. empate: a ordem em que o TMDB entregou (sort estável — nunca por id).
3. Remove repetidos por `videoId`, mantendo a PRIMEIRA ocorrência (o do provedor
   vence o mesmo vídeo vindo do TMDB — por isso a origem fica `provider`).
4. Corta em `MAX_TRAILER_CANDIDATES` (5). A tela só usa os dois primeiros
   (preferido + um reserva, FR-017), mas guardar 5 não custa nada e ajuda a
   medir SC-005.

Entrada `undefined` ou vazia nas duas → `[]`. `mergeTitleMetadata` transforma
`[]` em **ausência** de `view.trailers` (convenção da 032: campo ausente = sem dado).

**Não** vale aqui a regra "provedor vence" dos outros campos da 032: as duas
fontes SOMAM candidatos. É o único campo da visão com essa regra.

## 3. TMDB → referências (`trailerRefsFromTmdbVideos(raw)`)

`raw` é o objeto `videos` do detalhe (`{ results: [...] }`). Para cada item:

- descarta se `site !== 'YouTube'`;
- `type === 'Trailer'` → `trailer`; `type === 'Teaser'` → `teaser`; qualquer outro
  (`Featurette`, `Clip`, `Behind the Scenes`, `Bloopers`, `Opening Credits`…) descartado;
- descarta se `key` não passa em `isYoutubeVideoId`;
- `language` = `iso_639_1` se for string não vazia; `official` só se for boolean.

Forma inesperada (não objeto, `results` não array) → `[]`, nunca erro.

## 4. Onde cada fonte é lida (sem requisição nova — FR-005)

| Fonte | Filme | Série |
| --- | --- | --- |
| Provedor | `get_vod_info` → `info.youtube_trailer` em `normalizeVodInfo` | `get_series_info` → `info.youtube_trailer` em `normalizeSeriesInfo` (o `seriesLoader` já grava essa resposta, D-009 da 032) |
| TMDB | `/movie/{id}` com `append_to_response=credits,videos` e `include_video_language=pt,en,null` | `/tv/{id}`, mesmos parâmetros |

Medido no painel real (2026-09-29): a listagem `get_vod_streams` **não** tem o
campo (0 de 31 416); `get_vod_info` tem em ~1 %; em série o `info` do
`get_series_info` repete exatamente o valor da listagem (25/25 iguais) — por
isso a listagem de séries NÃO precisa ser lida nem gravada no import.

`include_video_language`: sem ele o TMDB devolve só vídeos no idioma de
`language` (pt-BR), e quase todo trailer é `en`. `null` = vídeo sem idioma
declarado. Outros idiomas ficam de fora de propósito (D-004).

Os parâmetros entram em `detailParams` de `tmdbLookup.ts` — as DUAS chamadas de
detalhe (pelo `tmdb_id` do provedor e pelo candidato da busca) usam o mesmo
objeto. A chamada do fallback de idioma da sinopse (`toMatched`) NÃO precisa de
`videos`.

`mapTmdbDetail` passa a preencher `fields.trailerVideos` =
`trailerRefsFromTmdbVideos(detail.videos)` **somente quando `detail.videos`
existe** (pode ser `[]`); sem a chave `videos` na resposta, o campo fica ausente.

## 5. Cache e "quando pedir de novo"

### 5.1 TMDB (`enrichFromTmdb`)

Hoje: não chama se o provedor não deixa lacuna, ou se `tmdbFetchedAt` tem menos
de 6 meses. Muda para:

```
precisaTmdb =
    providerLeavesGaps(provider)            // agora também: sem trailerVideos válido do provedor
 || tmdbSemVideos(cached.tmdb)              // matched gravado antes da 033

tmdbSemVideos(t) = t?.status === 'matched' && t.fields.trailerVideos === undefined

se !precisaTmdb: não chama
se cached.tmdbFetchedAt dentro de 6 meses E !tmdbSemVideos(cached.tmdb): não chama
```

- `no_match`/`dead_id` continuam valendo 6 meses (não há vídeo a pedir) — o
  contrato 3 da 032 depende disso.
- Um `matched` antigo é repedido UMA vez: a resposta nova traz `videos` (mesmo
  que `[]`) e a condição some. Se o TMDB respondesse sem `videos`, repetiria a
  cada abertura do detalhe — aceitável (só em ação explícita) e improvável.
- Chave ausente/recusada/pausada: nada muda (mesmas guardas da 032).

### 5.2 Provedor (D-006)

`PROVIDER_FIELDS_VERSION = 2` (exportada de `titleMetadataStore.ts`).
`storeProviderMetadata` grava `providerVersion: PROVIDER_FIELDS_VERSION` — isso
cobre os DOIS chamadores (detalhe e `seriesLoader`). Em `refreshFromProvider`:

```
fresco = isCategoryFresh(providerFetchedAt, now) && cached.providerVersion === PROVIDER_FIELDS_VERSION
```

Para série, a regra de adiar (`'deferred'` enquanto os episódios vão ser
buscados) continua igual: episódios frescos + metadata de versão antiga → busca
o `get_series_info` uma vez, como já faz para série aberta antes da 032.
`refreshFromProvider` passa a receber o registro em cache (ou a versão) além do
`providerFetchedAt`.

## 6. Merge (`mergeTitleMetadata`)

Acrescenta, sem mexer nos outros campos:

```ts
const tmdbRefs = tmdb?.status === 'matched' ? tmdb.fields.trailerVideos : undefined
const trailers = buildTrailerCandidates(provider?.trailerVideos, tmdbRefs)
if (trailers.length > 0) view.trailers = trailers
```

`providerLeavesGaps` ganha: `provider?.trailerVideos === undefined || provider.trailerVideos.length === 0`.

## 7. Nunca

- Buscar trailer por foco, em grade ou em lote (FR-002, SC-004).
- Chamar `/movie/{id}/videos` separado (FR-005).
- Guardar URL de vídeo; só o id.
- Inventar trailer: título sem candidato fica sem (constitution "IA e
  Classificação Nunca Inventam Dados").
