---
description: "Tasks da feature 058 — headers da lista no AVPlay e catch-up Xtream"
---

# Tasks: Headers da lista no AVPlay e catch-up de programas passados (Xtream)

**Input**: Documentos de design de `sdd/specs/058-headers-avplay-catchup/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, logic/headers.md, logic/arquivo.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Tudo em `tv-web/` (client-first, ADR-008); `api/` não é tocado.
- Regras puras em `tv-web/src/lib/` (`player/`, `catalog/`, `epg/`, `errors/`); telas em `tv-web/src/features/`; camada de reprodução em `tv-web/src/components/` e `tv-web/src/components/player/`.
- Textos em `tv-web/src/lib/i18n/messages/<área>.ts`, sempre pt/en/es.
- Testes ao lado do arquivo (`*.test.ts` = projeto `node`; `*.test.tsx` ou `.ts` listado em `TESTES_TS_COM_DOM` = projeto `dom`). E2E em `tv-web/e2e/`.
- Contratos travados: `*.headers-avplay-catchup.contract.test.*` — nunca editar.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: o servidor de teste que serve as duas metades da feature — usado pelos gates na TV (T003, T014) e pelo E2E (T037).

- [X] T001 [P] Servidor de teste em `tv-web/e2e/lib/servidorHeadersArquivo.mjs` (`http.createServer`, como `e2e/fontes-estado.mjs`), exportando `iniciarServidor({ host, range, phpResponde })` e executável direto (`node e2e/lib/servidorHeadersArquivo.mjs --lan` = `0.0.0.0`, imprime só host:porta). Serve: (a) `/lista.m3u` com `Canal Header` (`…/video/header.ts|User-Agent=CCPlayTeste/1.0&Referer=http://ccplay.invalid/`) e `Canal Livre` (`…/video/livre.ts`); `/video/header.ts` responde 403 sem `User-Agent: CCPlayTeste/1.0`; os vídeos são `e2e/fixtures/canal-teste.mpegts`; (b) painel Xtream falso: `player_api.php` (auth com `user_info` + `server_info.timezone = 'America/Sao_Paulo'`, `time_now`/`timestamp_now` coerentes com o relógio da máquina), `get_live_categories`, `get_live_streams` (`Canal Arquivo` com `tv_archive: 1, tv_archive_duration: 3`; `Canal Sem Arquivo` com `tv_archive: 0`; ambos com `epg_channel_id`), `get_vod_streams` com um filme `.ts` (para o gate de busca T014), `get_vod_categories`/`get_series*` vazios; `xmltv.php` com programas de −6 h a +2 h de 30 em 30 min; `/live/…` e `/movie/…` servem o TS; `/timeshift/{u}/{p}/{dur}/{start}/{id}.ts` serve o TS (com `Accept-Ranges`/206 só se `range`); `/streaming/timeshift.php` responde 404 salvo `phpResponde`. (c) `GET /_registro` devolve, em JSON, os headers `user-agent`/`referer` e a rota (sem query) de cada pedido de vídeo — só no servidor de teste, nunca no app.

**Checkpoint**: servidor sobe local e na LAN; `curl` no `/_registro` mostra os pedidos.

**Registro da Fase**:

- Status: concluída (2026-10-04)
- Feito: `tv-web/e2e/lib/servidorHeadersArquivo.mjs` — lista M3U (`Canal Header`, `Canal Livre` e, pela pendência A1 do Analyze, `Filme Header (2024)` com o mesmo header); painel Xtream falso (`server_info.timezone`/`time_now`/`timestamp_now`, `Canal Arquivo` 3 dias, `Canal Sem Arquivo`, `Filme Busca (2024)` `.ts`, `xmltv.php` −6 h…+2 h); `/timeshift/…` (desligável por `restResponde`), `/streaming/timeshift.php` (404 salvo `phpResponde`); `Range`/206 desligável (`range`, `--sem-range`); `configurar()` muda o comportamento em tempo de execução; `/_registro` com rota sem query + `user-agent`/`referer`/`range`.
- Contrato: sem contrato nesta fase.
- Testes executados: script de fumaça no scratchpad (`fetch` contra o servidor): lista 7 linhas; header sem UA → 403, com UA → 200 (canal e filme); `Range: bytes=100-199` → 206 com 100 bytes; auth com fuso e `time_now`; 2 canais; 32 programas; REST 200, PHP 404; sem `Range` → 200 sem `Accept-Ranges`; registro com 6 pedidos. `node e2e/lib/servidorHeadersArquivo.mjs --lan` imprime só `host:porta` de cada IPv4 da LAN.
- Pendências: nenhuma.

