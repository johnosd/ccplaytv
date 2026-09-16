# 03 — Reuso de APIs e Integrações

Escopo: contratos, algoritmos e regras de integração do IPTVnator
reaproveitáveis no backend Python/FastAPI do CCPlay — parsing M3U, Xtream
Codes, Stalker, TMDB e segurança de rede (SSRF/redação). Este é o relatório
com maior densidade de conteúdo diretamente traduzível para código.

## Tabela-resumo

| # | Item | Prioridade |
| --- | --- | --- |
| 1 | Deltas do parser M3U (radio, strip de pipe, KODIPROP) | P0 |
| 2 | Detecção de manifesto HLS antes de classificar | P0 |
| 3 | Normalização de URL de servidor Xtream | P0 |
| 4 | Resolução de status de conta Xtream (fallback de actions) | P0 |
| 5 | User-Agent de player (VLC) para contornar WAF | P0 |
| 6 | `allowed_output_formats` e URL de stream por formato | P0 |
| 7 | Classificação de conta Xtream com expiração | P1 |
| 8 | Catch-up: variantes de URL + probe e preferência TS/HLS | P1 |
| 9 | Stalker: modo por comportamento observado, não por URL | P1 |
| 10 | Stalker EPG: bulk (`get_epg_info`) + fallback (`get_short_epg`) | P1 |
| 11 | TMDB: match confidence conservador (id é dica, não verdade) | P1 |
| 12 | TMDB: merge por campo, provider autoritativo | P1 |
| 13 | TMDB: fallback de idioma original (títulos não-latinos) | P1 |
| 14 | TMDB: retenção de cache conforme ToS (6 meses) | P2 |
| 15 | SSRF: validação por hop + limite de tamanho/redirecionamento | P0 |
| 16 | Redação de credenciais em logs e erros | P0 |

---

## 1. Deltas do parser M3U (radio, strip de pipe, KODIPROP)

- **O que é:** três deltas de um fork do `iptv-playlist-parser` que o
  IPTVnator considera contratuais: o atributo `radio` (string `'true'`),
  o corte da URL no primeiro `|` (com `|User-Agent=`/`|Referer=` indo para
  headers) e a preservação de linhas `#KODIPROP` antes de `#EXTINF`.
- **Onde está no IPTVnator:** `docs/architecture/m3u-playlist-module.md`
  ("M3U Parsing — iptv-playlist-parser fork"); parser fork pinado por SHA em
  `package.json`; contrato guardado por
  `apps/web/src/app/iptv-playlist-parser.contract.spec.ts`.
- **Por que reutilizar:** o CCPlay usa `m3u-ipytv` (ADR-006 §3). Os três
  deltas representam realidades de listas IPTV reais: `radio` para separar
  rádio, `|` para separar URL de headers de playback, e `#KODIPROP` para DRM
  (ClearKey). Sem eles, listas reais quebram de forma sutil.
- **Como adaptar/melhorar:** no `api/app/services/m3u_parser.py`, garantir que
  `m3u-ipytv` preserva (ou o CCPlay extrai) `radio`, o sufixo `|User-Agent=`
  e as linhas `#KODIPROP`; hoje `ParsedEntry.attributes` é um dict genérico —
  avaliar se já captura esses atributos. Adicionar teste de contrato
  equivalente ao `.contract.spec.ts`.
- **Prioridade: P0** — o parser é a base da importação (item 1 do backlog).

---

## 2. Detecção de manifesto HLS antes de classificar

- **O que é:** um manifesto de streaming HLS reutiliza `#EXTM3U`, mas só as
  tags de segmento/variante (`#EXT-X-STREAM-INF`, `TARGETDURATION`,
  `MEDIA-SEQUENCE`, etc.) o identificam — nunca `#EXT-X-SESSION-DATA` sozinha
  (painéis injetam isso em catálogos comuns).
- **Onde está no IPTVnator:** conceito equivalente no cuidado de parser (o
  IPTVnator não importa manifestos como catálogo). No CCPlay já está
  implementado: `api/app/services/m3u_parser.py` (`is_hls_manifest`,
  `_HLS_TAG_PATTERN`, `HLSManifestDetectedError`).
- **Por que reutilizar:** o CCPlay já acertou, e o IPTVnator reforça o mesmo
  raciocínio de falso positivo. É um item de "o CCPlay já faz bem" — manter.
- **Como adaptar/melhorar:** manter a lista de tags revisada por fonte real e
  testar contra a amostra do provedor do usuário (o comentário do código já
  documenta o caso `com.xui.1_5_5r2`).
- **Prioridade: P0** — já feito; item de conformidade contínua.

---

## 3. Normalização de URL de servidor Xtream

