---
description: "Tasks da feature 034 — Fontes IPTV completas: estado, contagem e expiração da conta"
---

# Tasks: Fontes IPTV completas — estado, contagem e expiração da conta

**Input**: `sdd/specs/034-fontes-estado-expiracao/` (spec, plan, data-model, logic/conta-da-fonte.md, quickstart)

**Prerequisites**: plan.md, spec.md, data-model.md, logic/conta-da-fonte.md, contract-tests.lock

**Organization**: por user story. A Fase 2 (Foundational) fecha os contratos C1–C4; a Fase 4 (US2) fecha o C5.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 vencimento (P1), US2 bloqueio de acesso (P1), US3 estado da sincronização (P2), US4 contagem (P3)

## Path Conventions

- App da TV em `tv-web/src/` (`lib/catalog/`, `features/import/`, `features/sources/`, `features/profiles/`, `features/settings/`, `navigation/`)
- E2E em `tv-web/e2e/*.mjs` (Chromium, painel Xtream falso servido por `http.createServer`, padrão de `e2e/metadata-tmdb.mjs`; cadastro por `e2e/lib/entrada.mjs`)
- Docs da feature em `sdd/specs/034-fontes-estado-expiracao/`; scripts SDD em `.planning/scripts/powershell/`
- Nada em `api/` (ADR-008). Sem mudança de versão do Dexie (hoje **v15**; só campos sem índice em `sources`).

---

## Phase 1: Setup (baseline e deriva desde 30/09)

**Purpose**: confirmar que o plano ainda vale depois das features 037/038/039 antes de tocar em código.

- [X] T001 Rodar o comando dos contratos (`plan.md` → Testes de Contrato) e confirmar os 5 vermelhos pelo motivo registrado (`not implemented` / `expected undefined to deeply equal`), `check-contract-tests.ps1 -Slug 034-fontes-estado-expiracao` íntegro, e que os stubs `sourceAccount.ts`, `accountCheck.ts`, `SourceAccessGate.tsx` e os campos `account*`/`lastUnavailableSections` de `db.ts` seguem como o plano os deixou; anotar o resultado em `## Execution Notes`

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T001. Baseline conferido sem tocar em código: os 4 arquivos de contrato falham pelos motivos registrados no plano (`Error: not implemented` ×4 e `expected undefined to deeply equal { status: 'active', … }` em C4); trava íntegra; stubs `sourceAccount.ts`/`accountCheck.ts`/`SourceAccessGate.tsx` e os 4 campos de `db.ts` (`accountStatus`, `accountExpiresAt`, `accountCheckedAt`, `lastUnavailableSections`) como o plano os deixou.
- Contrato: sem contrato nesta fase (5/5 vermelhos esperados; `check-contract-tests.ps1` → trava íntegra).
- Testes executados: `npx vitest run` dos 4 arquivos de contrato → 5 falhas pelos motivos esperados.
- Pendências: nenhuma.

---

## Phase 2: Foundational (regras, consulta, repositório e pipeline)

**Purpose**: tudo que a UI consome — regras puras, a consulta leve com limite, os campos gravados pela sincronização e a visão `SourceOut`. Base de todas as stories.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

### Contrato da Fase

- C1 `sourceAccount…: descreve os cinco casos de vencimento, "hoje", e credencial recusada` — US1/AC1–5, FR-003/004/005/016, SC-001
- C2 `sourceAccount…: decide abrir, verificar ou impedir a lista pela idade e pelo resultado da verificação` — US2, FR-008/010/022, constitution 1.7.0
- C3 `accountCheck…: sem resposta do painel (rede ou demora) devolve o dado guardado, não grava nada e não passa do limite` — FR-009, SC-003, segredo
- C4 `importPipeline…: sucesso grava vencimento e verificação; credencial recusada depois marca "refused" sem perder o catálogo` — FR-001/002/016, US3/AC3, D-007
- Comando (de `tv-web/`): `npx vitest run src/lib/catalog/sourceAccount.fontes-estado.contract.test.ts src/lib/catalog/accountCheck.fontes-estado.contract.test.ts src/lib/catalog/importPipeline.fontes-estado.contract.test.ts`

### Implementation