---

## Phase 2: User Story 1 - Item de lista M3U que exige headers toca na TV (Priority: P1) 🎯 MVP

**Objetivo**: os headers declarados pela lista chegam ao motor; recusa + falha vira `PLAY-05`; "Info do stream" mostra os nomes.

**Independent Test**: Cenário A do `quickstart.md` (navegador: erro `PLAY-05`) e T003 (TV: o servidor registra o `User-Agent`).

### Contrato da Fase

- `aplica o User-Agent entre open e prepareAsync, informa o recusado, e a abertura seguinte sem headers não aplica nada` — US1-AC1/AC4/AC6; FR-001, FR-003, FR-004
- `headers do item chegam ao motor; falha com header recusado explica o header sem mostrar o valor; sem headers, o erro é o de sempre` — US1-AC1/AC3/AC4; FR-001, FR-002, FR-004, FR-006
- Comando (em `tv-web/`): `npx vitest run src/lib/player/avplayAdapter.headers-avplay-catchup.contract.test.ts src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx -t "header"`

### Implementation

- [X] T002 [US1] `applyHeaders` + `requestHeadersReport` no `tv-web/src/lib/player/avplayAdapter.ts` (`logic/headers.md` §1): `setStreamingProperty` depois de `open`, antes de `prepareAsync`; `PROPERTY_OF['Referer'] = undefined` até a T003 provar uma propriedade; erro do motor nunca repassado; `open` sem headers zera o relatório → contrato: `aplica o User-Agent entre open e prepareAsync…`
- [ ] T003 [US1] **Gate na TV (R-001, R-005)** — skill `tizen-tv` com o build da T002 e `node e2e/lib/servidorHeadersArquivo.mjs --lan`; adicionar a lista `/lista.m3u` (endereço da LAN) na TV e abrir `Canal Header`. Conferir em `/_registro`: (1) chegou `User-Agent: CCPlayTeste/1.0`? (2) `Referer` chegou por alguma propriedade **documentada** pela Samsung (testar e anotar quais lançaram); (3) `Canal Livre` aberto depois **não** leva o UA anterior; (4) pelo Web Inspector, `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hour: '2-digit' }).format(Date.now())` funciona. Registrar em `plan.md` → R-001/R-005. **Se (1) falhar: parar e voltar ao `sdd-plan`.** Se (2) achar propriedade, preencher `PROPERTY_OF['Referer']`.
- [X] T004 [P] [US1] `requestHeadersReport` no `tv-web/src/lib/player/htmlVideoAdapter.ts`: todos os nomes declarados em `refused`, nunca define nada (`logic/headers.md` §2)
- [X] T005 [US1] Sessão em `tv-web/src/lib/player/PlayerService.ts`: `options.headers` → `adapter.open(…, headers)`; `requestHeaders` atribuído no construtor a partir de `adapter.requestHeadersReport?.()` (sem o método = tudo recusado) — remove o campo-stub (`logic/headers.md` §3)
- [X] T006 [US1] `fetchPlayback` em `tv-web/src/features/catalog/catalogApi.ts` preenche `headers` com `record.playbackHeaders` (só quando existir; `data-model.md` §3) — remover a nota "STUB" do campo
- [X] T007 [US1] `tv-web/src/components/player/usePlayerSession.ts`: passa `headers: playback.headers` a `createPlayerSession`; no ramo de erro, `headersNotSent: session.requestHeaders.refused.length > 0` na entrada do diagnóstico (`logic/headers.md` §4) → contrato: `headers do item chegam ao motor…`
- [X] T008 [P] [US1] `PLAY-05` em `tv-web/src/lib/player/playbackDiagnosis.ts` (campo opcional `headersNotSent`, ordem do D-004), `tv-web/src/lib/errors/errorCatalog.ts` (`ErrorCode`, `RETRYABLE: false`) e `tv-web/src/lib/i18n/messages/errors.ts` (pt/en/es, textos de `logic/headers.md` §5) → contrato: `headers do item chegam ao motor…`
- [X] T009 [P] [US1] Linha "Headers da lista" no Info do stream: `buildInfoRows(…, headers?)` em `tv-web/src/components/playerPanels.ts`, prop em `tv-web/src/components/PlayerInfoPanel.tsx`, `PlayerLayer.tsx` passa `session.requestHeaders` (pelo `panelInfoRef` de `usePlayerPanels.ts`, lido em pontos discretos como a 029); chaves `player.info.headers`/`player.info.headersRefused` em `tv-web/src/lib/i18n/messages/playerUi.ts` (FR-005)