- **O que é:** regras para reduzir qualquer URL de entrada (base, `get.php`,
  `player_api.php`, `panel_api.php`) a uma base normalizada, preservando
  subpath do provedor e rejeitando credenciais embutidas na URL.
- **Onde está no IPTVnator:** `docs/architecture/xtream-portal-compatibility.md`
  ("Connection Input", `normalizeXtreamServerUrl` em
  `@iptvnator/shared/interfaces`).
- **Por que reutilizar:** o CCPlay hoje só monta a URL `get.php` a partir de
  DNS/usuário/senha (`api/app/services/provider_connector.py` `build_m3u_url`).
  Quando avançar para o conector Xtream completo (item 1 do backlog — credenciais
  de provedor), normalizar a entrada do usuário (que pode colar uma URL
  completa) evita URLs duplicadas e erros de autenticação.
- **Como adaptar/melhorar:** criar `normalize_xtream_server_url()` em Python
  no `provider_connector.py`, seguindo as 6 regras do IPTVnator; manter
  credenciais em campos separados (nunca na URL armazenada).
- **Prioridade: P0** — necessário para o conector de provedor do MVP.

---

## 4. Resolução de status de conta Xtream (fallback de actions)

- **O que é:** alguns painéis não respondem a `action=get_account_info`;
  o IPTVnator tenta na ordem `get_account_info` → sem `action` →
  `get_profile`, com regras de `auth` (`1`/`'1'`/`true` = ativo) e `exp_date`.
- **Onde está no IPTVnator:** `docs/architecture/xtream-portal-compatibility.md`
  ("Account Status", `resolveXtreamPortalStatus`).
- **Por que reutilizar:** painéis "compatíveis com Xtream" divergem na
  prática. Sem o fallback de actions, uma conta válida aparece como inválida.
- **Como adaptar/melhorar:** implementar `resolve_xtream_portal_status()` no
  backend CCPlay com a mesma ordem de fallback e as mesmas regras de
  interpretação de `auth`/`exp_date`.
- **Prioridade: P0** — faz parte de "provedor por credenciais" do MVP.

---

## 5. User-Agent de player (VLC) para contornar WAF

- **O que é:** painéis atrás de WAF (Cloudflare etc.) bloqueiam clientes
  genéricos, mas liberam assinaturas de player conhecidas (VLC). Usar um
  User-Agent de player evita a página de desafio.
- **Onde está no IPTVnator:** `docs/architecture/xtream-portal-compatibility.md`
  ("User-Agent", `XTREAM_CLIENT_USER_AGENT`); o CCPlay já faz isso em
  `api/app/services/ssrf_guard.py` (`_DEFAULT_HEADERS` = VLC).
- **Por que reutilizar:** o CCPlay já acertou; o IPTVnator confirma que é
  preciso em **todos** os pontos de requisição (API, download, refresh), não
  só no primeiro.
- **Como adaptar/melhorar:** garantir que o header VLC seja aplicado a todas
  as chamadas do provedor (não só `fetch_text_ssrf_safe`), e permitir
  User-Agent por playlist (o IPTVnator suporta override por fonte).
- **Prioridade: P0** — já parcialmente feito; completar cobertura.

---

## 6. `allowed_output_formats` e URL de stream por formato

- **O que é:** usar `user_info.allowed_output_formats` da conta para escolher
  o formato de stream (`auto` → `m3u8` quando HLS permitido, senão `ts`,
  senão o primeiro formato anunciado); manual `ts`/`m3u8` cai para o primeiro
  formato permitido quando o escolhido não é aceito.
- **Onde está no IPTVnator:** `docs/architecture/xtream-portal-compatibility.md`
  ("Playback URL Formats").
- **Por que reutilizar:** a URL de reprodução Xtream é construída por formato;
  escolher um formato que o painel não permite gera falha de stream que o
  usuário não consegue diagnosticar.
- **Como adaptar/melhorar:** no `provider_connector.py`, armazenar
  `allowed_output_formats` da conta e construir a URL de live com o formato
  certo, respeitando preferência do usuário.
- **Prioridade: P0** — reprodução ao vivo é o coração do MVP.

---

## 7. Classificação de conta Xtream com expiração

- **O que é:** uma conta "ativa" com `exp_date` no passado é tratada como
  expirada; `exp_date` 0/negativo/ausente/inválido é "sem expiração".
- **Onde está no IPTVnator:** `docs/architecture/xtream-portal-compatibility.md`
  ("Account Status", regras 4 e 5).
- **Por que reutilizar:** evita oferecer reprodução de uma conta expirada e
  permite feedback antecipado ao usuário ("conta expirou em X").
- **Como adaptar/melhorar:** incorporar à função de status (item 4) e expor
  na resposta da API de status da fonte.
