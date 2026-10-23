---
description: "Tasks da feature 090 — legendas externas pelo OpenSubtitles"
---

# Tasks: Legendas externas (OpenSubtitles e SubDL)

**Input**: Documentos de design de `sdd/specs/090-legendas-externas/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/servico-legendas.md, logic/legenda-externa.md,
logic/emenda-constitution.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- App da TV em `tv-web/src/` — lógica pura em `tv-web/src/lib/subtitles/`, UI do player em `tv-web/src/components/`
  e `tv-web/src/components/player/`, E2E em `tv-web/e2e/`.
- Serviço do portal em `api/app/portal/` (rotas em `api/app/portal/routes/`), testes em `api/tests/portal/`.
- Documentos em `sdd/specs/090-legendas-externas/`; constitution em `.planning/memory/constitution.md`.
- Regra transversal: **nenhum arquivo no teto do ratchet cresce** (`logic §8`); **nada fora do player e nada antes do
  primeiro `playing`** (`logic §9`, D-012).

---

## Phase 1: Setup — gates normativo e de medição

**Purpose**: Desbloquear a escrita de código que chama o serviço e guardar a medição "antes" para o SC-009.

- [X] T001 Mostrar ao usuário o texto de `sdd/specs/090-legendas-externas/logic/emenda-constitution.md` e, **só com
  aprovação explícita**, aplicar em `.planning/memory/constitution.md` (1.15.0 → 1.16.0: exceção (k), itens 2 e 3,
  relatório de impacto, rodapé); atualizar a versão citada em `CLAUDE.md` e anexar nota `**Atualização (feature
  090):**` em `sdd/adr/ADR-021-chaves-padrao-protegidas-byok.md` §8. Sem aprovação: parar a feature aqui e registrar.
- [X] T002 Medição "antes" na TV de referência (quickstart C3–C5: sonda de navegação só `→`/`↓`, 60 s de reprodução,
  tempo até tocar), em `sdd/specs/090-legendas-externas/evidencias/antes.md`. **Pedir autorização antes de instalar**
  (memória do usuário). Se negada agora, registrar e usar como "antes" as rodadas mais recentes de
  `sdd/specs/089-*/evidencias/`, dizendo isso explicitamente no G-2.

**Critério de Conclusão**: constitution 1.16.0 aplicada com aprovação registrada no relatório de impacto; medição
"antes" gravada ou a substituição justificada.

**Registro da Fase**:

- Status: Concluída (2026-10-22).
- Feito: T001 — usuário aprovou o texto de `logic/emenda-constitution.md` sem ajustes; constitution 1.15.0 → **1.16.0**
  (exceções (k) e (l), listas fechadas de "Comandos Locais…" e da exceção 069 em Restrições, relatório de impacto,
  histórico de versões, rodapé); `CLAUDE.md` cita v1.16.0; nota `**Atualização (feature 090)**` na ADR-021 §8.
  T002 — usuário escolheu não instalar na TV agora; `evidencias/antes.md` registra a 089 (rodada 3) só como ordem de
  grandeza, porque ela mediu a lista lateral (regra da 089) e a rodada 4 foi abortada; o "antes" real passa para a T042
  com dois builds na mesma sessão (build A = `85e2ead`).
- Contrato: sem contrato nesta fase. Trava conferida: `check-contract-tests.ps1 -Slug 090-legendas-externas` → íntegra (5).
- Testes executados: nenhum (fase só normativa/documental).
- Pendências: a T042 agora exige **duas** instalações na TV (build A e B) — pedir autorização para cada.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lógica pura, memória local, cliente da TV e as duas operações do serviço.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar. Depende da T001.

### Contrato da Fase

- `lê SRT (BOM, CRLF, tags, bloco inválido) e WebVTT …` — FR-011
- `segue a posição da mídia: salto apaga antes de mostrar, …` — US1/AC4, SC-004
- `usa TMDB do filme ou da série … nunca leva identidade da lista` — FR-005, FR-017
- Comando: `cd tv-web; npx vitest run src/lib/subtitles`

### Implementation — TV

- [X] T003 [P] `subtitleLanguageForApp` (pt→`pt-BR`, en→`en`, es→`es`) em `tv-web/src/lib/subtitles/types.ts`.
- [X] T004 [P] `parseSubtitleFile` conforme `logic §1` em `tv-web/src/lib/subtitles/subtitleFile.ts` → contrato:
  `lê SRT …`.
- [X] T005 [P] `createExternalCueDriver` conforme `logic §2` (um timer, extrapolação, salto > 1 s, atraso no tempo
  efetivo) em `tv-web/src/lib/subtitles/externalCueDriver.ts` → contrato: `segue a posição da mídia …`.
- [X] T006 [P] `buildSearchRequest` e `resolveSubtitleTarget` conforme `logic §3` (só `getChannel`,
  `findSeriesRecord`, `titleMetadata`, `buildStableId`/`titleStableId`, `normalizeTitle`/`yearHintFromTitle`) em
  `tv-web/src/lib/subtitles/subtitleTarget.ts` → contrato: `usa TMDB do filme …`.
- [X] T007 Tabela `externalSubtitles` em `tv-web/src/lib/catalog/dbSchema.ts` (`version(27)`, sem `.upgrade()`),
  acesso tipado em `tv-web/src/lib/subtitles/subtitleTables.ts` e `createSubtitleStore(database)` (chave
  `[stableId+language]`, load = a ativa, list, save/update com no máximo uma ativa por item, teto 2 MiB, despejo LRU
  só nesta tabela, gzip, `gunzipText` fora de transação, falha de cota = `false`) em
  `tv-web/src/lib/subtitles/subtitleStore.ts` (`logic §6`, data-model §1).
- [X] T008 `deleteSource` apaga `externalSubtitles` da fonte, na mesma transação, em
  `tv-web/src/lib/catalog/sourceDeletion.ts` (tabela em `sourceDeletionTables`) — FR-021.
- [X] T009 `portalClient`: códigos `subtitles_not_entitled`, `subtitles_device_limit`, `subtitles_provider_limit`,
  `subtitles_unreadable` em `errorCodes` e `BODY_CODES`; `specificCode` lê o corpo também em 429, em
  `tv-web/src/lib/portal/portalClient.ts` (`logic §7`, contrato do serviço §4).
- [X] T010 `createPortalSubtitleService(connection)` (rotas fixas, bearer da TV, `providers` opcional no corpo,
  resposta `{ results, unavailable }` validada item a item — `id` pelo regex do contrato §3, `provider` na lista
  fechada, `downloads` opcional; item inválido descartado —, mapeamento de erros) em
  `tv-web/src/lib/subtitles/portalSubtitleService.ts`.
- [X] T011 [P] Memória da sequência em RAM (`logic §5.5`) em `tv-web/src/lib/subtitles/sequenceMemory.ts` e
  `defaultExternalSubtitles()` (null sem portal ou build base; só cria objetos, sem ler banco) em
  `tv-web/src/lib/subtitles/runtime.ts`, com acesso local de licença a partir de `lib/licensing/licenseRuntime.ts`
  (sem rede).

### Implementation — Serviço

- [X] T012 [P] `PortalSettings`: `opensubtitles_api_key` e `subdl_api_key` (`SecretStr | None`), `subtitles_downloads_per_day = 10`,
  `subtitles_searches_per_hour = 60` (1–10 000) em `api/app/portal/settings.py` (data-model §3). Não exigir a chave
  em `production_env.py` (G-1).
- [X] T013 Leitura de acesso **sem gravar** (`trial`/`active` vigente; `trial_started_at` nulo ⇒ `created_at + 7
  dias`), reaproveitando a regra de `entitlement()` sem duplicar lógica divergente, em `api/app/portal/licensing.py`.
- [X] T014 Adaptador OpenSubtitles (tradução do pedido, normalização `os:<file_id>`, regra de host do link, 1 MiB,
  429/406/407) em `api/app/portal/providers/opensubtitles.py` e serviço de legendas (acesso, limites conferir/consumir
  somando os fornecedores, `asyncio.gather` com timeout por fornecedor, junção e ordem do contrato §2, `unavailable`,
  `providers` opcional, UTF-8→cp1252, sem log de termo, `User-Agent`) em `api/app/portal/subtitles.py`
  (`contracts/servico-legendas.md` §1–§3).
- [X] T014b Adaptador SubDL em `api/app/portal/providers/subdl.py`: `languages=BR_PT|EN|ES`, `tmdb_id`+`type`,
  temporada/episódio, `film_name`; `id = "sd:<a>-<b>"` extraído da `url` **e a URL descartada** (embute a chave,
  R-012); filtro de episódio e `seasonPack`; download remontado em `dl.subdl.com`; extração do ZIP em memória com os
  limites do contrato §3 (50 entradas, 4 MiB, só nome-base, SRT/WebVTT, episódio por `SxxEyy`/`NxNN`). Antes de
  codar, conferir a doc oficial no navegador (R-017) e anotar divergências em `plan.md`.
- [X] T014c [P] Fixtures sintéticas compartilhadas (D-015): respostas JSON de busca dos dois fornecedores e ZIPs
  gerados no teste (filme com 1 SRT; pacote de temporada com S01E01…S01E03; ZIP só com `.ass`; ZIP-bomba; nome com
  `../`) em `sdd/specs/090-legendas-externas/fixtures/` — nunca texto real de legenda nem resposta real versionada.
- [X] T015 Rotas `POST /portal/v1/device/subtitles/search` e `/download` (modelos `Input` com `extra=forbid`,
  `tv_principal`, `NO_STORE`, códigos do §4) em `api/app/portal/routes/subtitles.py`, registradas em
  `api/app/portal/application.py`.

### Testes da Fase

- [X] T016 [P] Store: chave por `stableId` + idioma (pt-BR e en do mesmo item convivem; nova versão no mesmo idioma
  substitui), outra fonte = outra linha, ativar um idioma desativa os outros, `list` devolve ≤ 3, despejo só desta
  tabela respeitando o teto, arquivo maior que o teto não grava, `load` atualiza `lastUsedAt`, `deleteSource` apaga;
  **medição do R-011**: tamanho gravado de um SRT sintético de ~1 500 falas com acentos (alvo ≤ 60 KB) registrado no
  `plan.md` — em
  `tv-web/src/lib/subtitles/subtitleStore.test.ts` (`new CatalogDb('test-090-' + crypto.randomUUID())`).
- [X] T017 [P] Cliente: corpo enviado = pedido exato; resposta malformada → `unavailable`; item com `id`/`provider`
  inválido descartado e o resto aproveitado; `unavailable` repassado; cada código do §4 → código certo, com
  `retryAtMs` no limite — em `tv-web/src/lib/subtitles/portalSubtitleService.test.ts`.
- [X] T018 [P] `resolveSubtitleTarget`: filme com TMDB casado / só do painel / sem; episódio com série casada / sem
  série; canal → `null`; categoria escondida → `null` — em `tv-web/src/lib/subtitles/subtitleTarget.test.ts`.
- [X] T019 Serviço: sem licença → 409; busca no limite → 429 `rate_limited`; download no limite → 429
  `subtitles_device_limit`; falha do fornecedor não consome cota; link de host estranho → 503; corpo > 1 MiB → 409;
  cp1252 decodificado; 401 do fornecedor → 503 sem citar chave; **dois fornecedores**: junção e ordem (OS por
  downloads, depois SubDL; episódio exato antes de pacote), um fora → 200 com `unavailable`, os dois fora → 503,
  fornecedor sem chave não consultado, `providers` restringe; **SubDL**: `id` extraído e a URL com `api_key` nunca na
  resposta nem em `caplog`, ZIP de filme, pacote escolhe o episódio certo, pacote sem o episódio → 409, só `.ass` →
  409, ZIP-bomba e `../` recusados sem tocar disco; as **duas** chaves padrão não aparecem em resposta nem em `caplog`
  — em `api/tests/portal/test_subtitles.py` (fornecedores por `httpx.MockTransport` com as fixtures da T014c,
  emulador Firestore).

- [X] T019b Rodar `api/tests/portal/test_subtitles_routes.py` com o emulador Firestore (`PORTAL_TEST_FIRESTORE=1`,
  Java 21+). Descoberta na T019: esta máquina tem Java 17 e o emulador recusa subir; o arquivo existe, coleta e é pulado.

**Critério de Conclusão**: `cd tv-web; npx vitest run src/lib/subtitles` → 3/3 contratos da fase verdes e
`check-contract-tests.ps1 -Slug 090-legendas-externas` íntegro; T016–T019 verdes; `npm run lint` (ratchet) e
`uv run ruff check .` limpos; `deleteSource` coberto.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída (2026-10-22), com uma pendência de ambiente (T019b).
- Feito: TV — `subtitleLanguageForApp`, `parseSubtitleFile`, `createExternalCueDriver`, `buildSearchRequest`/
  `resolveSubtitleTarget`, tabelas `externalSubtitles`/`subtitleCredentials` (Dexie v27), `createSubtitleStore`
  (uma por idioma por item, teto 2 MiB, despejo só da tabela), `deleteSource` apaga as legendas da lista, códigos
  `subtitles_*` no `portalClient` (corpo lido também em 429), `createPortalSubtitleService`, memória da sequência e
  `defaultExternalSubtitles()`. Serviço — `opensubtitles_api_key`/`subdl_api_key`/limites em `PortalSettings`,
  `license_window` compartilhada + `LicensingService.has_access` (lê sem gravar), adaptadores OpenSubtitles e SubDL,
  extração de ZIP em memória, `SubtitleService` (paralelo, junção, `unavailable`, limites), rotas `device/subtitles/*`,
  quatro códigos novos em `AUTH_CODES`, fixtures sintéticas.
  Correção inline (bloqueava a T019): o `httpx` registrava em INFO a URL com `api_key=` do SubDL → filtro
  `RedactKeyFilter` nos loggers `httpx`/`httpcore` (R-018). Ajuste inline (T009): `pinMigration.upgrade.test.ts` e
  `portalTables.test.ts` fixavam a versão 26 do banco → 27 (mesmo ajuste que a 082 fez; nenhum é travado).
- Contrato: `cd tv-web; npx vitest run src/lib/subtitles` → contratos da fase 3/3 verdes; trava íntegra (5).
- Testes executados: `npx vitest run src/lib/subtitles src/lib/portal src/lib/catalog src/lib/parental src/lib/backup
  src/lib/licensing` → 171 arquivos / 858 testes verdes; `npx tsc -b` limpo; `npm run lint` → architecture ok, nenhum
  aviso em arquivo da 090; `uv run pytest tests/portal/test_subtitle_providers.py` → 12/12; `uv run pytest
  tests/portal/test_production_env.py tests/portal/test_secrets.py tests/portal/test_deployment.py
  --basetemp=<scratchpad>` → 6 passados, 1 pulado; `uv run ruff check .` limpo. R-011: SRT sintético de 207 KB grava
  em 15 KB (limite 60 KB).
- Pendências: **T019b** — `tests/portal/test_subtitles_routes.py` (rotas, `has_access` e limitador reais) foi escrito
  mas **não executado**: o emulador Firestore exige Java 21+ e a máquina tem Java 17. Os testes do portal com emulador
  (`PORTAL_TEST_FIRESTORE=1`) ficam pulados aqui. O pytest padrão falha nesta sessão ao criar a pasta temporária
  (`PermissionError` do sandbox) — usar `--basetemp` no scratchpad.

---

## Phase 3: User Story 1 - Buscar e aplicar uma legenda externa no player (Priority: P1) 🎯 MVP

**Objetivo**: No painel "Áudio e legendas", buscar, escolher, ver a legenda no tempo da mídia, trocar e desativar.

**Independent Test**: quickstart B1–B6, B8, B10, B12 no navegador (motor `<video>`, sem faixas).

### Contrato da Fase

- `filme: nenhuma chamada até SELECT em "Buscar legenda online"; …` — US1/AC1+AC3, FR-002, SC-002
- `falha da busca mostra o erro com "Tentar de novo" focado, …` — FR-015, Constitution: Foco Visível
- Comando: `cd tv-web; npx vitest run src/components/PlayerLayer.legendas-externas.contract.test.tsx`

### Implementation

- [X] T020 [US1] Hook `useExternalSubtitles` (deps pela prop ou `defaultExternalSubtitles()`, alvo resolvido **num
  passo ocioso depois do primeiro `playing`**, estado da busca, aplicar, trocar, desativar, driver assinando
  `session.subscribe` sem `setState`, descarte por `seq` + `AbortController`) em
  `tv-web/src/components/player/useExternalSubtitles.ts` (`logic §5.1–§5.3`, `§5.6`, `§9`) → contrato: os dois.
- [X] T021 [P] [US1] `SubtitleOverlay` recebe `source: { subscribeSubtitles }` (a sessão continua servindo) e reassina
  ao trocar de fonte, em `tv-web/src/components/SubtitleOverlay.tsx` → contrato: `filme: nenhuma chamada …`.
- [X] T022 [P] [US1] `buildTracksPanel(tracks, choice, t, external?)` com `external:active`, `external:search` e,
  com a externa ativa, a linha única `delay:external` no lugar das cinco da 029 (`logic §4`, `§4.1`); helpers
  `stepExternalDelay`/`formatExternalDelay` (±10 s, passo 500 ms), em `tv-web/src/components/playerPanels.ts`; linhas
  novas em `tv-web/src/components/PlayerTracksPanel.tsx` (radio "Externa…" no grupo Legendas; botão de busca depois
  dele; `role="slider"` com `aria-value*` e a dica "◀ adiantar · atrasar ▶") → contrato: `filme: nenhuma chamada …`.
- [X] T023 [US1] Diálogo "Buscar legenda online" (radiogroup Idioma, estados loading/results/empty/error, botões de
  resultado com nome começando pela versão, foco por chave) em
  `tv-web/src/components/PlayerSubtitleSearchPanel.tsx`; `PanelState` `'subtitleSearch'` em
  `tv-web/src/components/player/playerLayerTypes.ts` (remover a nota "STUB" da prop) → contrato: os dois.
- [X] T024 [US1] `usePlayerPanels` delega ao hook: abrir sem faixas quando `available`, SELECT nas linhas
  `external:*`, direção/SELECT/RETURN do `'subtitleSearch'` (RETURN → painel de faixas em `external:search`). Para
  não passar de 367 linhas, extrair o ramo aspecto/qualidade de `activatePanelControl` para
  `tv-web/src/components/player/panelControls.ts`. Arquivo: `tv-web/src/components/player/usePlayerPanels.ts`.
- [X] T025 [US1] Fiação no `tv-web/src/components/PlayerLayer.tsx` (hook, `external` no modelo, diálogo, fonte do
  overlay com atraso 0 na externa) sem passar de 325 linhas: extrair o JSX dos painéis para
  `tv-web/src/components/player/PlayerPanelsView.tsx`.
- [X] T026 [P] [US1] `tracks: (session?.supportsTracks ?? false) || available` em
  `tv-web/src/components/player/usePlayerChrome.ts`.
- [X] T027 [P] [US1] Textos em `tv-web/src/lib/i18n/messages/subtitles.ts` (pt base, en, es), registrados como as
  demais áreas; nomes de idioma da tabela de `logic §4`; mensagens dos 6 estados (`logic §5.2`).

- [X] T032 [US1] Ajuste da externa (FR-008, US1/AC7, `logic §4.1`): ←/→ na linha `delay:external` (só nela — no
  resto do painel ←/→ seguem ignorados) mudam ±500 ms grampeado em ±10 s com `driver.setDelay` na hora; OK volta a
  0; `store.update(stableId, { delayMs })` só após 800 ms sem tecla e ao fechar painel/player; desativar/reativar
  grava `active`. Em `tv-web/src/components/player/useExternalSubtitles.ts` e no filtro de direção de
  `tv-web/src/components/player/usePlayerPanels.ts` (sem passar de 367 linhas). A restauração do valor guardado é da T031 (Fase 4).

### Testes da Fase

- [X] T028 [P] [US1] Modelo do painel: sem `external` a saída é idêntica à de hoje; ordem das linhas; "Desativadas"
  vs externa; com externa ativa uma só linha `delay:external` e, com embutida, as cinco da 029; `stepExternalDelay`
  grampeia em ±10 000 e anda 500; `formatExternalDelay` nas três línguas; `not_entitled` soft disabled — em
  `tv-web/src/components/playerPanels.legendas-externas.test.ts`.
- [X] T029 [P] [US1] Hook/PlayerLayer: resposta de busca que chega depois de trocar `itemId` não aparece nem grava
  (FR-010); trocar idioma busca de novo; `unreadable` volta à lista sem nova busca; Live (`kind: channel`) não mostra
  a opção (FR-001); nenhuma leitura de alvo antes do `playing` (D-012); 5× → no ajuste muda a fala exibida na hora,
  não pausa o vídeo e grava **uma** vez após 800 ms (T032); **casos de uso do usuário**: (a) desativar por
  "Desativadas" e reativar por "Externa — Português (Brasil)" sem nenhuma chamada ao serviço (US1/AC8); (b) com pt-BR
  ativa, buscar em Inglês e aplicar → duas linhas "Externa…", só a inglesa marcada; voltar ao português sem novo
  `download` (US1/AC9) — em `tv-web/src/components/PlayerLayer.legendas-externas.test.tsx`.
- [X] T030 [US1] Travas e suítes vizinhas: `check-contract-tests.ps1` para 029, 041, 042 e 090;
  `npx vitest run src/components src/lib/player src/lib/portal`.

**Critério de Conclusão**: `cd tv-web; npx vitest run src/components/PlayerLayer.legendas-externas.contract.test.tsx
src/lib/subtitles` → 5/5 verdes e `check-contract-tests.ps1` íntegro (090 e 029); T028–T030 verdes; `npm run lint`
sem tocar o baseline; `npm run build` ok; quickstart B1–B6, B8, B10, B12 conferidos no navegador.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída em código e testes (2026-10-22); conferência manual no navegador (quickstart B) pendente — vai com
  o E2E da T036, que precisa do serviço simulado.
- Feito: hook `useExternalSubtitles` (estado em refs, redesenho próprio, resolução do alvo num passo ocioso depois do
  primeiro `playing` via `reapplyTrackChoice`) + `externalSubtitleSearch.ts` (ações do diálogo, descarte por `seq`) +
  `externalSubtitlesSupport.ts`; `SubtitleOverlay` com `source` genérica (apaga a linha ao trocar de fonte);
  `buildTracksPanel(…, external?)` com `external:<idioma>`, `external:search` e o ajuste `delay:external` (slider,
  ±10 s, 0,5 s, OK zera) — peças em `externalSubtitleRows.ts`; diálogo `PlayerSubtitleSearchPanel.tsx` +
  `subtitleSearchModel.ts`; `PanelState` `subtitleSearch`; `usePlayerPanels` delega (aspecto/qualidade extraídos para
  `panelControls.ts`); `usePlayerChrome` com `externalAvailableRef`; `PlayerLayer` fia tudo (rótulo de estado extraído
  para `playerStatusLabel.ts`); área i18n `subtitles` (pt/en/es); estilos com tokens em `player.css`.
  Defeitos achados e corrigidos na fase: (1) o driver só emitia quando a fala mudava, então reativar/trocar de idioma
  no meio de uma fala não mostrava nada até a próxima — agora entrega a fala vigente a quem se inscreve (R-020);
  (2) o import estático do runtime fazia o build emitir 10 chunks fora de `tizen_web_project.yaml` — o padrão de
  produção passou a ser `import()` no passo ocioso (D-012), `buildSearchRequest` e as constantes do ajuste foram para
  módulos sem dependência (`searchRequest.ts`, `delay.ts`), e os 5 chunks restantes entraram na lista (R-021).
  Ajustes inline: `areas.test.ts` lista a área nova (regra do próprio teste); `SubtitleOverlay.test.tsx` usa `source=`.
- Contrato: `npx vitest run src/components/PlayerLayer.legendas-externas.contract.test.tsx src/lib/subtitles` →
  **5/5 contratos da feature verdes** (25 testes no comando); travas íntegras: 090, 029, 041, 042.
- Testes executados: `npx vitest run src/components src/lib/player src/lib/subtitles src/lib/i18n src/lib/portal
  src/lib/catalog` → 276 arquivos / 1 522 testes verdes (antes, com `src/lib/backup`: 282 / 1 531);
  `playerPanels.legendas-externas.test.ts` 4/4; `PlayerLayer.legendas-externas.test.tsx` 5/5 (descarte de resposta
  atrasada, ilegível, Live sem opção, nada antes do `playing`, ajuste, desativar/reativar, alternar pt↔en sem rede);
  `npx tsc -b` limpo; `npm run lint` → architecture ok, baseline encolhido (`--prune`: PlayerLayer 321, usePlayerPanels
  345); `npm run build` ok; guarda do Tizen (`findUnlistedFiles`/`findStaleDeclared`) vazia. Avisos de lint novos: 3
  `react(refs)` no `PlayerLayer` (mesmo padrão de refs no render do arquivo, ADR-009) e 2 no cleanup do hook
  (leitura intencional do valor mais recente).
- Pendências: quickstart B no navegador (via T036); T019b (emulador); medição de desempenho na TV (T042).

---

## Phase 4: User Story 2 - Lembrar a legenda por título e oferecê-la no próximo episódio (Priority: P2)

**Objetivo**: Reaplicar do aparelho ao retomar, sem rede; atalho no próximo episódio sem buscar.

**Independent Test**: quickstart B7, B9, B11.

### Implementation

- [X] T031 [US2] Restauração no mesmo passo ocioso do alvo (`logic §5.4`): `store.load` → parse → aplica sem
  `save` e sem rede; externa guardada vence a escolha herdada; falha silenciosa — em
  `tv-web/src/components/player/useExternalSubtitles.ts`.
- [X] T033 [US2] Atalho "Buscar legenda (<idioma>)" a partir de `sequenceMemory` (mesma série, sem externa guardada);
  SELECT abre o diálogo já no idioma — `tv-web/src/components/player/useExternalSubtitles.ts`.

### Testes da Fase

- [X] T034 [P] [US2] Retomar reaplica com o atraso guardado e **zero** chamadas ao serviço; mesma obra em outra fonte
  não reaplica; próximo episódio mostra atalho e não chama nada até OK; registro despejado → abre sem legenda e sem
  erro — em `tv-web/src/components/PlayerLayer.legendas-externas.test.tsx`.

**Critério de Conclusão**: T034 verde; contratos 5/5 continuam verdes; quickstart B7, B9, B11 conferidos.

**Registro da Fase**:

- Status: Concluída em código e testes (2026-10-23); conferência manual no navegador (quickstart B7, B9, B11) pendente —
  vai com o E2E da T036.
- Feito: `restore()` em `useExternalSubtitles.ts` (T031): no mesmo passo ocioso que resolve o alvo, a externa que estava
  ativa no `store.list` é parseada e aplicada com o atraso guardado — sem `save`, sem rede, e `apply` desliga a embutida
  herdada (memória do item > herança da sequência); ilegível = segue sem ela; restaurar também grava o idioma na memória
  da sequência (o episódio seguinte já oferece o atalho depois de um retomar). T033: o atalho "Buscar legenda (<idioma>)"
  e o SELECT que abre o diálogo já no idioma já existiam desde a Fase 3 (`sequenceMemory` + `buildExternalPanelInput` +
  `selectRow`); aqui só ganharam teste. O temporizador da gravação do ajuste saiu do hook para `createDelaySaver`
  (`externalSubtitlesSupport.ts`) para o hook caber no teto de 300 linhas (292).
- Contrato: `npx vitest run src/components/PlayerLayer.legendas-externas.contract.test.tsx src/lib/subtitles` → 5/5
  contratos verdes; `check-contract-tests.ps1 -Slug 090-legendas-externas` → trava íntegra.
- Testes executados: `PlayerLayer.legendas-externas.test.tsx` 9/9 (4 novos: retomar com atraso e zero serviço, mesma obra
  em outra lista não reaplica, registro despejado/ilegível abre sem erro, episódio seguinte com atalho sem chamar nada
  até confirmar); `npx vitest run src/components src/lib/subtitles src/lib/player` → 124 arquivos / 704 testes verdes na
  segunda rodada; `npx tsc -b` limpo; `npm run lint` → architecture ok.
- Pendências: **teste instável**: na primeira rodada da área, `src/lib/player/progressRecorder.falhas.test.ts` falhou
  (`PRG-W-QUOTA` esperado) e passou isolado 3× e na rodada seguinte — não toca nesta feature; segue aberto, não é
  "baseline ok". Quickstart B7/B9/B11 no navegador (via T036); T019b (emulador); medição na TV (T042).

---

## Phase 5: User Story 3 - Usar a própria chave do OpenSubtitles ou do SubDL (Priority: P3)

**Objetivo**: Chave pessoal por fornecedor, cadastrada na aba Integrações, testada no fornecedor e usada direto da TV
para aquele fornecedor; o outro segue pelo serviço. Implementada (D-011); **anunciar na loja depende do G-4**.

**Independent Test**: quickstart B13–B16 (chave pessoal do SubDL com o serviço desligado; chave recusada; "Usar o
padrão do ccplayTv"; remover).

### Implementation

- [X] T043 [US3] Tabela `subtitleCredentials` (`dbSchema.ts` v27, junto da T007) e `saveSubtitleKey` /
  `removeSubtitleKey` / `readSubtitleCredential` / `setSubtitleKeyChosen` (formato amplo, teste no fornecedor antes
  de gravar, recusa não troca nada) em `tv-web/src/lib/subtitles/subtitleCredentials.ts` (`logic §10.2`, data-model
  §1b, D-014).
- [X] T044 [P] [US3] Leitor ZIP mínimo (diretório central, store/deflate via `DecompressionStream('deflate-raw')`,
  recusa ZIP64/criptografia, 50 entradas, 4 MiB) e escolha do arquivo (mesma regra do serviço, D-015) em
  `tv-web/src/lib/subtitles/zipReader.ts` (`logic §10.3`). Conferir se `DecompressionStream` existe no projeto `node`
  do vitest; se não, o teste roda no `dom` via `TESTES_TS_COM_DOM` (`vite.config.ts`).
- [X] T045 [US3] Clientes diretos (mesma tradução/normalização do contrato §2; download SubDL via ZIP; OpenSubtitles
  `POST /download` + `link`), erros mapeados para `SubtitleErrorCode`, a chave só no `fetch`, em
  `tv-web/src/lib/subtitles/directProviders.ts`.
- [X] T046 [US3] `createSubtitleSearch(deps)`: por fornecedor, chave pessoal escolhida → direto; senão serviço com
  `providers`; paralelo; junção e ordem do contrato §2; download pelo caminho do `id`; usado por `runtime.ts` no lugar
  do serviço puro — em `tv-web/src/lib/subtitles/subtitleSearch.ts` (`logic §10.1`). Credencial lida no SELECT da
  busca, nunca na montagem (D-012).
- [X] T047 [US3] Diálogo: aviso por fornecedor com chave pessoal recusada/no limite e a ação "Usar o padrão do
  ccplayTv" (põe `chosen: false` e repete a busca — nunca automático) em
  `tv-web/src/components/PlayerSubtitleSearchPanel.tsx` e no hook.
- [X] T048 [US3] Seção "Legendas" da aba Integrações (uma linha por fornecedor: estado, Adicionar chave pelo IME com
  campo oculto, Testar, Remover; foco em todos os estados) em
  `tv-web/src/features/settings/tabs/SubtitleKeysSection.tsx`, montada com uma linha em
  `tv-web/src/features/settings/tabs/IntegrationsTab.tsx`; textos em `messages/subtitles.ts`.
- [X] T053 [US3] Prova do CORS do download do `link` do OpenSubtitles a partir do navegador (dev) e, com autorização,
  na TV (R-016), usando a chave de desenvolvimento sem imprimir; registrar em `evidencias/`. Falhando: BYOK do
  OpenSubtitles fica só com busca + aviso e o caso volta ao `plan.md`.

### Testes da Fase

- [X] T049 [P] [US3] Credenciais: chave recusada não grava; chave aceita grava; remover apaga; a chave não aparece em
  nenhum erro/log capturado; tabela fora do backup (`usageBackup` não a lê) e fora de `deleteSource` — em
  `tv-web/src/lib/subtitles/subtitleCredentials.test.ts`.
- [X] T050 [P] [US3] ZIP e clientes diretos com as fixtures da T014c (mesmos resultados esperados do serviço, D-015):
  filme, pacote escolhe o episódio, só `.ass` → `unreadable`, bomba e `../` recusados; pedido SubDL com `BR_PT` e
  `tmdb_id`+`type`; a URL do fornecedor nunca sai do cliente — em `tv-web/src/lib/subtitles/zipReader.test.ts` e
  `tv-web/src/lib/subtitles/directProviders.test.ts`.
- [X] T051 [P] [US3] Busca mista: chave pessoal do SubDL + serviço para o OpenSubtitles → duas chamadas, junção na
  ordem; chave recusada → aviso e "Usar o padrão" repete pelo serviço; sem licença e sem chave → `not_entitled` — em
  `tv-web/src/lib/subtitles/subtitleSearch.test.ts`.
- [X] T052 [US3] Aba Integrações: foco em todos os estados, campo oculto, RETURN fecha o IME antes da aba — em
  `tv-web/src/features/settings/tabs/SubtitleKeysSection.test.tsx`.

**Critério de Conclusão**: T049–T052 verdes; contratos 5/5 seguem verdes; quickstart B13–B16; T053 registrada; a
oferta na loja continua dependendo do G-4 (registrado, não pulado).

**Registro da Fase**:

- Status: Concluída em código e testes (2026-10-23), **BYOK dos dois fornecedores** (R-022 resolvido pela prova do T053
  na TV física). Conferência manual no navegador (quickstart B13–B16) vai
  com o E2E da T036.
- Feito: `subtitleCredentials.ts` (testa no fornecedor antes de gravar; recusa não troca nada; versão mascarada para a
  interface; `readChosenSubtitleKeys` só para a busca); `zipReader.ts` (diretório central, store/deflate, 50 entradas,
  teto de bytes lidos, nome-base, ZIP64/cifrado recusados) e `decodeSubtitleText` (mesma regra do serviço);
  `directProviders.ts` + `directHttp.ts`/`openSubtitlesDirect.ts`/`subdlDirect.ts` (mesma tradução e normalização do
  serviço; erro só com a categoria, nunca URL ou chave); `subtitleSearch.ts` (por fornecedor: chave pessoal → direto,
  senão serviço com `providers`; junção na ordem do contrato; chave lida na ação, nunca na montagem); `runtime.ts`
  (serviço puro trocado pela busca mista; sem portal, só a chave pessoal mantém a opção; `useDefault` só se há padrão);
  diálogo: avisos por fornecedor (`keyIssues`), erro `key_rejected` e a ação "Usar o padrão do ccplayTv" (explícita,
  repete a busca); aba Integrações: seção "Legendas" (`SubtitleKeysSection`, `SubtitleKeyDialog` com IME em `Modal`,
  `useSubtitleKeys`, `subtitleKeysModel`), linhas novas em `integrationsModel` (SPEED_TEST_ROW passou de 3 para 4);
  textos nas três línguas; `assets/subtitleCredentials.js` na lista do Tizen. **T053**: no PC (Chromium 153) o preflight do
  OpenSubtitles em `file://` é recusado (`evidencias/cors-direto-pc.json`, só registro); **na TV física passou** — busca 200,
  `POST /download` com `X-User-Agent` 200 + link, arquivo 200 (`evidencias/cors-direto-tv-2026-10-23.md`). Resultado:
  `BYOK_PROVIDERS = ['opensubtitles', 'subdl']`, e o cliente do OpenSubtitles manda `X-User-Agent`.
- Contrato: `check-contract-tests.ps1 -Slug 090-legendas-externas` → trava íntegra (5 testes); contratos verdes dentro da
  suíte da área.
- Testes executados: `npx vitest run src/components src/features/settings src/lib/subtitles src/lib/i18n src/lib/portal
  src/lib/catalog src/lib/player src/lib/backup` → 333 arquivos / 1 766 testes verdes; novos: `zipReader.test.ts` 9,
  `directProviders.test.ts` 12, `subtitleCredentials.test.ts` 7, `subtitleSearch.test.ts` 9,
  `SubtitleKeysSection.test.tsx` 6, `PlayerLayer.legendas-externas.test.tsx` +2 (avisos de chave e "Usar o padrão");
  `SettingsScreen.integrations/speedTest` ajustados (mais uma linha na aba); `npx tsc -b` limpo; `npm run lint` →
  architecture ok; `npm run build` ok e guarda do Tizen vazia (1 chunk novo listado).
- Pendências: quickstart B13–B16 no navegador (via T036); T019b (emulador); medição na TV (T042); G-4 (aceitação do BYOK) segue gate de oferta.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, legibilidade, documentação, segredos, desempenho e TV física.

- [X] T036 E2E `tv-web/e2e/legendas-externas.mjs` (segundo Vite com `VITE_PORTAL_ORIGIN` de fixture e
  `context.route` para `/devices/enroll`, `/devices/recovery/ack` e `/device/subtitles/*`, padrão de
  `tv-web/e2e/legibilidade-tv.mjs` ~l.400–440): B1–B4, B7, B10, B12 com contagem de requisições; incluir no `SUITE`
  de `tv-web/e2e/run.mjs`.
- [X] T037 [P] Incluir o diálogo (resultados e os estados de erro) em `tv-web/e2e/legibilidade-tv.mjs` nas três
  línguas (SC-007).
- [X] T038 [P] Docs: regra curta da 090 em `CLAUDE.md` (o app desenha a legenda externa pelo tempo da mídia; nada da
  090 fora do player nem antes do `playing`); env nova em `docs/portal/operacao.md`; `.env.example` da API só com o
  nome da variável, sem valor.
- [X] T039 [P] Tamanho do pacote antes/depois (`npm run build`): se o chunk principal crescer > 10 KB gzip, carregar
  `PlayerSubtitleSearchPanel` com `lazy` (`logic §9`).
- [X] T040 Revisão de segredos: nenhuma chave em `tv-web/dist`, `CCPlayTv/`, variáveis `VITE_*`, respostas e logs da
  API (`rg -i "api-key|opensubtitles_api_key"`); `.env` nunca lido para impressão.
- [X] T041 `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` (com `npm run dev`), `uv run pytest
  tests/portal/test_subtitles.py`, `uv run ruff check .`; quickstart A e B completos.
- [X] T042 Gate G-2 + SC-009 na TV de referência (quickstart C1–C6), **com autorização antes de instalar**
  (`tizen-tv`); números em `sdd/specs/090-legendas-externas/evidencias/depois.md`. Sem linha de base limpa da 089 (`evidencias/antes.md`): medir **build A** (`85e2ead`, sem a 090) e **build B** (com a 090) na mesma sessão, autorização para cada instalação. Regressão
  acima do ruído reprova e volta para correção.

**Registro da Fase**:

- Status: **Concluída com ressalvas (2026-10-23)** — T036–T042 feitas. **T042 executada em parte**: navegação A × B e
  reprodução ociosa (sem e com legenda) medidas na TV, dentro do ruído; ficam abertos C2, C5, C6, C7 e a atribuição das
  tarefas longas da sessão interativa (ver `evidencias/depois.md` §5–§7).
- Feito: T036 `e2e/legendas-externas.mjs` (+ `e2e/lib/legendasSim.mjs`, no `SUITE`): B1–B4, B7, B10, B12, B12b/c, B13–B16
  com contagem de requisições; T037 `legibilidade-tv.mjs` ganhou `auditSubtitleScreens` (Vite próprio na porta 5181;
  flag `--so-legendas`): painel com a busca, resultados, fornecedor indisponível, sem conexão, Integrações — Legendas e o
  diálogo da chave, em pt/en/es → 18 telas, 0 achados; T038 regra curta da 090 no `CLAUDE.md`, seção em
  `docs/portal/operacao.md` (variáveis `CCPLAY_PORTAL_OPENSUBTITLES_API_KEY`/`SUBDL_API_KEY`, limites, logs, cotas,
  BYOK), `.env.example` só com nomes; T039 pacote: `index.js` 152 239 → 157 500 B gzip (+5,3 KB, abaixo dos 10 KB; a
  referência é o build commitado em `CCPlayTv/`, então inclui o que veio de outras features), `route-settings.js`
  +1,3 KB, chunks sob demanda `runtime.js` 2,8 KB e `subtitleCredentials.js` 4,0 KB → `PlayerSubtitleSearchPanel` não
  precisou de `lazy`; T040 revisão de segredos: o VALOR das duas chaves de desenvolvimento (lido do `.env`, nunca
  impresso) não existe em `tv-web/dist`, `tv-web/src`, `e2e`, `CCPlayTv`, `api`, `sdd`, `docs`, `.planning`, `CLAUDE.md`
  nem `.env.example`; nenhuma variável `VITE_*` de legenda; nenhum `logger`/`print` nos módulos de legenda do serviço;
  T041 ver abaixo. Achados no caminho: `teste-conexao-tv.mjs` navegava 3× ↓ até o card do teste de conexão e a aba
  ganhou duas linhas (agora 5×) — corrigido; novo `runtime.test.ts` (build base sem portal nem chave: opção ausente).
- Contrato: `check-contract-tests.ps1` → trava íntegra para 090, 029, 041 e 042; 5/5 contratos da 090 verdes na suíte.
- Testes executados: `npm run test` → **709 arquivos / 3 833 testes verdes**; `npm run lint` → architecture ok (baseline
  só encolheu: PlayerLayer 325→321, usePlayerPanels 367→345); `npx tsc -b` limpo; `npm run build` ok e guarda do
  Tizen vazia; `uv run pytest tests/portal/test_subtitle_providers.py tests/portal/test_subtitles_routes.py` → 12
  passaram, 1 pulado (rotas exigem o emulador); `uv run ruff check .` limpo; `npm run test:e2e` completo →
  **53/55**; `legendas-externas`, `audio-legendas-info` e `legibilidade-tv` verdes; os 2 que falharam: `teste-conexao-tv`
  (causa nossa, corrigida e verde em série) e `campos-da-listagem` — **falha também no HEAD limpo `85e2ead`** (sem a
  090; rodado num worktree à parte, em outra porta): espera `section.vod-row[aria-label="Avaliados"] .content-card` e dá
  timeout. Fora do escopo desta feature; reportado ao usuário, não corrigido.
- T042 (resumo): build A `85e2ead` × build B, 2 rodadas cada, mesma sessão, `falhas = 0`. Thread presa A 25,5%/22,9% × B
  20,8%/21,0%; fps A 40/44 × B 45/44; pior quadro A 317/267 × B 300/283 ms → B dentro ou abaixo do A (ruído entre as
  rodadas do A: 2,6 pontos, 4 fps, 50 ms). Reprodução: 0 tarefas longas no app em ~4,5 min (A), ~38 s (B sem legenda) e
  ~60 s (B com legenda ativa). O usuário viu a legenda no tempo certo, com acentos corretos e acima da barra. Pacote
  normal reinstalado; chave pessoal do SubDL do usuário continua salva na TV.
- Pendências: **T042 parcial** (não medidos: tempo até tocar, pausa/seek/retomar, troca pt↔en ×10, 10 min; e 5 tarefas
  longas de 0,75–1,6 s na sessão manual — digitar a chave, buscar, aplicar — sem atribuição a um passo); **T019b** (rotas e limitador com o emulador Firestore: a máquina tem Java 17 e o emulador pede 21+);
  quickstart B5/B5b/B6/B6b/B6c/B8/B9/B11/B12d só cobertos por teste unitário (não por E2E); quickstart C1–C7 na TV;
  `campos-da-listagem` (bug pré-existente, aguarda decisão); G-4 (aceitação do BYOK) e G-1 (cotas/custo) são gates de
  oferta, não de código.

### Checklist de Release

- [X] Fase 1 (gates) concluída — constitution 1.16.0 aprovada e aplicada
- [X] Fase 2 (fundação) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3, BYOK dos dois) concluída; G-4 (evidência de cada fornecedor) registrado como pendência de oferta na loja
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (090 e 029)
- [X] `npm run lint` sem mexer em `architecture-baseline.json` para cima
- [X] Serviço: pytest + ruff verdes; chave ausente = 503, nunca vazamento
- [X] Frontend: build base (sem `VITE_PORTAL_ORIGIN`) não mostra a opção
- [X] E2E `legendas-externas` e `legibilidade-tv` verdes
- [X] Revisão de segredos feita (T040)
- [X] G-2 + SC-009 na TV aprovados (T042) — **parcial**: navegação e reprodução dentro do ruído; C2/C5/C6/C7 e a atribuição das tarefas longas interativas pendentes (`evidencias/depois.md`) — validado pelo usuário em 2026-10-23 ("já testei tudo"); relato, sem evidência anexada (inclui C2/C5/C6/C7; a atribuição das tarefas longas, R-024, não foi feita)
- [X] G-1 registrado como pendência de **oferta em produção** (não de código)
- [X] `quickstart.md` executado com sucesso — validado pelo usuário em 2026-10-23 ("já testei tudo"); relato, sem evidência anexada

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1**: T001 bloqueia tudo que chama o serviço (T010, T014, T015 e as fases 3+). T002 precisa acontecer
  **antes** da Fase 3 mudar o player, ou ser substituída com registro.
- **Fase 2**: T003–T006 e T011 não dependem da T001 (lógica pura/local); T007→T008→T016; T009→T010→T017;
  T012→T013→T014→T014b→T015→T019 (T014c antes de T014b e T019).
- **Fase 3**: depende da Fase 2 inteira. T020 antes de T024/T025; T021–T023, T026, T027 em paralelo.
- **Fase 4**: depende da Fase 3.
- **Fase 5**: depende da Fase 3 (diálogo e hook), da T007 e da T014c; T043→T045→T046→T047; T044 e T048 em paralelo.
- **Fase 6**: depende das Fases 3 e 4.

### Parallel Opportunities

- T003, T004, T005, T006, T011, T012 em paralelo no início da Fase 2.
- T016, T017, T018 em paralelo; T019 depois de T015.
- Na Fase 3: T021, T022, T026, T027 em paralelo depois de T020 começar; T032 depois de T022 e T024.

---

## Parallel Example: User Story 1

```bash
Task: "T021 [P] [US1] SubtitleOverlay com fonte genérica"
Task: "T022 [P] [US1] buildTracksPanel com external"
Task: "T026 [P] [US1] usePlayerChrome: tracks real com a externa"
Task: "T027 [P] [US1] messages/subtitles.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 (emenda aprovada + medição "antes")
2. Fase 2 (fundação TV + serviço)
3. Fase 3 (US1) → **parar e validar** quickstart B
4. Fase 4 (US2) → Fase 6 (Polish, G-2)

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Nunca editar os 4 arquivos de contrato travados nem a trava da 029

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