### Testes da Fase

- [X] T010 [P] [US1] `tv-web/src/lib/player/avplayAdapter.test.ts`: motor sem `setStreamingProperty` → tudo recusado; propriedade que lança → recusado e `onError` não chamado; valor nunca aparece em `callbacks.onError`
- [X] T011 [P] [US1] `tv-web/src/lib/player/playbackDiagnosis.test.ts`: `PLAY-02` vence `headersNotSent`; offline vence; conta recusada vence; sem `headersNotSent` nada muda
- [X] T012 [P] [US1] `tv-web/src/components/playerPanels.test.ts` (ou o arquivo de testes de painéis existente): linha só com nomes, "não enviados" com recusados, sem linha sem headers
- [X] T013 [P] [US1] `tv-web/src/lib/player/htmlVideoAdapter.test.ts`: relatório com tudo recusado

**Critério de Conclusão**: comando do Contrato da Fase → 2/2 verdes e `check-contract-tests.ps1 -Slug 058-headers-avplay-catchup` íntegro; T003 registrada com o `User-Agent` chegando ao servidor; `npx tsc -b`, `npm run lint` e `npx vitest run src/lib/player src/components src/lib/errors` verdes; travas de 027/029/041/042 íntegras e verdes.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: código concluído (2026-10-04); gate T003 na TV **adiado para o fim por decisão do usuário** (R-009).
- Feito: T002 (`applyHeaders`/`PROPERTY_OF` no `avplayAdapter.ts`, `Referer` sem propriedade = recusado), T004 (`<video>` recusa tudo), T005 (sessão repassa `headers` e lê `requestHeadersReport` no construtor; sem o método = tudo recusado), T006 (`fetchPlayback` devolve `headers` só quando a lista declarou), T007 (`headersNotSent` no diagnóstico), T008 (`PLAY-05` após formato, antes de rede/fonte/desconhecido; `PLAY-05`/`PLAY-06` no `errorCatalog` e em `errors.ts` pt/en/es), T009 (linha "Headers da lista" no Info do stream via `InfoSnapshot.headers`). A ordem foi T002 → T004–T013 antes da T003: sem a fiação item → sessão → motor, o build da T003 não levaria header nenhum à TV.
- Contrato: `npx vitest run src/lib/player/avplayAdapter.headers-avplay-catchup.contract.test.ts src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx -t "header"` → os 2 da fase verdes (o 3º selecionado pelo filtro é o do arquivo, da Fase 3, vermelho pelo motivo esperado); trava íntegra; travas de todas as features `PASS`.
- Testes executados: `npx vitest run src/lib/player src/components/playerPanels src/lib/errors` → 33 arquivos, 237/237; `npx vitest run src/components` → 365/366 (só o contrato do arquivo, Fase 3); `npx tsc -b` exit 0; `npm run lint` exit 0 (só avisos pré-existentes). Testes novos: `avplayAdapter.headers.test.ts`, `htmlVideoAdapter.headers.test.ts`, `playbackDiagnosis.headers.test.ts`, `playerPanels.headers.test.ts`.
- Pendências: **T003 (gate na TV) não executada** — tentativa de deploy parou em "porta 26101 aberta mas recusa o sdb" (Host PC IP da TV ≠ 192.168.0.6); o usuário pediu para deixar o teste na TV para o fim. Até lá, FR-001 está implementado mas **não provado** (R-001 aberto).