- **Prioridade: P1** — depois do fluxo básico de provedor funcionar.

---

## 8. Catch-up: variantes de URL + probe e preferência TS/HLS

- **O que é:** dois formatos de catch-up (REST `/timeshift/...` e legado
  `/streaming/timeshift.php?...`); o IPTVnator faz probe concreto e cacheia a
  variante por playlist + `allowed_output_formats`, preferindo TS antes de HLS.
- **Onde está no IPTVnator:** `docs/architecture/xtream-portal-compatibility.md`
  ("Catch-Up Playback URLs").
- **Por que reutilizar:** catch-up/timeshift está no backlog do CCPlay como
  "a avaliar" (item 24). Quando decidir fazer, as variantes e o probe são o
  roteiro pronto.
- **Como adaptar/melhorar:** implementar o probe no backend (GET curto,
  aceitar só 200/206) e cachear a variante vencedora por fonte; manter a
  preferência TS→HLS documentada.
- **Prioridade: P1** — condicionado à decisão do `sdd-assess` do item 24.

---

## 9. Stalker: modo por comportamento observado, não por URL

- **O que é:** portal "full" vs "simple" é decidido pelo comportamento
  observado (handshake + token vs. respostas sem token), nunca pela forma da
  URL; um único predicado canônico decide, para evitar três cópias divergentes.
- **Onde está no IPTVnator:** `docs/architecture/stalker-portal.md`
  ("Portal Mode and Endpoint Discovery", `isFullStalkerPortalPlaylist()` em
  `libs/shared/interfaces/src/lib/stalker-portal-mode.util.ts`).
- **Por que reutilizar:** o CCPlay trata Stalker como "a avaliar" (item 22).
  O IPTVnator documenta o erro caro de repetir a regra em três lugares e o
  custo de classificar por URL. É a decisão mais valiosa para quando o CCPlay
  entrar nesse conector.
- **Como adaptar/melhorar:** se o CCPlay implementar Stalker, ter um único
  `is_full_stalker_portal()` no backend e usar discovery por probe
  (candidatos em ordem), nunca substring de URL.
- **Prioridade: P1** — condicionado à decisão do item 22 do backlog.

---

## 10. Stalker EPG: bulk (`get_epg_info`) + fallback (`get_short_epg`)

- **O que é:** carregar uma janela de 7 dias em bulk por playlist
  (`get_epg_info`, chaveado por channel id) e usar `get_short_epg` só como
  fallback para o canal ativo ou previews de linha, mantendo o catálogo barato.
- **Onde está no IPTVnator:** `docs/architecture/stalker-epg.md`
  (arquitetura, mapeamento de campos `time`→`start`, `descr`→`description`).
- **Por que reutilizar:** é o mesmo padrão do EPG XMLTV do CCPlay (bulk por
  fonte + preview sob demanda). O mapeamento de campos Stalker→`EpgItem` é um
  contrato pronto.
- **Como adaptar/melhorar:** se o CCPlay tiver Stalker, reusar o mapeamento e
  a estratégia "bulk primeiro, short como fallback" para o EPG do conector.
- **Prioridade: P1** — condicionado ao Stalker + EPG (itens 22/23).

---

## 11. TMDB: match confidence conservador (id é dica, não verdade)

- **O que é:** um `tmdb_id` vindo do provedor é uma dica forte, mas é pesado
  contra o item (`assessProviderId`): título **ou** ano compatível → usa;
  anos incompatíveis → id "contradito", busca por título assume; 404 marca o
  id como morto (`badProviderId:<id>`). Sem id, busca normalizada com gate de
  ano ±1 e título exato.
- **Onde está no IPTVnator:** `docs/architecture/tmdb-metadata-enrichment.md`
  ("Match Confidence") e `libs/services/src/lib/tmdb/tmdb-matcher.ts`.
- **Por que reutilizar:** "metadado errado é pior que sem metadado" é a
  regra de ouro do enriquecimento. O CCPlay planeja TMDB (ADR-001/005); os
  defeitos documentados no `tmdb-roadmap.md` (A1: id quebrado suprime o
  enriquecimento) mostram exatamente onde começar.
- **Como adaptar/melhorar:** implementar `assess_provider_id` e o gate de
  ano no conector TMDB Python do CCPlay, e **já nascer com** o fix do A1
  (404 → busca por título) e do A2 (séries usam `aggregate_credits`).
- **Prioridade: P1** — enriquecimento TMDB é pós-MVP (item 16/17 do backlog).

---

## 12. TMDB: merge por campo, provider autoritativo

- **O que é:** a informação do provedor (streams, campos que o TMDB não
  preenche) permanece autoritativa; o TMDB preenche só o que falta, por campo,
  via merge puro (sem mutação).