- [X] T002 [P] Implementar `parseExpDate`, `describeAccount`, `accessFromAccount` e `decideSourceAccess` em `tv-web/src/lib/catalog/sourceAccount.ts` (`logic/conta-da-fonte.md` §2/§3; dias por calendário local, nunca `ms / dia`; data por `toLocaleDateString('pt-BR', …)`) → contratos: C1, C2
- [X] T003 [P] `tv-web/src/lib/catalog/xtreamConnector.ts`: `AccountStatus.expiresAt` (via `parseExpDate`), `isExpired` passa a usá-la, e `resolveAccountStatus` ganha o 5º parâmetro opcional `{ signal?: AbortSignal }` repassado ao `fetchJsonDirect(url, signal)` que já aceita o sinal (`logic` §4) → contrato: C3
- [X] T004 `checkSourceAccount` em `tv-web/src/lib/catalog/accountCheck.ts`: `readCredential`, `Promise.race` com o temporizador (D-005, o `fetch` pode ignorar o sinal), mapeamento `active/expired/refused`, `fresh:false` com `reason` e **nada gravado**, nunca o erro cru em log (`logic` §4) → contrato: C3
- [X] T005 `tv-web/src/lib/catalog/sourceRepository.ts`: `markAccount(sourceId, patch)` novo (não toca `connectionState`, geração nem catálogo — D-007); `SyncMark` ganha `account` e `unavailableSections` e `markSynced` os grava sempre (inclusive `[]`); `SourceView` ganha `lastUnavailableSections` e `toView` mapeia `account` e esse campo (desestruturação explícita, nenhum campo de credencial) → contrato: C4
- [X] T006 `tv-web/src/lib/catalog/importPipeline.ts`: guardar o `AccountStatus` dos dois pontos que chamam `resolveAccountStatus` (provedor por credencial, ~l.723, e `confirmPanel`, ~l.703); no sucesso (o único `markSynced`, ~l.827, que cobre os dois caminhos da 038 — `applyStructureRefresh` e `publishGeneration`) passar `account: { status:'active', expiresAt, checkedAt }` e `unavailableSections: run.unavailableSections ?? []`; antes de lançar `subscription_expired`, `markAccount('expired')`; em `fail()` por `invalid_credentials`, `markAccount('refused')`; Modo limitado (`legacy_m3u`) não grava conta (`logic` §7) → contrato: C4
- [X] T007 `tv-web/src/features/import/importApi.ts`: `toSourceOut` copia `account` e `unavailable_sections` (o tipo `SourceOut.account` já está declarado); `useCheckSourceAccount()` (mutation que chama `checkSourceAccount` e invalida `['sources']` só quando `fresh`) (`logic` §4)

### Testes da Fase

- [X] T008 [P] `tv-web/src/lib/catalog/sourceAccount.test.ts`: virada de dia local (23:59→00:01, horário de verão), `daysLeft` 0/1/7/8, "ativa" com data passada, `exp_date` `'0'`/negativo/`''`/`'abc'`/ms inválido, `expiresAt` `null` × `undefined`, M3U avulsa/`legacy_m3u` → `open`
- [X] T009 [P] `tv-web/src/lib/catalog/accountCheck.test.ts`: credencial ausente (`no_credential`), 401/`invalid_credentials` grava `refused` com `checkedAt`, `ProviderIncompatibleError`/CORS → `network` sem gravar, `clearTimeout` no `finally`, resultado e `console`/logger sem usuário/senha/host
- [X] T010 [P] `tv-web/src/lib/catalog/sourceRepository.account.test.ts`: `markAccount` não altera `connectionState`/`activeGeneration`; `markSynced` regrava `lastUnavailableSections` (inclusive `[]`) e a conta; `toView` sem segredo; `deleteSource` apaga a conta (FR-021); fonte antiga sem os campos continua válida
- [X] T011 [P] Ajustar testes existentes de `xtreamConnector` e `importPipeline` só onde o contrato mudou (`AccountStatus.expiresAt`; `markSynced` com `account`) — nunca afrouxar uma asserção não relacionada

**Critério de Conclusão**: `npx vitest run` dos 3 arquivos de contrato acima → 4/4 verdes (C1–C4); `npx tsc -b` limpo; `check-contract-tests.ps1 -Slug 034-fontes-estado-expiracao` íntegro; `npx vitest run src/lib/catalog src/features/import` verde.

