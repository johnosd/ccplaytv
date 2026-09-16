# 06 — Reuso: Carga de Listas URL e Xtream

Escopo: como o IPTVnator carrega playlists por URL e por credenciais Xtream, e
o que desse fluxo pode ser reaproveitado no backend Python/FastAPI do CCPlay.
Complementa `03-apis.md` (que detalha os contratos individuais) com a visão do
**processo de carga** ponta a ponta: aquisição → parse → classificação →
publicação, cache, refresh e cancelamento.

## Como cada projeto carrega hoje

### CCPlay (atual)

- `POST /sources` → cria `Source` + `ImportJob`, dispara o job em
  `BackgroundTasks` (`api/app/routers/sources.py`).
- Job em `api/app/services/importer.py`: `_acquire` → `parse` → `classify` →
  `publish` (lotes de 2000, `_BATCH_SIZE`), com etapas `ACQUIRING` / `PARSING`
  / `CLASSIFYING` / `PUBLISHING` e contadores reais.
- **URL M3U:** baixa via `fetch_text_ssrf_safe` (SSRF por hop, limite 150 MB,
  timeout 90 s, 5 redirects, User-Agent VLC — `api/app/services/ssrf_guard.py`).
- **Provedor (Xtream):** monta `get.php?username=...&password=...&type=m3u_plus&output=m3u8`
  (`provider_connector.py` → `build_m3u_url`) e **reaproveita o pipeline M3U**
  — ainda **não** implementa o protocolo JSON `player_api.php`.
- Frontend: `tv-web/src/features/import/importApi.ts` (TanStack Query) +
  `ImportProgressScreen` (polling do job).

### IPTVnator (referência)

- **M3U URL:** `apps/electron-backend/src/app/events/playlist-source.ts`
  (`fetchPlaylistFromUrl`) → `requestWithValidatedRedirects` (redirects
  validados, timeout 30 s, User-Agent opcional) → parse
  (`iptv-playlist-parser`) → `createPlaylistObject`.
- **Xtream:** `XTREAM_REQUEST` no main
  (`apps/electron-backend/src/app/events/xtream.events.ts`) monta
  `/player_api.php`; o renderer orquestra via
  `libs/portal/xtream/data-access/src/lib/stores/features/with-content.feature.ts`
  e o data source `electron-xtream-data-source.ts` (estratégia DB-first).
- **Refresh/auto-update:** `playlist-auto-update.ts` (concorrência 3,
  isolamento de falha) e `playlist-refresh.worker.ts` (cancelamento).

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Pipeline em fases observáveis (adquirir→parse→classificar→publicar) | P0 |
| 2 | Separar conectores M3U e Provedor com saída normalizada comum | P0 |
| 3 | Conector Xtream JSON (`player_api.php`) em vez de baixar `get.php` | P0 |
| 4 | Normalização de URL do servidor Xtream | P0 |
| 5 | Status de conta com fallback de actions | P0 |
| 6 | Estratégia DB-first (cache → API só se frio) | P0 |
| 7 | URL de stream por `allowed_output_formats` | P0 |
| 8 | Preservar campos do usuário no re-download (favoritos/histórico) | P0 |
| 9 | Idempotência e dedup de requisição (single-flight) | P1 |
| 10 | Refresh com concorrência limitada e isolamento de falha | P1 |
| 11 | Cancelamento cooperativo com `operationId` | P1 |
| 12 | Restore de dados do usuário após reimportação | P1 |

---

## 1. Pipeline em fases observáveis (adquirir → parse → classificar → publicar)

- **O que é:** o trabalho de carga é um job com etapas nomeadas e contadores
  reais, consultável após fechar a tela; cancelamento é distinto de sair da
  tela; nenhum item parcialmente gravado aparece como pronto.
- **Onde está no IPTVnator:** o princípio está em
  `docs/architecture/m3u-playlist-module.md` (import como operação rastreada) e
  no worker `playlist-refresh.worker.ts` (fases `fetching`/`parsing`/`saving`).
  No CCPlay já está implementado: `api/app/services/importer.py`
  (`ImportStep` ACQUIRING/PARSING/CLASSIFYING/PUBLISHING) e
  `api/app/routers/import_jobs.py` (GET/cancel/retry).
- **Por que reutilizar:** é convergência — o CCPlay já nasceu com o desenho
  certo. O IPTVnator confirma os cuidados: percentual só quando há denominador
  confiável; cancelamento confirmado só quando o worker reconhece; lotes
  coerentes.
