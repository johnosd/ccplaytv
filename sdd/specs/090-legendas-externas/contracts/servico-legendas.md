# Contrato: operações de legenda no serviço do portal

Feature `090-legendas-externas`. Superfície nova em `api/app/portal/` (Cloud Run + Firestore, ADR-013), chamada só
pela TV (bearer da TV, `tv_principal`), **somente por ação da pessoa** (exceção (k) da constitution, após T001).
Dois fornecedores: **OpenSubtitles** e **SubDL** (incluído em 2026-10-22), consultados em paralelo e devolvidos numa
lista só.

## §1 Regras comuns

- Prefixo `/portal/v1`, rotas em `api/app/portal/routes/subtitles.py`, registradas em `application.py` como os
  demais routers.
- Autenticação: `tv_principal(request)` (origin ausente ou `null`, `Authorization: Bearer`). Sem sessão de navegador.
- Corpo validado por modelos pydantic com `extra="forbid"` (padrão `Input` de `routes/auth.py`).
- Resposta sempre com `Cache-Control: no-store`.
- Acesso: TV com licença `active` ou teste vigente (`trial` com `now < trial_expires_at`). Lido por um método
  **somente leitura** novo em `LicensingService` (ex.: `access_state(principal, now)`) — **não** chamar
  `entitlement()`, que grava (inicia teste, gira geração). Sem acesso → `409 {"code": "subtitles_not_entitled"}`.
- Chaves: `PortalSettings.opensubtitles_api_key` e `PortalSettings.subdl_api_key` (`SecretStr | None`; env
  `CCPLAY_PORTAL_OPENSUBTITLES_API_KEY`, `CCPLAY_PORTAL_SUBDL_API_KEY`). Fornecedor sem chave = fornecedor
  **desligado** (não consultado, não aparece em `unavailable`); os dois sem chave → `503 service_unavailable`. Nunca
  em resposta, log, erro, `repr`.
- **A resposta de busca do SubDL embute a chave na URL de download** (`/subtitle/<a>-<b>.zip?api_key=…`, visto na
  prova). O adaptador extrai só o par `<a>-<b>` e **descarta a URL**; o download é remontado pelo serviço. Nenhuma URL
  de fornecedor vai para a TV, para log ou para exceção.
- Nenhum log com o termo/ID pesquisado junto do `device_id`. Logs permitidos: rota, status, latência, fornecedor,
  contador.
- Destinos fixos: OpenSubtitles `https://api.opensubtitles.com/api/v1` (busca e pedido de link) e o `link` devolvido
  **só** se `https` e host terminado em `.opensubtitles.com`/`.opensubtitles.org`; SubDL `https://api.subdl.com/api/v1`
  (busca) e `https://dl.subdl.com/subtitle/<a>-<b>.zip` (download). Redirect para fora dessa regra →
  `503 service_unavailable` daquele fornecedor.
- `User-Agent: ccplayTv v<versão do serviço>` em toda chamada a fornecedor.
- Timeout por chamada a fornecedor: 8 s; a busca espera os dois em paralelo (`asyncio.gather`) — o pior caso é 8 s,
  não 16 (o `portalClient` da TV aborta em 10 s).
- Erros de fornecedor: 429 → uma espera honrando `ratelimit-reset`/`Retry-After` até 2 s e **uma** nova tentativa;
  persistindo → limite daquele fornecedor. OpenSubtitles 406/407 ou `remaining: 0` no download → limite. SubDL
  `quota_exceeded`/HTTP 429 → limite. 401/403 (chave padrão recusada) → indisponível (sem dizer que é a chave).

## §2 `POST /portal/v1/device/subtitles/search`

Corpo — **exatamente** uma das formas de `buildSearchRequest` (`logic §3`):

```json
{ "language": "pt-BR", "tmdbId": 603 }
{ "language": "en", "parentTmdbId": 1396, "season": 1, "episode": 2 }
{ "language": "es", "query": "Matrix", "year": 1999 }
```