**Checkpoint**: fundação pronta; a UI ainda não mudou.

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T002–T011. sourceAccount.ts implementado (parseExpDate, describeAccount, accessFromAccount, decideSourceAccess; dias por calendário local). xtreamConnector: AccountStatus.expiresAt via parseExpDate, isExpired reusa a regra, resolveAccountStatus com {signal} repassado a fetchJsonDirect. accountCheck.ts: checkSourceAccount com Promise.race + temporizador (a consulta que perde a corrida tem catch vazio), nunca grava sem resposta do painel, sem log do erro cru. sourceRepository: markAccount (não toca connectionState/geração/updatedAt), SyncMark.account/unavailableSections, markSynced regrava lastUnavailableSections sempre, SourceView.account/lastUnavailableSections. importPipeline: recordAccount (expirada grava antes de lançar), account no único markSynced (não em legacy_m3u), markAccount refused em fail() só se o painel foi consultado. importApi: SourceOut.account/unavailable_sections e useCheckSourceAccount. Fixtures de xtreamConnector.test.ts ganharam expiresAt.
- Contrato: npx vitest run (3 arquivos) → 4/4 verdes (C1, C2, C3, C4); trava íntegra. C5 segue vermelho até a Fase 4.
- Testes executados: tsc -b limpo; sourceAccount.test + accountCheck.test + sourceRepository.account.test → 25/25; npx vitest run src/lib/catalog src/features/import src/features/settings src/features/profiles src/features/sources → 624/625 (a única falha é o C5, esperado).
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Saber quando a conta vence (Priority: P1) 🎯 MVP

**Objetivo**: vencimento e chip na linha de Configurações e o chip no cartão de "Quem está assistindo?".

**Independent Test**: sincronizar contra um painel de teste com `exp_date` +30 d, +3 d, no passado, `0` e "ativa" com data passada, e conferir o texto da linha e o chip do cartão.

### Contrato da Fase

- sem contrato de UI nesta fase — a regra (`describeAccount`) já está travada em C1; a fiação fica nos testes da fase e no E2E (Polish)

### Implementation

- [X] T012 [US1] `tv-web/src/features/sources/sourceFormat.ts`: `formatAccount(source, now)` (só `provider_import_mode === 'xtream_api'`; `undefined` senão — FR-022) e `sourceAlertChips(source, now, { syncing })` na ordem do `logic` §6 (conta, "Erro na última sincronização" quando a conta não é `refused`, "Erro no EPG")
- [X] T013 [US1] `tv-web/src/features/settings/SourcesPanel.tsx`: na linha da lista, o texto de `formatAccount` e o chip (componente `Chip` da 022, texto legível e `aria-label` — FR-007); a linha de EPG continua como está (FR-023); nada de `provider_dns`/URL/usuário/senha
- [X] T014 [US1] `tv-web/src/features/profiles/ProfilesScreen.tsx`: chips de `sourceAlertChips` dentro de `.source-card-notices` (hoje só há os avisos de `sourceNotices`, desde a 037 o cartão não mostra data de sincronização); só aparecem nos casos do FR-006; estilos por token em `tv-web/src/styles/profiles.css`

### Testes da Fase

- [X] T015 [P] [US1] `tv-web/src/features/sources/sourceFormat.account.test.ts` (cinco casos do SC-001, M3U avulsa/Modo limitado sem texto, ordem e tom dos chips)
- [X] T016 [P] [US1] `tv-web/src/features/settings/SourcesPanel.account.test.tsx` e `tv-web/src/features/profiles/ProfilesScreen.account.test.tsx` (chip no cartão só nos casos do FR-006; `findUnnamedControls` vazio; nenhum segredo no `textContent` e nos `aria-*`/`title`)

**Critério de Conclusão**: `npx vitest run src/features/sources src/features/settings src/features/profiles` verde; os 4 contratos da Fase 2 continuam verdes; `npx tsc -b` limpo.

