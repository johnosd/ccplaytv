# Research — 058 Headers da lista no AVPlay e catch-up Xtream

Sondagens feitas no `sdd-plan` (2026-10-04) contra a lista do `.env`
(`CCPLAY_PROBE_*`), do PC, sem imprimir credencial nem URL. Scripts
descartáveis no scratchpad da sessão — não versionados.

## R1. Como o AVPlay recebe headers de requisição

- **Decisão**: `webapis.avplay.setStreamingProperty('USER_AGENT', valor)`
  chamado **depois de `open()` e antes de `prepareAsync()`** (estado IDLE). Para
  `Referer` não há propriedade documentada na referência pública do AVPlay que
  consultamos; o adaptador só tenta propriedades que a passada na TV (T003)
  confirmar, e qualquer propriedade que lance conta como **recusada**.
- **Justificativa**: é a única via documentada; chamar fora do estado IDLE
  lança `InvalidStateError`. O resultado (aceito/recusado) é o que alimenta o
  FR-004 e o "Info do stream" (FR-005).
- **Não provado**: nem o `USER_AGENT` foi visto chegando ao servidor nesta TV.
  O "spike de header do item 58" citado no backlog não deixou evidência
  escrita (o 58 foi uma passada geral na TV). **T003 é gate da Fase 2**: servidor
  local na LAN que registra os headers recebidos + TV física.
- **Alternativas rejeitadas**: sufixo `|User-Agent=…` na URL (o AVPlay não
  documenta, e a URL com sufixo é exatamente o que a 044 limpou); proxy local
  (viola Direct Play e ADR-008); `COOKIE` como transporte de Referer (semântica
  errada, o servidor não lê).

## R2. Arquivo no painel Xtream — o que a lista real declara

- `player_api.php` (auth) devolve `server_info` com `timezone`
  (`America/Sao_Paulo`), `time_now` (`AAAA-MM-DD HH:MM:SS`, relógio do painel) e
  `timestamp_now` (epoch s). Deslocamento medido: −180 min.
- `get_live_streams`: 2 360 canais; **75 com `tv_archive = 1`**, todos com
  `tv_archive_duration = 7` (dias); 70 deles com `epg_channel_id`. Campos do
  canal: `num,name,stream_type,stream_id,stream_icon,epg_channel_id,added,
  custom_sid,tv_archive,direct_source,tv_archive_duration,category_id,
  category_ids,thumbnail`.
- `get_simple_data_table&stream_id=…`: 194 programas, 174 com `has_archive = 1`;
  `start` vem no relógio do painel (`AAAA-MM-DD HH:MM:SS`) e `start_timestamp`
  em epoch s — confirma que o painel pensa no próprio fuso.
- **Decisão**: `tv_archive`/`tv_archive_duration` viram `archiveDays` no
  registro do canal (FR-007). O EPG que o Guia usa continua sendo o da 030
  (XMLTV); `get_simple_data_table`/`has_archive` **não** é usado (seria uma
  segunda fonte de programação, e a regra de disponibilidade fica pelos dias
  declarados — FR-008).

## R3. As duas variantes de URL e o 404 da lista real

- **REST**: `{base}/timeshift/{user}/{pass}/{duração_min}/{AAAA-MM-DD:HH-MM}/{stream_id}.{ext}`
- **Legado**: `{base}/streaming/timeshift.php?username=…&password=…&stream={id}&start={AAAA-MM-DD:HH-MM}&duration={min}`
- **Achado**: para 4 canais com arquivo e programas de 1,5 h a 5 dias atrás,
  as duas variantes respondem **404** (REST direto; o legado redireciona 302
  para `…/stream/auth.php?type=timeshift…` e esse responde 404), com o início
  no fuso do painel e também em UTC, `.ts` e `.m3u8`. O ao vivo do mesmo canal
  (`/live/…/71775.ts` → 302 → `video/mp2t`, primeiro byte `0x47`) toca.
- **Consequência (decisão do usuário)**: catch-up mantido; aceite automático
  com painel falso; TV com a lista real = "não testado" + exercita o erro
  acionável (FR-017). Registrado em `spec.md` → Clarifications.

## R4. Qual variante usar — sondagem pelo próprio player

- **Decisão**: a "sondagem" é a abertura do player: tenta a variante lembrada
  para a fonte (ou `rest` primeiro); se a sessão falhar **antes de tocar**,
  abre a outra; a que tocou é gravada na fonte (`archiveVariant`). As duas
  falharam = erro `PLAY-06` (FR-017), sem marcar nada como indisponível.
- **Justificativa**: o app roda em `file://`; um `fetch` ao painel de vídeo
  sem CORS devolve resposta opaca (sem status), então um "probe" HTTP não
  distingue 200 de 404. O motor é o único juiz confiável — e é o que importa.
- **Alternativa rejeitada**: probe por `fetch` com `mode: 'no-cors'` (opaco);
  probe pelo backend `api/` (congelado, ADR-008).

## R5. Fuso do painel

- **Decisão**: guardar na fonte o `timezone` e o deslocamento medido
  (`time_now` − `timestamp_now`, arredondado a 15 min) quando a conta é
  verificada (sincronização e consulta leve da 034). Na montagem da URL, o fuso
  nomeado vence (via `Intl.DateTimeFormat` com `timeZone`, que acerta horário de
  verão de uma data passada); se o `Intl` recusar o nome, vale o deslocamento;
  sem nenhum dos dois, não há URL (`ArchiveClockUnknownError`).
- **Risco**: `Intl` com fuso nomeado no Chromium 120 do Tizen — esperado (ICU
  completo no Chromium), não provado na TV → coberto pela T003.

## R6. Busca dentro do arquivo

- **Decisão**: mesma superfície do VOD (`jumpBy`/`seekTo` do motor, porta
  single-flight da 011) sobre a URL do programa inteiro; a duração exibida e
  os limites vêm do EPG (`PlayerTimeline`). Não há "busca por reabertura".
- **Não provado**: se o AVPlay busca num TS progressivo de timeshift (depende
  de o servidor aceitar `Range`). A T014 testa com o painel falso na LAN servindo
  o TS com e sem `Range` (pelo caminho de VOD que já existe). **Se o motor não buscar sem `Range`**, a Fase 3 para e
  volta ao `sdd-plan` (R-003): busca por reabertura no minuto exige outro desenho
  de controles (±1 min), não um remendo.
