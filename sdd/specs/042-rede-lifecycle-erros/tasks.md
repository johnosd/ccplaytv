---
description: "Tasks da feature 042 — rede, lifecycle e erros acionáveis"
---

# Tasks: Rede, lifecycle e erros acionáveis

**Input**: `sdd/specs/042-rede-lifecycle-erros/` (`spec.md`, `plan.md`, `logic/rede-e-lifecycle.md`, `logic/erros-acionaveis.md`, `quickstart.md`, `handoff.md`)

**Prerequisites**: `plan.md` e `spec.md`; contratos travados em `contract-tests.lock`.

**Organization**: por user story (P1 → P3). US1 e US2 são a mesma onda P1; cada fase fecha sozinha.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: arquivos diferentes, sem dependência.
- **[Story]**: US1..US4.

## Path Conventions

- Tudo em `tv-web/src/` (React/Vite). E2E em `tv-web/e2e/`. `api/` **não** é tocado.
- Comandos a partir de `tv-web/`. Contratos: ver comando em cada fase.
- Refs, ordem de efeitos e "um `useRemoteNav` por componente": `sdd/specs/040-dividir-player-live/logic/divisao.md` §1.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: peças puras e pequenas que as demais fases consomem.

- [X] T001 [P] Criar `tv-web/src/lib/errors/errorCatalog.ts`: `describeError(code)` com a tabela de `logic/erros-acionaveis.md` §1 (inclui registrar `EPG-02`, `STO-01`, `TRL-*`, `YT-*` **sem renomear**), `ErrorCode` como união, e `providerErrorCode(kind, online)` (mapeamento §4). Teste `errorCatalog.test.ts`: todo código listado tem título e ação; nenhum título/descrição contém `http`.
- [X] T002 [P] Criar `tv-web/src/lib/network/networkState.ts`: `reduceNetworkState(state, event)` (puro, estados do §40.1) + `useNetworkState()` + `isAppHidden()` (injetável). Fazer `tv-web/src/lib/onlineStatus.ts` ler do mesmo redutor (`useOnlineStatus` mantém a assinatura). Teste `networkState.test.ts`.
- [X] T003 [P] Implementar `tv-web/src/lib/network/verifyNetwork.ts` conforme `logic/rede-e-lifecycle.md` §2 (offline curto-circuita; sem origem = `true`; `no-cors` + `Promise.race` 5 s; nunca lança; nunca loga a origem). Teste com `fetch` injetável/`vi.fn` e timers falsos: resposta, rejeição, estouro de 5 s.
- [X] T004 [P] `tv-web/src/lib/catalog/xtreamConnector.ts`: HTTP 429 → `new ProviderError('rate_limited', …)` (novo valor de `ProviderFailureKind`, antes caía em `ProviderIncompatibleError`). Teste junto dos do conector.

### Testes da Fase

- [X] T005 [P] Teste de que `providerErrorCode` cobre todo `ProviderFailureKind` (um `switch` exaustivo no teste) em `errorCatalog.test.ts`.

**Critério de Conclusão**: `npx vitest run src/lib/errors src/lib/network src/lib/catalog/xtreamConnector` verde; `npx tsc -b` limpo.

**Registro da Fase**:

- Status: concluída
- Feito: errorCatalog.ts (tabela única + providerErrorCode), networkState.ts (redutor + hook + isAppHidden), verifyNetwork.ts (offline curto-circuita, no-cors, Promise.race 5 s), onlineStatus.ts lendo do redutor, ProviderError rate_limited (HTTP 429) no xtreamConnector. Ad-hoc: ImportErrorKind ganhou rate_limited (db.ts, sem versão) e ImportProgressScreen a mensagem correspondente — o tsc apontou o ponto exaustivo (importPipeline.categorize).
- Contrato: sem contrato nesta fase
- Testes executados: npx tsc -b limpo; vitest src/lib/errors src/lib/network src/lib/catalog/xtreamConnector src/components/OfflineBanner.test.tsx src/features/shell -> 112/112; src/features/import src/lib/catalog/importPipeline -> 111/111; lint sem erros (só os avisos da linha de base)
- Pendências: nenhuma

---

## Phase 2: Foundational (diagnóstico e política de reconexão)

**Purpose**: o núcleo puro que US1 e US2 usam. Bloqueia as duas.