**Checkpoint**: US1 funcional e testável isoladamente (sem o bloqueio).

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T012–T016. sourceFormat.ts: formatAccount, accountChipOf, sourceAlertChips (ordem Sincronizando › conta › erro de sincronização › erro de EPG; credencial inválida/expirada já explicam a falha). SourcesPanel: SourceAccountStatus (texto da conta + chip passivo .sources-panel-chip--warning/--error). ProfilesScreen: chips em .source-card-notices (.source-card-badge--warning/--error/--neutral), no nome acessível do cartão. Tokens --warning/--danger, sem cor fixa. Decisão do usuário (R-008): o chip "Erro na última sincronização" aparece no cartão — ajustada só essa asserção do teste da 037.
- Contrato: sem contrato de UI nesta fase; C1–C4 seguem verdes e a trava íntegra.
- Testes executados: tsc -b limpo; sourceFormat.account + SourcesPanel.account + ProfilesScreen.account → 23/23; npx vitest run src/features/profiles src/features/settings src/features/sources/sourceFormat.account.test.ts → 139/139; trava da 037 íntegra.
- Pendências: Chip "Sincronizando" ainda não alimentado (Fase 5, useSourceSyncing); nenhuma outra.

---

## Phase 4: User Story 2 - Não entrar numa lista que não vai tocar (Priority: P1)

**Objetivo**: escolher uma lista vencida/recusada abre a tela de acesso, não o Início.

**Independent Test**: com a verificação guardada "expirada", escolher o cartão e conferir o motivo, as três ações, o foco e o RETURN.

### Contrato da Fase

- C5 `SourceAccessGate…: lista vencida mostra o motivo com a data, foca "Editar lista", reconsulta em "Verificar de novo" e volta com RETURN` — US2/AC1/AC2/AC5, FR-010–013, foco, segredo
- Comando (de `tv-web/`): `npx vitest run src/features/sources/SourceAccessGate.fontes-estado.contract.test.tsx`

### Implementation

- [X] T017 [US2] `tv-web/src/navigation/appNav.ts`: novo membro de `AppScreen` `{ name:'source-access'; source: SourceOut; decision: Exclude<AccessDecision,{action:'open'}> }`; **nenhuma ação nova** no redutor (D-008 — `open` e `back` já cobrem; não mexer nos contratos 023/024)
- [X] T018 [US2] `tv-web/src/features/sources/SourceAccessGate.tsx`: estados `checking`/`blocked`(`expired`|`refused`)/`rechecking`, ações Editar lista · Verificar de novo · Voltar com foco inicial no que o `logic` §5 manda, `useRemoteNav` por estado (ADR-009), single-flight, linha "Não foi possível confirmar agora" quando `fresh:false` com decisão `blocked`, RETURN nunca espera a rede; título = `display_name`, nenhum endereço/usuário/senha em texto, `aria-*` ou `title` → contrato: C5
- [X] T019 [US2] `tv-web/src/App.tsx`: extrair `enterSource(source)` (o que `chooseSource` faz hoje: `choose-source`, `writeLastSourceId`, `wakePrefetch`, `openSource.mutate`); `chooseSource` calcula `decideSourceAccess(source, Date.now())` e, se não for `open`, `dispatch({ type:'open', screen:{ name:'source-access', source, decision }, from:{ name:'profiles', mode, focusSourceId: source.id } })`; novo `case 'source-access'` que passa a fonte mais nova de `['sources']`, `onOpen` → `enterSource`, `onEdit` → `open` `edit-source` a partir da tela de acesso, `onBack` → `back`; nada de pré-carga/última lista usada enquanto o acesso não abrir (D-004, D-007) → contrato: C5
- [X] T020 [P] [US2] Estilos da tela por token em `tv-web/src/styles/profiles.css` (ou `onboarding.css`, o que já hospeda telas de entrada); sem cor/espaço/fonte fixos

### Testes da Fase

- [X] T021 [P] [US2] `tv-web/src/features/sources/SourceAccessGate.test.tsx`: `checking` tem `Voltar` focado e RETURN sai sem esperar; credencial recusada com a mensagem do FR-010; `rechecking` mantém os botões focáveis; segunda seleção em voo é ignorada; "Não foi possível confirmar agora" só com `fresh:false`; só um `.tv-focus` por estado
- [X] T022 [P] [US2] `tv-web/src/navigation/appNav.source-access.test.ts` (empilhar, `back` devolve `profiles` com `focusSourceId`, `import-back`/`source-removed` com a tela empilhada) e um teste de `App` (ou do `chooseSource` extraído) para `open`/`check`/`blocked`, `legacy_m3u` e M3U avulsa sem bloqueio, e a importação recém-concluída (`openImportedSource`) abrindo direto
- [X] T023 [P] [US2] Segredo e foco da tela de acesso: `findUnnamedControls` e varredura de `textContent`/`aria-*`/`title` sem usuário, senha e host (SC-004)