---

## Phase 3: User Story 2 - Assistir um programa passado pelo Guia (Priority: P2)

**Objetivo**: canal Xtream com arquivo → Guia marca o passado disponível → OK toca do início, como VOD, com "Ao vivo", sequência e sem histórico.

**Independent Test**: Cenário B (passos 1–5, 7, 8) do `quickstart.md` com o painel falso.

### Contrato da Fase

- `arquivo: toca pela URL de arquivo, mostra "Arquivo" e a duração do EPG, "Ao vivo" chama onGoLive, o fim chama onArchiveEnded e nada vai para o histórico` — US2-AC2/3/4/5; FR-010..FR-013, FR-019
- `disponível só com arquivo, já começado e dentro dos dias; o fim segue para o contíguo, o atual vai ao vivo e lacuna vai ao vivo` — FR-008, FR-013
- `monta as duas variantes no relógio do painel (fuso nomeado com horário de verão, ou deslocamento medido) e recusa sem relógio` — FR-017, FR-020
- Comando (em `tv-web/`): `npx vitest run src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx src/lib/epg/catchup.headers-avplay-catchup.contract.test.ts src/lib/catalog/archiveUrl.headers-avplay-catchup.contract.test.ts`

### Implementation

- [ ] T014 [US2] **Gate na TV (R-003)** — com o servidor da T001 em `--lan` e a fonte Xtream falsa adicionada na TV, abrir o filme `.ts` do painel falso (caminho de VOD que já existe) duas vezes: `range: true` e `range: false`. Conferir ⏩/⏪ e barra. Registrar em `plan.md` → R-003. **Se sem `Range` a busca não funcionar: parar a fase e voltar ao `sdd-plan`** (o timeshift do Xtream é TS progressivo; não remendar com reabertura).
- [X] T015 [P] [US2] `isArchiveAvailable`/`nextArchiveStep` em `tv-web/src/lib/epg/catchup.ts` (`logic/arquivo.md` §1/§5) → contrato: `disponível só com arquivo…`
- [X] T016 [P] [US2] `buildArchiveUrl` em `tv-web/src/lib/catalog/archiveUrl.ts` (`logic/arquivo.md` §2) → contrato: `monta as duas variantes…`
- [X] T017 [P] [US2] `archiveDays` no catálogo (`data-model.md` §1/§2): `mapLiveEntry` em `tv-web/src/lib/catalog/xtreamConnector.ts` (+ `ClassifiedEntry` em `classifier.ts`), `toItemRecord` em `categoryLoader.ts`, caminho eager em `importPipeline.ts`, `CatalogRecord` em `db.ts`, `itemsSignature` em `categoryBlocks.ts` (só quando existe, depois dos campos da 055), `itemOut` em `features/catalog/catalogApi.ts` (`archive_days`)
- [X] T018 [US2] Relógio do painel (`data-model.md` §4/§5): `AccountStatus.clock` lido de `server_info` em `resolveAccountStatus` (`xtreamConnector.ts`); campos `panelTimezone`/`panelUtcOffsetMinutes`/`archiveVariant` em `SourceRecord` (`db.ts`); `markSynced`/`markAccount`/`rememberArchiveVariant` em `sourceRepository.ts`; quem chama `markAccount`/`markSynced` passa o relógio
- [X] T019 [US2] `resolveArchivePlaybackUrl` em `tv-web/src/lib/catalog/playbackUrl.ts` e `fetchArchivePlayback(itemId, program, options?)` em `catalogApi.ts` (`logic/arquivo.md` §3) — 1ª chamada sempre com 2 argumentos; `archive_variant` opcional no retorno; relógio ausente → `refreshPanelClock` (5 s) → senão 409
- [X] T020 [US2] `PlayerTimeline` no `PlayerServiceSession` (`tv-web/src/lib/player/PlayerService.ts`): duração do EPG em `applyProgress`, teto `min(durationMs − 1, maxPositionMs())` nos dois grampos (`logic/arquivo.md` §4)
- [X] T021 [US2] Caminho de arquivo em `tv-web/src/components/player/usePlayerSession.ts` + `PlayerLayer.tsx` (`logic/arquivo.md` §4): prop `archive` (dependências do efeito), `fetchArchivePlayback`, `kind 'archive'` → chrome `vod`, `timeline`, gravador com identidade `null`, fim → `onArchiveEnded`, troca de variante antes da reconexão, `rememberArchiveVariant` no 1º `playing`, `PLAY-06` (diagnóstico + `errorCatalog` + `errors.ts` pt/en/es), `verifyResume` com `fetchArchivePlayback` → contrato: `arquivo: toca pela URL de arquivo…`
- [X] T022 [US2] Chrome do arquivo (`logic/arquivo.md` §6): `goLive` em `tv-web/src/components/chromeControls.ts` (+ `ChromeFeatures.archive`), ícone/texto e prop `archive` (selo "Arquivo", título e horário do programa, sem "AO VIVO") em `PlayerChrome.tsx`, derivada da prop `archive` do `PlayerLayer` — `PlayerIdentity` não muda, `usePlayerChrome.ts` alimenta `archive`, `usePlayerKeyboard.ts` (OK em "Ao vivo" → `onGoLive`; CH± e ↑/↓ com chrome oculto → `onChannelStep` só no arquivo); chaves `player.chrome.goLive`/`player.chrome.archive` em `playerUi.ts`; estilos com tokens em `tv-web/src/styles/` (arquivo do player) → contrato: `arquivo: toca pela URL de arquivo…`
- [X] T023 [US2] Ação `'live'` na tela de erro: `tv-web/src/components/player/playerErrorActions.ts` (só com `onGoLive` e arquivo) + `PlayerLayer.tsx` (FR-017)
- [X] T024 [US2] Guia (`logic/arquivo.md` §8) em `tv-web/src/features/live/guide/EpgGuide.tsx`: props opcionais `onWatchArchive`/`initialProgramStart`, `is-archive` + marcador, ramos do OK (D-013), linha no detalhe; chaves `guide.archiveAvailable`/`guide.archiveExpired`/`guide.archiveHint` em `tv-web/src/lib/i18n/messages/live.ts`; CSS em `tv-web/src/styles/guide.css` com tokens
- [X] T025 [US2] Tela (`logic/arquivo.md` §7): novo `tv-web/src/features/live/useLiveArchive.ts`; `LiveScreen.tsx` passa `archive`/`onArchiveEnded`/`onGoLive` e trata RETURN; `useLiveGuide.tsx` liga `onWatchArchive` e reabre o Guia com `initialProgramStart`; `useLiveZapping.ts` zera o arquivo em `stepChannel`. Respeitar `sdd/specs/040-dividir-player-live/logic/divisao.md` §1 (ordem dos hooks, um `useRemoteNav` por componente)