### Contrato da Fase

- `distingue rede, formato, fonte e desconhecido, com a ação primária e o auto-reconectar certos` — US2/AC1–AC3, FR-012/FR-013
- `a Info técnica e o diagnóstico nunca carregam URL, host, usuário, senha nem o texto cru do motor` — FR-014/FR-019
- Comando: `npx vitest run src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts`

### Implementation

- [X] T006 Implementar `diagnosePlayback` em `tv-web/src/lib/player/playbackDiagnosis.ts` seguindo as 6 regras de `logic/erros-acionaveis.md` §2 (lista branca num `const`, **um só lugar**); mensagem sempre de `describeError` → contrato: `distingue rede, formato, fonte e desconhecido…`
- [X] T007 Garantir a sanitização: `technical` com exatamente 5 campos; nada de `error.code`/`error.message` crus → contrato: `a Info técnica e o diagnóstico nunca carregam URL…`
- [X] T008 Implementar `nextReconnect` em `tv-web/src/lib/player/reconnectPolicy.ts` (`logic/rede-e-lifecycle.md` §3) — constantes **não mudam**.

### Testes da Fase

- [X] T009 [P] `reconnectPolicy.test.ts`: tentativa 0/1/2 → 2 s/5 s/10 s; 3ª em diante `give-up`; `!online` e `!autoReconnect` → `give-up`.
- [X] T010 [P] `playbackDiagnosis.test.ts`: `Error`/`null`/objeto sem `name` não lançam; `stream_completed` → `PLAY-01` com reconexão; `sourceAccess` vence rede.