- **Como adaptar/melhorar:** manter. A única lacuna do CCPlay em relação ao
  IPTVnator é a **execução**: `BackgroundTasks` roda no mesmo processo do
  FastAPI; o IPTVnator isola em worker (ver itens 11 e o `02-arquitetura.md` #3).
- **Prioridade: P0** — já é a base da feature 001.

---

## 2. Separar conectores M3U e Provedor com saída normalizada comum

- **O que é:** um conector por tipo de fonte (`M3USourceConnector`,
  `ProviderSourceConnector`), ambos produzindo a mesma saída normalizada, sem
  converter uma API estruturada para M3U "só para reutilizar o parser".
- **Onde está no IPTVnator:** `fetchPlaylistFromUrl` (M3U) vs
  `XtreamApiService` (`getCategories`/`getStreams` por action JSON) — dois
  caminhos distintos que convergem no mesmo shape de catálogo
  (`XtreamContentItem`). No CCPlay é decisão registrada na ADR-006 §4.3
  ("manter conectores M3USourceConnector e ProviderSourceConnector separados,
  com saída normalizada comum").
- **Por que reutilizar:** o CCPlay hoje **viola** a própria ADR ao montar
  `get.php` e reaproveitar o parser M3U para o provedor. O IPTVnator mostra o
  custo de manter essa conversão: perde IDs/categorias/hierarquia do provedor
  e trata `output=ts/m3u8` como se fosse o protocolo.
- **Como adaptar/melhorar:** extrair do `importer.py` um `ProviderConnector`
  que fale `player_api.php` (item 3) e produza o mesmo `ClassifiedEntry`
  normalizado que o `M3UParser` produz. Não mais montar `get.php` como fonte
  de verdade.
- **Prioridade: P0** — corrige o desvio atual e desbloqueia o item 3.

---

## 3. Conector Xtream JSON (`player_api.php`) em vez de baixar `get.php`

- **O que é:** consultar o provedor por ações estruturadas
  (`get_live_categories`, `get_vod_streams`, `get_series`, etc.) contra
  `/player_api.php`, preservando `stream_id`/`series_id`/categoria do provedor,
  em vez de baixar um M3U e perder essa hierarquia.
- **Onde está no IPTVnator:** `libs/portal/xtream/data-access/src/lib/services/xtream-api.service.ts`
  (mapa `actionMap` por tipo: `get_live_categories`/`get_vod_categories`/
  `get_series_categories`; `getLiveStreams`/`getVodStreams`/`getSeriesStreams`;
  `getVodInfo`/`getSerieInfo`); transporte em
  `apps/electron-backend/src/app/events/xtream.events.ts`
  (`buildXtreamApiUrl` → `{base}/player_api.php`).
- **Por que reutilizar:** é o que desbloqueia filmes/séries com temporadas
  reais, catch-up, VOD por categoria e metadados. O M3U `m3u_plus` é um
  subconjunto pior da mesma conta.
- **Como adaptar/melhorar:** no `provider_connector.py`, substituir
  `build_m3u_url` por um cliente `player_api.php` (httpx) com as mesmas
  actions do IPTVnator; mapear cada response para o modelo `CatalogItem` do
  CCPlay. Manter o `output=ts/m3u8` apenas para a **URL de reprodução**, não
  para o catálogo.
- **Prioridade: P0** — requisito do item 1 do backlog (provedor por
  credenciais) com o conector completo.

---

## 4. Normalização de URL do servidor Xtream

- **O que é:** reduzir qualquer entrada (base, `get.php`, `player_api.php`,
  `panel_api.php`) à base normalizada, preservando subpath e rejeitando
  credenciais embutidas na URL.
- **Onde está no IPTVnator:** `libs/shared/interfaces/src/lib/xtream-portal.utils.ts`
  (`normalizeXtreamServerUrl`, `XTREAM_API_ENDPOINT_PATTERN`).
- **Por que reutilizar:** o `build_m3u_url` do CCPlay aceita DNS sem caminho e
  ignora o caso de o usuário colar uma URL completa com `get.php`. Normalizar
  evita montar `{base}/get.php/get.php` e permite armazenar credenciais
  separadas da URL.
- **Como adaptar/melhorar:** criar `normalize_xtream_server_url()` em
  `provider_connector.py` com as 6 regras do `03-apis.md` #3 e usá-la antes de
  qualquer request.
- **Prioridade: P0** — pré-requisito do item 3.

---

## 5. Status de conta com fallback de actions

- **O que é:** alguns painéis não respondem a `get_account_info`; tentar
  `get_account_info` → sem `action` → `get_profile`, com interpretação de
  `auth` e `exp_date`.
- **Onde está no IPTVnator:** `xtream-api.service.ts`
  (`XTREAM_ACCOUNT_ACTIONS` e `getAccountInfo`) e
  `xtream-portal.utils.ts` (`resolveXtreamPortalStatus`).
- **Por que reutilizar:** sem isso, uma conta válida pode aparecer como
  inválida na primeira carga. O CCPlay hoje nem faz essa checagem (baixa o
  `get.php` direto).
- **Como adaptar/melhorar:** implementar `get_account_info` com fallback no
  conector (item 3) e persistir `connection_state`/`last_successful_sync_at`
  da `Source` conforme o resultado (o modelo já tem os campos).
- **Prioridade: P0** — parte do conector de provedor.

---

## 6. Estratégia DB-first (cache → API só se frio)

- **O que é:** ao abrir um portal Xtream, ler o catálogo do cache local;
  só buscar na API quando o cache está frio (`importStatus !== 'completed'` ou
  vazio), gravando o que veio da API de volta.
- **Onde está no IPTVnator:** `libs/portal/xtream/data-access/src/lib/data-sources/electron-xtream-data-source.ts`
  (`loadCategories` e `loadContent`: "Fetch from DB directly… An empty result
  means the cache is cold; proceed to fetch from API").
- **Por que reutilizar:** é o cache-first da ADR-002 aplicado ao Xtream. No
  CCPlay, o catálogo importado fica no PostgreSQL (backend), e a TV cacheia em
  IndexedDB (item 2 do backlog) — mas **antes** disso, o backend já pode
  evitar re-baixar o provedor a cada abertura servindo do banco.
- **Como adaptar/melhorar:** no backend CCPlay, a leitura de catálogo por
  fonte deve vir do PostgreSQL; o `resync` (já existe em
  `POST /sources/{id}/resync`) é o único caminho que re-baixa. Adicionar
  `import_status` por fonte/tipo (equivalente ao `XtreamImportStatus`) para
  decidir "cache válido" vs "re-baixar".
- **Prioridade: P0** — evita carga redundante e torna o resync o gatilho
  explícito.

---

## 7. URL de stream por `allowed_output_formats`

- **O que é:** construir a URL de reprodução (`/live/{u}/{p}/{id}.{fmt}`,
  `/movie/...`, `/series/...`) usando os formatos anunciados pela conta.
- **Onde está no IPTVnator:** `libs/portal/xtream/data-access/src/lib/services/xtream-url.service.ts`
  (`constructLiveUrl`, `constructVodUrl`, `constructEpisodeUrl`,
  `resolveLiveStreamFormat`).
- **Por que reutilizar:** o CCPlay hoje monta `output=m3u8` fixo no
  `build_m3u_url` (só para o catálogo). Na reprodução, o formato precisa vir
  da conta para não falhar.
- **Como adaptar/melhorar:** armazenar `allowed_output_formats` na `Source`
  (ou num campo de conta) e construir as URLs de reprodução no backend,
  conforme `03-apis.md` #6.
- **Prioridade: P0** — reprodução ao vivo é o coração do MVP.

---

## 8. Preservar campos do usuário no re-download (favoritos/histórico)

- **O que é:** ao re-baixar/refresh, os campos do usuário (`favorites`,
  `userAgent`, ids) são **reaplicados** sobre o payload novo, nunca confiados
  ao re-download.
- **Onde está no IPTVnator:** `playlist-source.ts`
  (`preserveAutoUpdatedPlaylistFields`) e seu uso em `playlist-auto-update.ts`.
- **Por que reutilizar:** é o requisito "reimportar não perde favoritos/
  histórico" da ADR-005 §2. O CCPlay separa `UserStateRepository` do snapshot
  (ADR-006 §4.2), mas precisa garantir que o resync reconcilie por chave
  estável e não por posição.
- **Como adaptar/melhorar:** no `_publish_in_batches` do `importer.py`, já
  existe `series_keys` e IDs estáveis — estender para reconciliar favoritos/
  histórico por chave estável (não por ordem de lista) quando um resync
  substituir o catálogo.
- **Prioridade: P0** — favoritos/histórico (itens 9/10 do backlog) dependem
  disso.

---

## 9. Idempotência e dedup de requisição (single-flight)

- **O que é:** uma chave de operação evita criar fontes/jobs duplicados em
  reenvio de rede; requisições em voo para a mesma fonte/tipo são deduplicadas
  (uma promessa compartilhada).
- **Onde está no IPTVnator:** dedup em `electron-xtream-data-source.ts`
  (`categoryRequests`/`contentRequests` Maps) e o `requestId`/`sessionId` no
  transporte. No CCPlay: `create_source_and_job` já é idempotente por
  `request_key` (`api/app/services/importer.py`).
- **Por que reutilizar:** o CCPlay já tem a idempotência de criação; falta a
  dedup de leitura de catálogo (evitar dois GETs iguais em paralelo quando a
  TV e um refresh pedirem ao mesmo tempo).
- **Como adaptar/melhorar:** no backend, cachear promises em voo por
  `(source_id, tipo)` (equivalente ao `single-flight`), e manter `request_key`
  como chave de idempotência.
- **Prioridade: P1** — quando múltiplos clientes/requisições concorrerem.

---

## 10. Refresh com concorrência limitada e isolamento de falha

- **O que é:** ao atualizar várias fontes, limitar a concorrência (ex.: 3) e
  isolar falhas — uma fonte morta não segura as demais; cada uma tem um
  outcome (`updated`/`failed`/`skipped`).
- **Onde está no IPTVnator:** `apps/electron-backend/src/app/events/playlist-auto-update.ts`
  (`AUTO_UPDATE_CONCURRENCY = 3`, `autoUpdatePlaylists` com `statuses[index]`).
- **Por que reutilizar:** quando o CCPlay tiver múltiplas fontes (item 12 do
  backlog), o auto-refresh de várias fontes no startup precisa exatamente
  desse comportamento para não travar com um host silencioso.
- **Como adaptar/melhorar:** no backend, substituir o loop sequencial de
  resync por um pool com concurrency limitada e outcome por fonte, expondo o
  resultado na API.
- **Prioridade: P1** — com múltiplas fontes simultâneas.

---

## 11. Cancelamento cooperativo com `operationId`

- **O que é:** uma identidade estável cruza UI/API/worker para reportar
  progresso e cancelar; cancelamento é cooperativo em checkpoints de lote.
- **Onde está no IPTVnator:** `docs/architecture/sqlite-db-worker.md`
  (`operationId` vs `requestId`) e `playlist-refresh.worker.ts`. No CCPlay:
  `POST /import-jobs/{id}/cancel` marca `cancel_requested_at` e o importer
  checa entre lotes (`_publish_in_batches`).
- **Por que reutilizar:** o CCPlay já tem cancelamento cooperativo por lote.
  A lacuna é a **execução**: com `BackgroundTasks`, um job cancelado continua
  consumindo o processo do FastAPI. O IPTVnator isola em worker.
- **Como adaptar/melhorar:** mover a execução para um worker durável (item 21
  do backlog) mantendo o `ImportJob.id` como `operationId` público, e
  preservar o checagem de `cancel_requested_at` por lote.
- **Prioridade: P1** — junto com o worker durável.

---

## 12. Restore de dados do usuário após reimportação

- **O que é:** ao substituir um catálogo, o estado do usuário (favoritos,
  progresso) é restaurado num passo explícito pós-import, com "pending state"
  que bloqueia o cache até o restore consumir.
- **Onde está no IPTVnator:** `with-content.feature.ts`
  (`pendingRestoreService`, `restoreUserData`, `isPendingRestoreBlocked`) e
  `electron-xtream-data-source.ts` (`restoreUserData`).
- **Por que reutilizar:** é a versão sofisticada do item 8 — em vez de só
  reaplicar campos, mantém um snapshot pendente até a reconciliação terminar,
  para nunca expor um catálogo sem os favoritos do usuário.
- **Como adaptar/melhorar:** quando o CCPlay implementar resync com múltiplas
  fontes, criar um "pending restore" por fonte (ou usar o `UserStateRepository`
  separado e restaurar após `_publish_in_batches`), sem expor o catálogo novo
  antes da reconciliação.
- **Prioridade: P1** — quando favoritos/histórico + resync coexistirem.