### Testes da Fase

- [X] T026 [P] [US2] `tv-web/src/lib/epg/catchup.test.ts`: folga de 60 s, sobreposição, dias fracionários/inválidos, programa que começa exatamente no limite
- [X] T027 [P] [US2] `tv-web/src/lib/catalog/archiveUrl.test.ts`: meia-noite, `m3u8`, segundos descartados, duração mínima 1, `ArchiveClockUnknownError`
- [X] T028 [P] [US2] `tv-web/src/lib/catalog/xtreamConnector.test.ts`: `tv_archive` `"1"`/`1`/`0`/ausente, duração 0/negativa/texto; relógio de `server_info` (deslocamento arredondado, fora de faixa = ausente)
- [X] T029 [P] [US2] `tv-web/src/lib/player/PlayerService.test.ts`: timeline sobrepõe a duração do motor; teto no "agora"; sem timeline nada muda
- [X] T030 [P] [US2] `tv-web/src/features/live/guide/EpgGuide.archive.test.tsx`: marca só nos disponíveis; OK → `onWatchArchive`; fora dos dias → `guide.archiveExpired`; sem arquivo → "Este programa já terminou."; focar não chama nada
- [X] T031 [US2] `tv-web/src/features/live/LiveScreen.archive.test.tsx`: Guia → arquivo → RETURN volta ao Guia no programa; fim → seguinte; fim do atual → ao vivo; "Ao vivo"; CH± zera o arquivo
- [X] T032 [P] [US2] `tv-web/src/components/player/usePlayerSession` (via `PlayerLayer.archive.test.tsx`): 1ª variante falha antes de tocar → 2ª tentativa com `{ variant }`; as duas falham → `PLAY-06` com "Ao vivo"/"Voltar"; a variante que tocou é lembrada