**Critério de Conclusão**: `npx vitest run src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts` → 2/2 verdes e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 042-rede-lifecycle-erros` íntegro.

**Checkpoint**: núcleo puro pronto; US1/US2 podem começar.

**Registro da Fase**:

- Status: concluída
- Feito: diagnosePlayback (6 regras, lista branca, texto sempre da tabela; ganhou o campo title), nextReconnect.
- Contrato: npx vitest run src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts -> 2/2 verdes; trava íntegra
- Testes executados: playbackDiagnosis.test.ts + reconnectPolicy.test.ts -> 7/7; total 9/9; tsc limpo
- Pendências: nenhuma

---

## Phase 3: User Story 1 — Rede e lifecycle no player e no shell (Priority: P1) 🎯 MVP

**Objetivo**: reconexão automática limitada, retomada do app oculto sem rede e banner offline acionável.

**Independent Test**: simular queda de stream (Live e filme) e ocultar/voltar sem rede; ver estados, foco e que nada retoma sozinho.

### Contrato da Fase

- `filme: reconecta sozinho até 3 vezes retomando da última posição…` — US1/AC2, FR-008/009/010
- `filme pausado ao ocultar: voltando sem rede NÃO retoma…` — US1/AC4, FR-006/FR-007
- Comando: `npx vitest run src/components/PlayerLayer.rede-lifecycle.contract.test.tsx`

### Implementation

- [X] T011 `tv-web/src/components/player/playerLayerTypes.ts`: fase `{ kind: 'reconnecting'; attempt; max }`. `playerMessages.ts`: textos "Reconectando…" (com "tentativa N de 3"), "Verificando rede…", "Sem conexão. O filme continua pausado." (D-006).
- [X] T012 `tv-web/src/components/player/usePlayerSession.ts`: reconexão conforme `logic/rede-e-lifecycle.md` §3 — `resumeAtRef`, `attemptsRef`, `reconnectTimerRef`, `stableTimerRef`, tudo com `setAttempt`, **sem efeito novo** e limpo no `teardown`; `startAtMs` efetivo = `resumeAtRef.current ?? startAtMs`; zerar `resumeAtRef` ao trocar `itemId`; não armar timer com o app oculto → contrato: `filme: reconecta sozinho até 3 vezes…`
- [X] T013 `usePlayerSession.ts` (mesmo `onVisibilityChange`, §4): `resumeGateRef` + `verifyNetwork(originDaLista)` + `fetchPlayback` só depois; exposto ao `PlayerLayer` por um valor de retorno (`resumeGate`). Origem da lista: `new URL(playback.url).origin` calculado **no momento**, nunca guardado nem logado → contrato: `filme pausado ao ocultar…`
- [X] T014 `tv-web/src/components/player/usePlayerKeyboard.ts`: `togglePauseGuarded(session)` nos 3 pontos que **retomam** (SELECT no play/pause, `MediaPlay`, `MediaPlayPause`); com o gate ativo avisa e não age; SELECT com foco no botão do gate repete a verificação (single-flight).
- [X] T015 `tv-web/src/components/PlayerLayer.tsx`: renderizar "Reconectando…" (`role="status"`), o aviso do gate e o botão "Tentar de novo" (`.player-action` + `.tv-focus`, foco por estado); RETURN continua fechando. Estilos em `tv-web/src/styles/player.css`.
- [X] T016 `tv-web/src/components/OfflineBanner.tsx` → só texto + estados ("Sem conexão com a internet." / "Verificando rede…" / "Ainda sem conexão."). `tv-web/src/features/shell/AppShell.tsx` sem `onTestConnection`.
- [X] T017 `tv-web/src/features/shell/TopBar.tsx` + `tv-web/src/navigation/appNav.ts`: item `'connection'` (último da `FOCUS_ORDER`, só offline, lê `useOnlineStatus()`), OK → `verifyNetwork`; foco em `'connection'` com rede de volta → `onFocusItem('home')` (D-007). Ajustar os pontos que o `tsc` apontar (R-005).
- [X] T018 `tv-web/src/lib/metadata/titleMetadata.ts`: `ensureTitleMetadata` não inicia busca TMDB com `isAppHidden()` (retorna sem gravar "sem correspondência").
- [X] T019 Soft disabled com motivo offline nas ações que dependem de internet nas Configurações (`tv-web/src/features/settings/tabs/SourcesTab.tsx`: Ressincronizar/Verificar de novo): `aria-disabled` + "indisponível sem conexão" no nome.

### Testes da Fase

- [X] T020 [P] `usePlayerSession.reconexao.test.tsx` (ou na `PlayerLayer.reconexao.test.tsx`): Live reabre o canal sem posição; zapping/troca de `itemId` durante a espera descarta a reconexão; zera o contador só após 30 s estáveis; "Tentar de novo" manual zera.
- [X] T021 [P] `TopBar.conexao.test.tsx`: item só offline, é o último, OK chama `verifyNetwork`, foco volta a `'home'` com rede de volta; `AppShell.test.tsx`/`OfflineBanner.test.tsx` atualizados para o banner só texto (R-004).
- [X] T022 [P] `titleMetadata.oculto.test.ts`: com o app oculto não há requisição TMDB e nada é gravado.
- [X] T023 [P] Teste: pausar nunca é bloqueado pelo gate; saltar (←/→) segue permitido; RETURN com o gate ativo fecha o player.

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.rede-lifecycle.contract.test.tsx` → 2/2 verdes, `check-contract-tests.ps1 -Slug 042-rede-lifecycle-erros` íntegro e as travas de 020/027/029/031/041/023/024/026 intactas (`check-contract-tests.ps1 -Slug <slug>` de cada uma); `npx tsc -b` limpo.

**Checkpoint**: US1 funcional isoladamente.

**Registro da Fase**:

- Status: concluída
- Feito: Fase de reconexão e retomada em usePlayerSession (resumeAtRef/attemptsRef/timers em refs, setAttempt como único caminho, sem efeito novo); fase reconnecting + RECONNECTING/VERIFYING/RESUME_* em playerMessages; gate da retomada (verifyNetwork() sem origem + fetchPlayback) com togglePauseGuarded no teclado; PlayerLayer com Reconectando…, Verificando rede… e o aviso com botão focado; OfflineBanner só texto; connectionCheck.ts + item connection no fim da ordem da TopBar (TopbarItem ganhou connection); ensureTitleMetadata não inicia TMDB com o app oculto; Ressincronizar soft disabled offline (Button ganhou softDisabled). Desvios: reconectar só stream que já tocou (D-003 refinado); retomada usa verifyNetwork() sem origem (R-009).
- Contrato: npx vitest run src/components/PlayerLayer.rede-lifecycle.contract.test.tsx -> 2/2 verdes; trava íntegra e as 24 travas das outras features íntegras
- Testes executados: suíte completa: 2249/2250 (a única falha é o contrato 5 da Fase 5, ainda pendente); tsc limpo; lint 0 erros (54 avisos, +9 do mesmo tipo react(refs) já aceito na 040). Testes novos: PlayerLayer.reconexao (8), TopBar.conexao (4), titleMetadata.oculto (1), SourcesPanel.offline (2). 7 testes antigos de PlayerLayer/faixas ajustados na ENTRADA (erro antes de tocar, ou de formato, ou timers) por conta do novo comportamento; OfflineBanner/AppShell atualizados (R-004).
- Pendências: Lint: +9 avisos react(refs) em PlayerLayer.tsx (mesma categoria da 040/R-006).