**Critério de Conclusão**: C5 verde e os contratos da Fase 2 ainda verdes (`npx vitest run` dos 4 arquivos de contrato → 5/5); `check-contract-tests.ps1` íntegro; contratos travados de 023/024 (`appNav`) intactos; `npx vitest run src/features/sources src/navigation src/App` verde.

**Checkpoint**: US1 + US2 entregam o valor central.

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T017–T023. appNav: AppScreen ganha source-access (sem ação nova no redutor, D-008; sem o campo decision — R-009). SourceAccessGate (estados verificando/bloqueada/reconsultando, single-flight, RETURN nunca espera a rede, "Não foi possível confirmar agora" só com fresh:false, resultado tardio descartado ao sair) e SourceAccessRoute (refaz a decisão a cada montagem; conta válida abre o Início direto). App.tsx: chooseSource decide o acesso e só então chama enterSource (última lista usada, pré-carga e atualização por idade só depois de abrir); case source-access com a fonte mais nova de [sources]; Editar lista empilha edit-source. formatAccountDate exportada de sourceAccount. CSS .source-access por token em profiles.css.
- Contrato: npx vitest run (4 arquivos de contrato) → 5/5 verdes (C1–C5); check-contract-tests.ps1 íntegro; todas as travas do repositório íntegras (24).
- Testes executados: tsc -b limpo; SourceAccessGate.test (11) + appNav.source-access.test (6) + App.source-access.test (5) → todos verdes; npx vitest run src/navigation src/features/sources src/features/profiles src/features/import src/features/settings src/App → 266/266.
- Pendências: FR-014 (editar → sincronizar limpa o bloqueio) e FR-020 (nunca por foco) só no E2E da Fase 7 (A-01, A-02).

---

## Phase 5: User Story 3 - Ver o estado da sincronização como ele é (Priority: P2)

**Objetivo**: "Sincronizando" durante a sincronização e "Credencial inválida" no lugar do "Erro" genérico.

**Independent Test**: ressincronizar uma lista e olhar linha e cartão durante e depois; repetir com a senha trocada no painel de teste.

### Contrato da Fase

- sem contrato nesta fase — C4 já trava o que a sincronização grava; o resto é derivação de exibição

### Implementation

- [X] T024 [US3] `tv-web/src/features/import/importApi.ts`: `useSourceSyncing(sourceId)` — store em memória por lista com `useSyncExternalStore`, mesmo padrão de `useEpgSyncing` (~l.480), alimentado por `startLocalImport` (entra no início, sai no `finally`); nunca persistido
- [X] T025 [US3] `sourceFormat.ts` `formatStatus(source, { syncing })` (`Sincronizando` › `Credencial inválida` › texto atual) e o consumo em `SourcesPanel.tsx` (componente próprio para assinar `useSourceSyncing` por lista, como `SourceEpgStatus`) e em `ProfilesScreen.tsx` (chip "Sincronizando" no cartão, já que a 037 tirou o estado dele); a ação `Ressincronizar` continua como é

### Testes da Fase

- [X] T026 [P] [US3] `tv-web/src/features/import/useSourceSyncing.test.tsx` (entra/sai por lista, sai também em falha) e testes de `formatStatus` (sincronizando × recusada × erro × nunca sincronizada)

**Critério de Conclusão**: `npx vitest run src/features/import src/features/sources src/features/settings src/features/profiles` verde; C1–C5 ainda verdes.

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T024–T026. features/import/sourceSyncing.ts (store em memória por lista, contador, nunca persistido, onSourceSyncFinished) ligado ao startLocalImport (entra antes de runImport, sai por completion ou falha ao começar); hook useSourceSyncing em importApi; App relê [sources] e [catalog-counts] ao fim da sincronização. formatStatus(source,{syncing}): Sincronizando › Credencial inválida (Xtream) › Conta expirada (quando a sincronização falhou) › erro/nunca/sincronizada como antes. SourcesPanel (SourceSyncStatus) e ProfilesScreen (SourceCardNotices) assinam o estado por lista; chip Sincronizando no cartão.
- Contrato: sem contrato nesta fase; 5/5 da 034 seguem verdes (a conferir no fim), trava íntegra.
- Testes executados: tsc -b limpo; useSourceSyncing.test (9) + ProfilesScreen.account (+1) ; npx vitest run src/features/import src/features/profiles src/features/settings src/features/sources src/App → 235/235.
- Pendências: nenhuma.