**Critério de Conclusão**: comando do Contrato da Fase → 3/3 verdes e `check-contract-tests.ps1 -Slug 058-headers-avplay-catchup` íntegro; T014 registrada; Cenário B (passos 1–5, 7, 8) no navegador; `npx tsc -b`, `npm run lint`, `npx vitest run src/features/live src/components src/lib` verdes; travas de 027/029/031/041/042 íntegras e verdes.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: código concluído (2026-10-04); **gate T014 na TV adiado para o fim por decisão do usuário** (R-009); Cenário B no navegador fica para o E2E da T038.
- Feito: T015/T016 (regras puras), T017 (`archiveDays` do painel ao catálogo: `normalizeArchiveDays`, `ClassifiedEntry`, `CatalogRecord`, `toItemRecord`, caminho eager, `itemsSignature` depois dos campos da 055, `archive_days` no `itemOut`), T018 (`readPanelClock` de `server_info` → `AccountStatus.clock`; `panelTimezone`/`panelUtcOffsetMinutes`/`archiveVariant` na fonte; `markAccount`/`markSynced` gravam o relógio; `rememberArchiveVariant`), T019 (`resolveArchivePlaybackUrl` + `fetchArchivePlayback`: 409 sem arquivo/item/relógio; relógio ausente → `checkSourceAccount` (5 s) e nova tentativa), T020 (`PlayerTimeline` na sessão: duração do EPG e teto no "agora"), T021 (sessão de arquivo: `fetchArchivePlayback` com 2 argumentos na 1ª chamada, identidade nula no gravador, fim → `onArchiveEnded`, troca de variante uma vez antes da reconexão, `rememberArchiveVariant` no 1º `playing`, `PLAY-06`, `verifyResume` com 409 → fim), T022 (chrome: `goLive` depois de ⏩, selo "Arquivo" + canal + programa + horário, CH± e ↑/↓ com chrome oculto → canal vizinho no arquivo), T023 (ação `live` primeiro na tela de erro do arquivo), T024 (Guia: `is-archive`, marca, OK → `onWatchArchive`, fora dos dias → `guide.archiveExpired`, sem arquivo → texto da 031, `initialProgramStart`), T025 (`useLiveArchive`/`useLiveArchiveState`, chamado DEPOIS de `useLiveKeyboard` para não mudar a ordem dos efeitos da 040; RETURN do arquivo do Guia reabre o Guia no programa; falha do arquivo não volta ao último canal bom).
- Contrato: `npx vitest run src/components/PlayerLayer.headers-avplay-catchup.contract.test.tsx src/lib/epg/catchup.headers-avplay-catchup.contract.test.ts src/lib/catalog/archiveUrl.headers-avplay-catchup.contract.test.ts` → 4/4 verdes (3 da fase + o de headers do mesmo arquivo); os 5 contratos da feature verdes; trava íntegra; travas de todas as features `PASS`.
- Testes executados: `npx vitest run src/features/live src/components src/lib src/features/catalog` → 288 arquivos, 1827/1827; `npx tsc -b` exit 0; `npm run lint` exit 0. Testes novos: `catchup.test.ts`, `archiveUrl.test.ts`, `xtreamConnector.archive.test.ts`, `PlayerService.timeline.test.ts`, `EpgGuide.archive.test.tsx`, `LiveScreen.archive.test.tsx`, `PlayerLayer.archive.test.tsx`. Iterações: (1) o T031 achou um bug real — a sessão guardava o `onArchiveEnded` do 1º render (programação ainda não lida) e o fim ia ao ao vivo; corrigido com `onArchiveEndedRef` em `usePlayerSession` (R-010); (2) `LiveScreen.archive.test.tsx` falhava 1 em 3 rodadas no "Ao vivo" do erro: a tecla chegava antes de o `useRemoteNav` trocar os handlers no efeito; o teste agora espera um tique antes da tecla — 0/8 falhas depois.
- Pendências: **T014 (busca sem `Range` no AVPlay) não executada** — R-003 aberto; os controles ⏪/⏩/barra do arquivo estão implementados mas sem prova na TV. Cenário B no navegador → T038 (E2E).