- **Onde está no IPTVnator:** `docs/architecture/tmdb-metadata-enrichment.md`
  ("Summary" e `libs/services/src/lib/tmdb/tmdb-merge.ts`).
- **Por que reutilizar:** evita que o TMDB sobrescreva título de stream,
  duração, ou URL do provedor. É um contrato simples e crucial para o CCPlay.
- **Como adaptar/melhorar:** no backend CCPlay, aplicar merge field-level ao
  enriquecer o `CatalogItem`; nunca substituir dados do provedor por dados
  TMDB quando o provedor tem valor.
- **Prioridade: P1** — junto com o item 11.

---

## 13. TMDB: fallback de idioma original (títulos não-latinos)

- **O que é:** busca de títulos cirílicos com `ru-RU` (ou idioma da base) e
  refetch no `original_language` quando o payload no idioma do app não traz
  overview/trailer.
- **Onde está no IPTVnator:** `docs/architecture/tmdb-metadata-enrichment.md`
  ("Non-Latin titles", "tmdb-language-fallback.ts") e
  `libs/services/src/lib/tmdb/tmdb-language-fallback.ts`.
- **Por que reutilizar:** o catálogo do usuário do CCPlay tem conteúdo
  regional. Sem o fallback, títulos em russo/árabe ficam sem sinopse.
- **Como adaptar/melhorar:** implementar detecção de alfabeto não-latino na
  busca TMDB do CCPlay e o refetch de idioma original para overview/trailer.
- **Prioridade: P1** — junto com o enriquecimento TMDB.

---

## 14. TMDB: retenção de cache conforme ToS (6 meses)

- **O que é:** o cache TMDB deve expirar em no máximo 6 meses (ToS), com um
  sweeper e botão de purga; hoje o IPTVnator identifica isso como gap de
  conformidade em código publicado (F1).
- **Onde está no IPTVnator:** `docs/architecture/tmdb-roadmap.md` (F1,
  §4 "cache retention sweep") e `fetched_at` no schema.
- **Por que reutilizar:** o CCPlay pretende cachear TMDB (ADR-005/006). A
  lição do IPTVnator: cachear sem TTL é violar ToS e criar linha órfã.
- **Como adaptar/melhorar:** nascer com `fetched_at` no modelo de cache TMDB
  do CCPlay e um job/consulta de expiração de 6 meses + botão de limpeza.
- **Prioridade: P2** — quando o cache TMDB existir.

---

## 15. SSRF: validação por hop + limite de tamanho/redirecionamento

- **O que é:** validar o destino (resolução DNS, bloqueio de loopback/
  privado/link-local/metadata) na URL inicial **e a cada redirecionamento**,
  com limite de tamanho, timeout e número de hops.
- **Onde está no IPTVnator:** `docs/architecture/pwa-self-hosted.md` e
  `docs/architecture/host-connectivity-guard.md` (política de redirect/dns).
  No CCPlay já implementado em `api/app/services/ssrf_guard.py`
  (`validate_url`, `validate_host`, `fetch_text_ssrf_safe`).
- **Por que reutilizar:** o CCPlay já segue a orientação OWASP e o IPTVnator
  faz o mesmo. O detalhe do IPTVnator que falta conferir: **não permitir que
  o downloader seja usado como atalho que ignora a política**.
- **Como adaptar/melhorar:** manter; garantir que TODA aquisição externa
  (M3U, provedor, TMDB) passe pela mesma política e que o User-Agent de
  player não dependa do cliente default do httpx em caminhos novos.
- **Prioridade: P0** — já feito; conformidade contínua (ADR-004 §7).

---

## 16. Redação de credenciais em logs e erros

- **O que é:** URLs de playlist carregam credenciais na query string; logs e
  mensagens de erro devem redigir tudo, e nunca interpolar `str(exc)` que
  embute a URL.
- **Onde está no IPTVnator:** `@iptvnator/shared/logging`
  (`redactSensitiveData`) e regras em `m3u-playlist-module.md`
  ("refresh logging goes through redactSensitiveData"). No CCPlay já
  implementado: `api/app/services/importer.py` evita interpolar `str(exc)`
  e o `ssrf_guard.py` redige.
- **Por que reutilizar:** vazamento de credencial em log é o erro de
  segurança mais comum nesse domínio. O CCPlay já tem o cuidado; o IPTVnator
  mostra a forma canônica (uma função de redação central).
- **Como adaptar/melhorar:** criar `redact_sensitive_data()` central no
  backend CCPlay e aplicá-la em qualquer log de requisição; manter a regra de
  nunca interpolar exceções do httpx (que embutem URL).
- **Prioridade: P0** — já parcialmente feito; consolidar em um helper único.