- Campo opcional `providers`: lista não vazia, sem repetição, de `opensubtitles`/`subdl` — só esses são consultados
  (a TV o usa quando a pessoa tem chave própria de um deles, §5). Ausente = os dois.
- `language` ∈ {`pt-BR`, `en`, `es`}; inteiros positivos (`tmdbId`, `parentTmdbId` ≤ 10⁹; `season`/`episode` ≤
  10 000; `year` 1888–2100); `query` 1–200 caracteres sem caractere de controle. Forma fora disso → 422.
- Limite anti-abuso por TV: `subtitles_searches_per_hour` (padrão **60**), uma unidade por busca da pessoa (não por
  fornecedor), via `SharedRateLimiter`. Estourado → `429 {"code": "rate_limited"}` + `Retry-After`.
- Tradução por fornecedor:

| Pedido | OpenSubtitles `GET /subtitles` | SubDL `GET /subtitles` |
| --- | --- | --- |
| idioma | `languages=pt-br\|en\|es` | `languages=BR_PT\|EN\|ES` |
| filme com ID | `tmdb_id` | `tmdb_id`, `type=movie` |
| episódio com ID | `parent_tmdb_id`, `season_number`, `episode_number` | `tmdb_id` (da série), `type=tv`, `season_number`, `episode_number` |
| por nome | `query` (+ `year`/`season_number`/`episode_number`) | `film_name` (+ `year`/`season_number`/`episode_number`) |
| outros | parâmetros em ordem alfabética, 1ª página | `subs_per_page=30`, 1ª página |

- Normalização (no máximo 50 por fornecedor, só do idioma pedido):
  - OpenSubtitles: `id = "os:" + files[0].file_id` (resultado sem arquivo é descartado); `release` =
    `attributes.release` ou `files[0].file_name`; `downloads` = `download_count`; `hearingImpaired` =
    `hearing_impaired`.
  - SubDL: `id = "sd:" + "<a>-<b>"` extraído de `url` por `^/subtitle/(\d+-\d+)\.zip` (não casou → descarta);
    `release` = `release_name` ou `name`; sem `downloads`; `hearingImpaired` = `hi`; `seasonPack` = busca de episódio
    **e** (`full_season` verdadeiro **ou** `episode` nulo); resultado de episódio cujo `episode` (ou faixa
    `episode_from`…`episode_end`) não inclui o pedido → descarta.
  - `release` cortado em 200 caracteres; nada mais do fornecedor é repassado (autor, URL, página, fps).
- Ordem (FR-026): OpenSubtitles por `downloads` decrescente; depois SubDL na ordem do fornecedor; na busca de
  episódio, dentro de cada fornecedor, episódio exato antes de `seasonPack`.
- Resposta 200 (inclusive quando só um fornecedor respondeu):

```json
{
  "results": [
    { "id": "os:9001", "provider": "opensubtitles", "language": "pt-BR", "release": "Matrix.1999.1080p.BluRay", "downloads": 1234, "hearingImpaired": false },
    { "id": "sd:3197651-3213944", "provider": "subdl", "language": "pt-BR", "release": "The.Matrix.1999.WEBRip.iTunes", "hearingImpaired": false }
  ],
  "unavailable": []
}
```

  `unavailable` lista os fornecedores com chave configurada que falharam/estavam no limite nesta busca. **Os dois**
  falharam → erro (o do mais grave: limite de fornecedor `503 subtitles_provider_limit`, senão
  `503 service_unavailable`).

## §3 `POST /portal/v1/device/subtitles/download`

Corpo: `{ "id": "os:9001" | "sd:3197651-3213944", "language": "pt-BR" }` — `id` por `^(os:\d{1,12}|sd:\d{1,12}-\d{1,12})$`.

- Limite diário por TV: `subtitles_downloads_per_day` (padrão **10**), **somando os dois fornecedores**. Conferido
  antes (`consume=False`) e consumido só depois do sucesso. Estourado → `429 {"code": "subtitles_device_limit"}` +
  `Retry-After`.