---

## Phase 4: User Story 3 - "Do início" no programa em exibição (Priority: P3)

**Objetivo**: "Do início" na linha do player ao vivo (depois de "Guia") e selo de arquivo na prévia da Live.

**Independent Test**: Cenário B (passos 2 e 6) do `quickstart.md`.

### Implementation

- [X] T033 [US3] Controle `startOver` (`logic/arquivo.md` §6): `chromeControls.ts` (`ChromeFeatures.startOver`, posição logo depois de "Guia"), `PlayerChrome.tsx` (ícone/texto), `usePlayerChrome.ts`, `usePlayerKeyboard.ts` (OK → `startOver.onSelect`; desabilitado → toast `player.startOver.noProgram`); chaves `player.chrome.startOver`/`player.chrome.startOverUnavailable`/`player.startOver.noProgram` em `playerUi.ts`
- [X] T034 [US3] `useLiveArchive.ts`/`LiveScreen.tsx`: prop `startOver` — `null` sem `archive_days`; `enabled` = programa atual no EPG; `onSelect` abre o arquivo do atual com `origin: 'startOver'` (RETURN volta ao ao vivo, D-012)
- [X] T035 [P] [US3] Selo na prévia (`logic/arquivo.md` §9): `tv-web/src/features/live/liveColumns.tsx` + `live.archiveBadge` em `live.ts` + estilo com tokens em `tv-web/src/styles/live.css`

### Testes da Fase

- [X] T036 [P] [US3] `tv-web/src/components/PlayerLayer.startOver.test.tsx`: "Do início" depois de "Guia" só com a prop; desabilitado explica; sem a prop a linha é a de sempre
- [X] T037 [P] [US3] Teste do selo na prévia (arquivo de testes da Live existente, não travado): com e sem `archive_days`; nenhum elemento focável novo

**Critério de Conclusão**: Cenário B passos 2 e 6 no navegador; `npx vitest run src/features/live src/components` verde; travas de 024/031/048/049 íntegras e verdes.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-10-04).
- Feito: T033 ("Do início" logo depois de "Guia" em `chromeControls.ts`; ícone/texto em `PlayerChrome.tsx`; `usePlayerChrome`/`usePlayerKeyboard`: OK real → `startOver.onSelect`, desabilitado → toast `player.startOver.noProgram`; chaves pt/en/es — feito junto da Fase 3 porque mora nas mesmas funções), T034 (`useLiveArchive.startOver`: `null` sem `archive_days`, `enabled` = programa atual no EPG, `origin: 'startOver'` → RETURN volta ao ao vivo), T035 (selo `.live-hero-archive` "Arquivo · N dias" na prévia, `<span>` não focável; `live.archiveBadge` pt/en/es; estilo com tokens em `live.css`).
- Contrato: sem contrato nesta fase; os 5 da feature continuam verdes e a trava íntegra; travas de todas as features `PASS`.
- Testes executados: `npx vitest run src/features/live src/components` → 95 arquivos, 591/591; `npx tsc -b` exit 0; `npm run lint` exit 0. Testes novos: `PlayerLayer.startOver.test.tsx` (3) e, em `LiveScreen.archive.test.tsx`, o selo da prévia (T037) e o fluxo "Do início" → RETURN ao ao vivo; o arquivo de tela rodou 4 vezes seguidas sem falha.
- Pendências: Cenário B (passos 2 e 6) no navegador → E2E da T038.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: E2E, segredos, documentação e a passada recomendada na TV.