---

## Phase 6: User Story 4 - Saber o tamanho da lista (Priority: P3)

**Objetivo**: a linha da fonte diz quanto conteúdo a lista tem, só com dado real.

**Independent Test**: uma fonte Xtream e uma M3U guardada; conferir o texto de contagem de cada uma.

### Contrato da Fase

- sem contrato nesta fase

### Implementation

- [X] T027 [US4] `sourceFormat.ts` `formatCounts(counts, unavailable)` (`logic` §6: ordem canais → filmes → séries; `items` → `'1.200 canais'`; senão categorias → `'41 categorias de canais'`; tipo sem categoria omitido; tipo em `unavailable` → `'filmes não obtidos'`; encurtar para `'20 de filmes'` quando todas as partes são de categorias)
- [X] T028 [US4] `SourcesPanel.tsx`: componente por lista que lê `useCatalogCounts(source.id)` (`catalogApi.ts`, ~l.591, hoje sem consumidor) e `unavailable_sections` e mostra o texto de `formatCounts`; sem número enquanto lê

### Testes da Fase

- [X] T029 [P] [US4] `tv-web/src/features/sources/sourceFormat.counts.test.ts` (os quatro ACs: 41/20/30 categorias, M3U com 1 200 canais e 300 filmes, tipo sem categoria omitido, seção não obtida; nunca "0")

**Critério de Conclusão**: `npx vitest run src/features/sources src/features/settings` verde; C1–C5 verdes.

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T027–T029. sourceFormat.formatCounts(counts, unavailable): ordem canais › filmes › séries; itens ganham de categorias (milhar em pt-BR, singular quando 1); tipo sem categoria omitido; seção indisponível "filmes não obtidos"/"séries não obtidas"; só encurta ("20 de filmes") quando todas as partes contadas são de categorias; nunca "0" inventado. SourcesPanel: SourceCounts lê useCatalogCounts (que estava sem consumidor) e unavailable_sections, sem número enquanto lê.
- Contrato: sem contrato nesta fase; 5/5 da 034 e trava seguem íntegros.
- Testes executados: tsc -b limpo; sourceFormat.counts (9) + SourcesPanel.counts (3); npx vitest run src/features/settings src/features/sources src/features/import src/features/profiles → 240/240 (SourcesPanel agora usa useQuery: os testes que o renderizam sem provider ganharam wrapper).
- Pendências: nenhuma.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: E2E, medição real, gates e docs.

- [X] T030 Novo `tv-web/e2e/fontes-estado.mjs` (painel Xtream falso por `http.createServer`; lista cadastrada por `e2e/lib/entrada.mjs`): os 7 cenários do `quickstart.md` (vencimento +30/+3 d, vencida não abre e "Verificar de novo", sem internet, painel lento ≤ 5 s, credencial inválida, "Sincronizando", contagem) e a varredura de segredo (SC-004); incluí-lo em `test:e2e` (`tv-web/package.json`)
- [X] T031 [P] `tv-web/e2e/fontes-estado-real.mjs` (fora do `test:e2e`, lê o `.env` da raiz, imprime só a data derivada e contagens): confere SC-006, a data exibida × a que o painel declara
- [X] T032 [P] Revisar os E2E existentes que leem o cartão de lista ou a linha de Configurações (`e2e.mjs`, `home-busca-configuracoes.mjs`, `m3u-sob-demanda.mjs`) só onde o texto novo os afeta
- [X] T033 Gates: `npx tsc -b`, `npm run lint`, `npm run test` (os 5 contratos da 034 passam a verdes; flakes conhecidos `*.favorites`/`LiveScreen.test` confirmados isolados — registrar como pendência), `npm run build:tizen` (nenhum arquivo emitido novo fora do yaml), todas as travas (`check-contract-tests.ps1` por feature), `npm run test:e2e` com `npm run dev` recém-iniciado (scripts um a um se o encadeado falhar por conexão)
- [X] T034 Executar `quickstart.md` (cenários 1–7 no navegador)
- [X] T035 Docs: `CLAUDE.md` (parágrafo da 034), `README.md` (Funcionalidades), `.planning/backlog.md` (item 46 e "Fontes" ), `sdd/specs/034-.../plan.md` (R-002: formato de `exp_date` confirmado no painel real) — a constitution já está na 1.7.0