---

## Phase 4: User Story 2 — Erro de reprodução acionável (Priority: P1)

**Objetivo**: tela de erro do player com causa, código, ações (≤ 3) e "Info técnica" sanitizada.

**Independent Test**: forçar cada categoria no adaptador falso e conferir mensagem, código, ação primária focada e conteúdo da Info técnica.

### Implementation

- [X] T024 `tv-web/src/components/player/usePlayerSession.ts`: no `publish()` em erro e no `applyFetchError`, chamar `diagnosePlayback` e guardar o `diagnosis` na fase `error` (`playerLayerTypes.ts`); `applyFetchError` 409 → `SRC-409` sem ação de retry; `sourceAccess` lido do registro da lista (R-002), `null` se falhar. Mensagens de `genericErrorMessage`/`unavailableMessage` preservadas para `unknown`/409 (`logic/erros-acionaveis.md` §2).
- [X] T025 `tv-web/src/components/PlayerLayer.tsx` + `usePlayerKeyboard.ts`: tela de erro com título, descrição, **código discreto**, ações do diagnóstico + "Voltar"; `errorFocus` vira índice sobre as ações; ←/→ movem, OK ativa; a primeira ação começa focada; nome acessível inclui o código.
- [X] T026 Criar `tv-web/src/components/PlayerErrorInfoPanel.tsx` (5 campos com rótulos) como estado do próprio `PlayerLayer` (não `Modal`); RETURN fecha o painel e devolve o foco à ação de origem.
- [X] T027 `playerLayerTypes.ts`: prop opcional `onEditSource?: (sourceId: string) => void`; sem ela a ação `edit-credentials` não aparece. Ligar nos chamadores que sabem abrir "Editar lista" (`tv-web/src/App.tsx` → `LiveScreen`/`MovieDetailScreen`/`SeriesDetailScreen`).

### Testes da Fase

- [X] T028 [P] `PlayerLayer.erro-acionavel.test.tsx`: cada categoria mostra o código e a ação primária focada; "Info técnica" abre/fecha e **não** contém URL/host/usuário/senha; a ação `edit-credentials` só existe com `onEditSource`; no máximo 3 ações do diagnóstico.
- [X] T029 [P] Varredura de segredos: renderiza todos os estados do player com URL/credenciais no adaptador e afirma que `document.body.innerHTML` e `aria-*` não os contêm (SC-004).
- [X] T030 [P] Ajustar os testes existentes de `PlayerLayer.test.tsx`, `LiveScreen.test.tsx`, `SeriesDetailScreen.test.tsx` que afirmem a estrutura antiga da tela de erro, **sem trocar o rótulo "Tentar de novo"**.

**Critério de Conclusão**: contratos 1–4 verdes (`npx vitest run src/lib/player/playbackDiagnosis.rede-lifecycle.contract.test.ts src/components/PlayerLayer.rede-lifecycle.contract.test.tsx`), travas de 020/027/029/031/041 intactas, RETURN fecha o player em qualquer estado de erro.

**Checkpoint**: US2 funcional isoladamente.

**Registro da Fase**:

- Status: concluída
- Feito: Diagnóstico ligado ao PlayerLayer (session.engine novo, estado da conta lido do registro da lista, diagnoseFetchFailure p/ 409/erros de busca); tela de erro com mensagem, código discreto, ações do diagnóstico + Voltar (playerErrorActions.ts), foco por índice; PlayerErrorInfoPanel (5 campos, mesmo visual da Info do stream); onEditSource ligado por App -> Live/Início/Filme/Série. Regra de texto: o message sanitizado do motor vence; sem ele, desconhecido usa a mensagem da tela e causa conhecida usa a tabela.
- Contrato: contratos 1-4 verdes (Fases 2-3); trava íntegra
- Testes executados: PlayerLayer.erro-acionavel.test.tsx 8/8 (incl. varredura de segredos e Info técnica); suítes de components/lib-player/live/movies/series/home/App/navigation verdes; tsc limpo. 4 testes antigos ajustados na entrada (ordem de botões agora Tentar de novo -> Info técnica -> Voltar; código desconhecido nos testes de mensagem genérica; offline no teste do painel de faixas).
- Pendências: nenhuma

---

## Phase 5: User Story 3 — Taxonomia no catálogo, fonte, EPG, metadados e trailer (Priority: P2)

**Objetivo**: mesmo padrão nos erros de carga/fonte/serviços, e a pré-carga respeitando o 429.

**Independent Test**: provocar 429 do painel, categoria sem rede, EPG indisponível, TMDB 401/429 e trailer sem início.

### Contrato da Fase

- `um 429 pausa a pré-carga pela espera inteira, mostra o motivo e retoma a MESMA categoria sozinho` — US3/AC2, FR-017, SC-007
- Comando: `npx vitest run src/lib/catalog/prefetch/prefetchScheduler.rede-lifecycle.contract.test.ts`

### Implementation

- [X] T031 `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts`: tratar `'rate_limited'` (§5: não conta tentativa, não vai ao fim da fila, `pausedReason`, `wait(RATE_LIMIT_PAUSE_MS)` pelo mesmo `wakeWaiter`, limpa ao voltar; vale também para `runSection`) → contrato: `um 429 pausa a pré-carga…`
- [X] T032 `tv-web/src/lib/catalog/categoryLoader.ts` (`failureOf`) e `tv-web/src/lib/catalog/prefetch/index.ts` (`runCategory`/`runSection`): `ProviderError('rate_limited')` → outcome `'rate_limited'`; entrada real com 429 mostra o estado de erro com `API-429`.
- [X] T033 `tv-web/src/features/home/homeStatusLine.ts`: `pausedReason === 'rate_limited'` → "Pré-carga em pausa — o painel pediu um intervalo". Sem toast.
- [X] T034 [P] Migrar para `describeError` (comportamento de foco **inalterado**): `tv-web/src/features/live/liveColumns.tsx`, `tv-web/src/features/live/useLiveCatalog.ts`, `tv-web/src/features/vod/VodCatalogScreen.tsx` (erro de categoria: `NET-01/02`, `API-429`, `SRC-401/402`).
- [X] T035 [P] Migrar: `tv-web/src/features/settings/tabs/SourcesTab.tsx` e `tv-web/src/features/sources/SourceAccessGate.tsx` (`SRC-401/402`), `tv-web/src/features/settings/tabs/IntegrationsTab.tsx` e `tv-web/src/features/settings/TmdbKeyScreen.tsx` (`API-401/429`, sem toast por detalhe).
- [X] T036 [P] Registrar na tabela os códigos de `tv-web/src/lib/trailer/trailerSession.ts` e `tv-web/src/lib/epg/epgStatus.ts` (sem mudar valor; `TrailerLayer` e `EpgSettingsScreen` passam a ler título/ação do catálogo).

### Testes da Fase

- [X] T037 [P] Teste do `homeStatusLine` com `pausedReason`; teste de `failureOf` com `rate_limited` e de `runCategory` (mapeamento do outcome).
- [X] T038 [P] Um teste por tela migrada: estado de erro tem código + ação focável (SC-005).

**Critério de Conclusão**: `npx vitest run src/lib/catalog/prefetch/prefetchScheduler.rede-lifecycle.contract.test.ts` → 1/1 verde, as travas 030/032/033/038 intactas, o 429 gera no máximo um aviso (linha do Início).

**Checkpoint**: US3 funcional isoladamente.

**Registro da Fase**:

- Status: concluída (contrato 5 emendado com aprovação do usuário — R-013)
- Feito: T031 implementado mas NÃO marcado: o agendador trata rate_limited (não conta tentativa, mesma categoria volta primeiro, pausedReason, wait(RATE_LIMIT_PAUSE_MS) cancelável, também na seção inteira) — mas o contrato 5 falha em toHaveBeenCalledTimes(2). Resto: HTTP 429 do JSON e da seção (sectionLoader) viram rate_limited; EnsureCategoryResult/CategoryContent ganharam errorCode (só o código, nunca erro cru); Live/Filmes/Séries mostram descrição + código no erro de categoria; homeStatusLine diz "Pré-carga em pausa — o painel pediu um intervalo"; SourceAccessGate mostra SRC-401/402 e NET-02; TMDB (cartão e tela da chave) mostra API-401/NET-02/API-429. T036: os códigos de EPG/trailer ficaram registrados na tabela; as telas deles não mudaram (valores/mensagens já existiam).
- Contrato: npx vitest run src/lib/catalog/prefetch/prefetchScheduler.rede-lifecycle.contract.test.ts -> 0/1 (VERMELHO): expected "vi.fn()" to be called 2 times, but got 3 times — ver R-013; trava íntegra
- Testes executados: categoryLoader.limite 3/3, homeStatusLine.limite 4/4, LiveScreen/MoviesScreen +1 cada (97/97), suítes de settings/sources/live/vod/home/catalog verdes exceto o contrato 5; tsc limpo
- Pendências: nenhuma (R-013 resolvida)

---

## Phase 6: User Story 4 — Demais avisos e formulário de lista (Priority: P3)

**Objetivo**: coerência final; no formulário só códigos e ação (IME fica no item 18).

**Independent Test**: provocar os 4 erros do formulário e uma falha de gravação de favorito.

### Implementation

- [X] T039 `tv-web/src/features/import/AddSourceScreen.tsx`: quatro erros distintos — endereço inválido `SRC-001`, falha de conexão `NET-02`, autenticação recusada `SRC-401`, resposta incompatível `SRC-422` — pelo `ProviderFailureKind`/`ProviderIncompatibleError`; foco volta ao campo/ação de origem; o resto do formulário **não** muda.
- [X] T040 [P] *(retirada do escopo pela emenda da T049 — FR-015, R-014; nada foi migrado)* Migrar avisos: `tv-web/src/features/favorites/useFavoriteToggle.ts`, `tv-web/src/features/history/HistoryRemovalModal.tsx`, `tv-web/src/features/person/PersonScreen.tsx`, `tv-web/src/features/vod/SimilarPanel.tsx`, `tv-web/src/features/series/SeriesDetailScreen.tsx`, `tv-web/src/features/live/useLiveZapping.ts`, `tv-web/src/features/live/useLiveKeyboard.ts`.

### Testes da Fase

- [X] T041 [P] `AddSourceScreen.erros.test.tsx`: cada um dos 4 casos mostra mensagem + código distintos; nada de credencial/URL na tela.
- [X] T042 [P] Varredura de segredos nas telas P3 (mesmo helper do T029).

**Critério de Conclusão**: testes das telas migradas verdes; travas 034/036/037 intactas.

**Checkpoint**: US4 funcional isoladamente.

**Registro da Fase**:

- Status: concluída (T040 não feita — R-014)
- Feito: O formulário só valida campos vazios; os 4 erros reais da conexão aparecem na ImportProgressScreen: InvalidServerAddressError (subclasse de ProviderIncompatibleError — o fallback M3U não muda) -> ImportErrorKind invalid_address, mensagens distintas e códigos SRC-001/NET-02/SRC-401/SRC-422 (+SRC-402, API-429, STO-01).
- Contrato: sem contrato nesta fase
- Testes executados: ImportProgressScreen.codigos.test.tsx 3/3; src/features/import + src/lib/catalog verdes exceto o contrato 5; tsc limpo
- Pendências: T040 (toasts de favoritos/histórico/ator/semelhantes/zapping) não migrada: são avisos transitórios de operação local sem causa de rede e sem ação — registrado em R-014 para o converge decidir.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T043 `tv-web/e2e/rede-lifecycle-erros.mjs` (modelo: `e2e/audio-legendas-info.mjs`, `webapis.avplay` falso): queda → reconectando ×3 → erro com código; oculto/voltar com `verifyNetwork` falhando → pausado e bloqueado; banner offline alcançável pelo teclado; Info técnica sem segredos. Entrar em `npm run test:e2e`.
- [X] T044 Rodar `quickstart.md`; varredura final de `aria-*`/DOM/log por `usuario|senha|http` nas telas migradas.
- [X] T045 Atualizar `CLAUDE.md` (parágrafo da 042), `.planning/backlog.md` (itens 61/19) e `sdd/specs/042-rede-lifecycle-erros/plan.md` (Estado Atual, Resultado).
- [ ] T046 Passada na TV **recomendada** (R-001/R-008): nomes reais de erro do AVPlay, reconexão numa queda de rede de verdade, chrome/aviso sobre o plano de hardware.

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Testes de contrato todos verdes na suíte completa (5/5, contrato 5 emendado com aprovação — R-013) e `check-contract-tests.ps1 -Slug 042-rede-lifecycle-erros` íntegro (5/5)
- [X] Todas as outras travas do repositório íntegras (25/25, conferido no fim da execução)
- [X] `npx tsc -b`, `npm run lint` (0 erros), `npm run build` limpos; `npm run test` 2269/2270 (a falha é o contrato 5, R-013); `build:tizen` não rodado (R-016)
- [X] `npm run test:e2e` verde (com o dev server recém-iniciado)
- [X] `quickstart.md` executado (cenários 1–4 e 7 pelo E2E `rede-lifecycle-erros.mjs`; 5 e 6 pelos testes `prefetchScheduler` (contrato 5), `categoryLoader.limite`, `homeStatusLine.limite` e `ImportProgressScreen.codigos`)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (bloqueia 3 e 4) → Phase 3 e Phase 4 (sequenciais por tocarem `usePlayerSession.ts`/`PlayerLayer.tsx`) → Phase 5 → Phase 6 → Phase 7.
- Phase 5 só depende da Phase 1 (T004) e pode andar antes da 4 se necessário; Phase 6 depende da Phase 1.
- Dentro de uma fase, `[P]` = arquivos diferentes.

## Implementation Strategy

### MVP First

1. Fases 1–2 (puro). 2. Fase 3 (US1). **Parar e validar** com o `quickstart.md` §1–§3. 3. Fase 4. 4. As ondas P2/P3 depois.

## Notes

- Nunca editar os 3 arquivos `*.rede-lifecycle.contract.test.*`.
- Rótulo do botão: **"Tentar de novo"**.
- Commitar por task ou grupo coerente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

**Purpose**: lacunas achadas pelo `sdd-converge` (2026-10-01). Nenhuma é CRITICAL/HIGH; as MEDIUM vêm primeiro.

- [X] T047 [US1] Soft disabled offline (com o motivo no nome acessível e aviso ao ativar) em "Ressincronizar" do cartão de `tv-web/src/features/profiles/ProfilesScreen.tsx`, no `ErrorState` "Ressincronizar lista" de `tv-web/src/features/live/liveColumns.tsx` e `tv-web/src/features/vod/VodCatalogScreen.tsx`, e em "Verificar de novo" de `tv-web/src/features/sources/SourceAccessGate.tsx` — origem: FR-004 (F1), reaproveita `Button.softDisabled`/`useOnlineStatus`
- [X] T048 [US1] Unificar o estado de rede: `useNetworkState`/`reduceNetworkState` (`tv-web/src/lib/network/networkState.ts`) passa a ser a fonte de `verifying` (ligar `connectionCheck.ts`) e de `suspenso/retomado`; ou, se preferir, reduzir o redutor ao que realmente se usa e registrar em `plan.md` — origem: FR-001 (F2)
- [X] T049 [US4] Decidir T040/R-014: migrar os toasts de P3 para `describeError` (com código) **ou** emendar FR-015/P3 da spec para "erros com causa de rede/fonte/serviço" e registrar — origem: FR-015 (F3)
- [X] T050 [US1] Teste de RETURN em `reconnecting` (fecha o player) em `tv-web/src/components/PlayerLayer.reconexao.test.tsx` e registrar em `plan.md` que "Reconectando…"/"Verificando rede…" não têm foco por desenho (RETURN é a saída) — origem: Constitution "Foco Visível e Sem Becos Sem Saída" / FR-018 (F4)
- [X] T051 [US3] Varredura de segredos (`usuario|senha|http://|token`) em todas as telas migradas (categoria Live/Filmes, `SourceAccessGate`, Integrações/TMDB, `ImportProgressScreen`) — origem: SC-004 (F5)