- [X] T038 E2E `tv-web/e2e/headers-catchup.mjs` (Cenários A e B do `quickstart.md`, servidor da T001 em `127.0.0.1`, capturas em `tv-web/test-results/headers-catchup/`) e entrada em `SUITE` de `tv-web/e2e/run.mjs`
- [X] T039 Revisão de segredos: `grep` em `src/` por `console.` perto de `headers`/`playbackHeaders`/`archive`; nenhum valor em `queryKey`, estado de tela ou `PlayerError`; o E2E confere que `CCPlayTeste` e a URL de arquivo não aparecem na página
- [X] T040 Nota inline `**Atualização (feature 058):**` em `sdd/adr/ADR-010-url-completa-fonte-arquivo-m3u.md`: a URL de arquivo é URL de reprodução (mesmas regras); relógio e variante do painel não são segredo
- [X] T041 Suíte completa: `npx tsc -b`, `npm run lint`, `npm test`, `check-contract-tests.ps1` de **todas** as features com trava, `npm run build:tizen` (nenhum arquivo emitido novo esperado — se houver, `tizen_web_project.yaml`)
- [X] T042 `npm run test:e2e` com `npm run dev` rodando (gate da constitution antes da TV)
- [ ] T043 Passada na TV (recomendada; `quickstart.md` Cenário C final): A e B com o painel falso na LAN; lista real: canal com arquivo → esperado `PLAY-06` hoje; registrar catch-up da lista real como **"não testado"**
- [ ] T044 `update-feature-status.ps1 -Slug 058-headers-avplay-catchup` e `## Estado Atual` do `plan.md`; README do `tv-web` só se algum comando mudou

### Checklist de Release

- [ ] Fase 2 (US1) concluída, com a T003 registrada
- [ ] Fase 3 (US2) concluída, com a T014 registrada
- [X] Fase 4 (US3) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (esta e todas as outras travas)
- [X] `npm run test:e2e` verde (inclui `headers-catchup.mjs`)
- [ ] Nenhum valor de header, URL de arquivo ou credencial em log, tela, erro, `aria-*` ou Info técnica — código da 058 conferido (grep + E2E); **em aberto**: o `<video>` do adaptador de desenvolvimento guarda a URL do stream (inclusive a de arquivo, com credencial) no atributo `src` — pré-existente desde a 003, fora do escopo, aguardando decisão do usuário (R-011)
- [X] `npm run build:tizen` ok
- [X] `quickstart.md` executado (A e B no navegador; C na TV ou registrado como pendente) — A e B pelo E2E `headers-catchup.mjs`; C (T003, T014, T043) registrado como pendente (R-009)
- [X] Catch-up com a lista real registrado como "não testado" (R-002), nunca como aprovado

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **US1 (Phase 2)**: depende da T001 (servidor para a T003). T003 é gate: nada da Fase 2 depois dela começa sem o registro.
- **US2 (Phase 3)**: depende da Fase 1 (T014 usa o painel falso) e do `PlayerService` da T005 (mesmo construtor). T014 é gate: T020–T022 não começam sem ele.
- **US3 (Phase 4)**: depende da Fase 3 (sessão de arquivo, `useLiveArchive`)
- **Polish (Phase 5)**: depende das fases desejadas completas

### Parallel Opportunities

- Fase 2: T004, T008, T009 em paralelo depois de T002/T003; T010–T013 em paralelo
- Fase 3: T015, T016, T017 em paralelo logo de início (puros/dados); T026–T030 em paralelo

---

## Parallel Example: User Story 2

```bash
Task: "T015 [P] [US2] isArchiveAvailable/nextArchiveStep em tv-web/src/lib/epg/catchup.ts"
Task: "T016 [P] [US2] buildArchiveUrl em tv-web/src/lib/catalog/archiveUrl.ts"
Task: "T017 [P] [US2] archiveDays no catálogo"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 (servidor de teste)
2. Fase 2 até a T003 — **gate na TV**
3. Resto da Fase 2 → US1 entregável sozinha (listas com header tocam)

### Incremental Delivery

1. US1 → validar na TV (T003) → entregável
2. US2 → gate T014 → Guia + arquivo
3. US3 → "Do início" + selo
4. Polish → E2E, segredos, ADR-010, passada final

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