### Checklist de Release

- [X] Fase 1 (baseline) concluída
- [X] Fase 2 (Foundational) concluída — C1–C4 verdes
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída — C5 verde
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (034 e as demais travas do repositório)
- [X] `npm run test:e2e` verde (incluindo `fontes-estado.mjs`)
- [X] `quickstart.md` (navegador) executado
- [X] SC-006 conferido com a lista real (ou registrado como não executado)

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T030–T035. e2e/fontes-estado.mjs (painel Xtream falso com estado mutável; 3 rodadas verdes): +30 dias sem chip e contagem real "2 categorias de canais · 3 de filmes · 4 de séries"; foco nunca consulta o painel (FR-020, A-02); +3 dias com chip âmbar na linha e no cartão; conta vencida bloqueia (tela de acesso, foco em Editar lista, RETURN volta ao cartão, Verificar de novo abre o Início); painel que não responde decide em ~5,5 s pelo dado guardado; sem internet bloqueia com "Não foi possível confirmar agora"; credencial recusada, Editar lista abre a edição e a sincronização boa limpa o bloqueio (FR-014, A-01); "Sincronizando" no cartão; varredura de segredo em cada tela e no console (SC-004). e2e/fontes-estado-real.mjs (fora do test:e2e): na lista real do .env a data exibida confere com a do painel (SC-006, R-002 resolvido). Linha de test:e2e atualizada. Docs: CLAUDE.md, README.md, backlog item 46, R-002. Dois avisos novos react(purity) do lint (Date.now no render) corrigidos com useState.
- Contrato: 5/5 verdes (C1–C5); check-contract-tests.ps1 íntegro; todas as 24 travas do repositório íntegras.
- Testes executados: tsc -b limpo; oxlint sem aviso nos arquivos tocados; npx vitest run → 281 arquivos, 2210/2210 (os 5 vermelhos da 034 que a suíte carregava desde a 040 fecharam); npm run build:tizen ok; npm run test:e2e → 24 scripts, todos "Todas as verificações passaram" contra o dev server da 5173; quickstart 1–6 pelo E2E novo, o 7 (contagem) pelo E2E (Xtream) e pelos testes de formatCounts (M3U guardada).
- Pendências: Edição com salvar (Editar lista → alterar credencial → sincronizar) não é percorrida de ponta a ponta no navegador: o E2E abre a edição, volta e prova a limpeza do bloqueio por sincronização boa; o salvar da edição é coberto só pelos testes do App. Passada na TV física recomendada (tela de acesso e chips), não gate. A conta da lista real vence em 11/10/2026.

---

## Dependencies & Execution Order

- **Fase 1** → **Fase 2** (bloqueia tudo) → **Fase 3 (US1)** e **Fase 4 (US2)** podem andar em paralelo depois da 2 (arquivos diferentes: `sourceFormat`/`SourcesPanel`/`ProfilesScreen` × `appNav`/`App`/`SourceAccessGate`), exceto que T019 e T014 mexem em telas vizinhas — quem mergear por último rebaseia.
- **Fase 5 (US3)** depende de T012/T013/T014 (usa os mesmos pontos de exibição); **Fase 6 (US4)** só de T013.
- **Fase 7** depois de 3–6.

### Parallel Opportunities

- T002/T003 (arquivos diferentes); T008–T011.
- T020/T021/T022/T023 dentro da Fase 4.

## Implementation Strategy

### MVP First (US1 + US2, ambas P1)

1. Fase 1 → Fase 2 → Fase 3 → Fase 4.
2. **Parar e validar**: C1–C5 verdes, E2E do vencimento e do bloqueio (T030 parcial) no navegador.

### Incremental Delivery

1. US1 (vencimento) → US2 (bloqueio) → US3 (estado) → US4 (contagem) → Polish.

## Notes

- Nunca editar os arquivos travados (`*.fontes-estado.contract.test.*`).
- Dexie: **não** subir versão; se algum campo precisar de índice, parar e perguntar (a próxima seria a v16).
- Falha de rede sozinha nunca impede a lista (constitution 1.7.0, D-003); impedir só com confirmação do painel ou dado guardado vencido/recusado.
- Commitar por fase, só quando o usuário pedir.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