- OpenSubtitles: `POST /download {"file_id": …}` → `link`; `GET link` (regra de host do §1); corpo ≤ **1 MiB**.
- SubDL: `GET https://dl.subdl.com/subtitle/<a>-<b>.zip` com a chave padrão do serviço (`api_key` na query **só nesta
  chamada de saída**, nunca registrada) → ZIP ≤ **2 MiB** compactado. Extração (`zipfile`, nunca em disco):
  - ignorar diretórios e nomes de caminho (só o nome-base importa; `..`/absolutos nunca usados);
  - no máximo **50 entradas** e **4 MiB** descompactados no total (anti-bomba: ler cada entrada com limite);
  - candidatas: extensão `.srt` ou `.vtt` (sem diferenciar maiúsculas);
  - filme ou episódio não-pacote: uma candidata → ela; várias → a maior;
  - pacote de temporada: a candidata cujo nome casa `S0?<temporada>E0?<episódio>(?!\d)` ou `<temporada>x0?<episódio>(?!\d)`
    (sem diferenciar maiúsculas); zero ou mais de uma → `409 subtitles_unreadable`;
  - nenhuma candidata → `409 subtitles_unreadable`.
- Texto (os dois): decodifica UTF-8 (com ou sem BOM); falhando, `cp1252`; falhando → `409 subtitles_unreadable`.
  Arquivo escolhido > 1 MiB → `409 subtitles_unreadable`. Sem conversão de formato (a TV lê SRT e WebVTT).
- Resposta 200: `{ "text": "<arquivo em UTF-8>" }`. Nenhum link, nome de arquivo do ZIP ou `remaining` do fornecedor
  é repassado.

## §4 Códigos de erro (TV ↔ serviço)

| Status | `code` no corpo | TV (`SubtitleErrorCode`) |
| --- | --- | --- |
| 401 | — | `unavailable` (o `portalClient` já trata `unauthorized`) |
| 409 | `subtitles_not_entitled` | `not_entitled` |
| 409 | `subtitles_unreadable` | `unreadable` |
| 422 | — | `unavailable` (pedido malformado é bug, não estado da pessoa) |
| 429 | `subtitles_device_limit` | `device_limit` (+ `Retry-After`) |
| 429 | `rate_limited` | `device_limit` (+ `Retry-After`) |
| 503 | `subtitles_provider_limit` | `provider_limit` |
| 503 | `service_unavailable` / sem código | `unavailable` |
| rede | — | `offline` |

O `portalClient` da TV lê o `code` do corpo em 401/409/429/503 (429 é novo nesta feature) e só aceita os códigos da
sua lista fechada.

## §5 BYOK direto da TV (P3) — o que a TV chama sem o serviço

Quando a pessoa escolheu a própria chave de um fornecedor, **aquele** fornecedor sai da chamada ao serviço e a TV o
consulta direto, com as mesmas regras de tradução (§2) e de extração (§3), reimplementadas em `lib/subtitles/`:

- SubDL: `GET https://api.subdl.com/api/v1/subtitles?api_key=<chave da pessoa>&…` e
  `GET https://dl.subdl.com/subtitle/<a>-<b>.zip?api_key=<chave>` — CORS `*` e pré-checagem com `Origin: null`
  aceitos no PC (prova de 2026-10-22); **não provado na TV**. ZIP aberto no app com `DecompressionStream('deflate-raw')`
  (Chromium ≥ 80) por um leitor ZIP mínimo próprio, com os mesmos limites do §3.
- OpenSubtitles: `GET /subtitles` e `POST /download` com `Api-Key: <chave da pessoa>`; CORS aceito no PC (avaliação);
  o download do `link` **não** foi provado do navegador da TV — se falhar por CORS, o BYOK do OpenSubtitles fica só
  com busca + aviso, e o caso volta ao plano.
- O limite diário do serviço não se aplica (a cota é da conta da pessoa). A chave pessoal nunca vai ao serviço do
  ccplayTv, ao portal nem ao backup.
- Busca mista: fornecedor com chave pessoal → direto; o outro → serviço (se a TV tiver licença) ou fora
  (`unavailable`). A TV junta as duas respostas com a mesma ordem do §2.
