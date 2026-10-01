---
description: "Tasks da feature 031-epg-guia-completo"
---

# Tasks: EPG — Guia Completo em Tela Cheia

**Input**: Documentos de design de `sdd/specs/031-epg-guia-completo/`

**Prerequisites**: plan.md, spec.md, logic/*.md, quickstart.md (sem research/data-model/contracts — ver plan.md)

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/` (client-first, ADR-008); `api/` não é tocado.
- Guia em `tv-web/src/features/live/guide/`; hospedeiros em `tv-web/src/features/live/LiveScreen.tsx` e `tv-web/src/components/PlayerLayer.tsx`.
- Telas falam só com `tv-web/src/features/catalog/catalogApi.ts` e `tv-web/src/features/import/importApi.ts` (nunca `lib/` direto), exceto o que a 030 já expõe em `lib/epg/*` para leitura pura (`nowNext`, `formatEpgTime`).
- Estilos em `tv-web/src/styles/*.css`, só tokens V14 de `tv-web/src/index.css`.
- E2E em `tv-web/e2e/*.mjs`. Comandos rodam de `tv-web/`, exceto os `.planning/scripts/powershell/*.ps1` (da raiz).
- **Editar arquivos com Edit/Write.** No Windows PowerShell 5.1, `Set-Content -Encoding UTF8` grava BOM.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar o terreno antes de codar.

- [x] T001 Confirmar: feature 030 entregue (`check-contract-tests.ps1 -Slug 030-epg-dados-agora` íntegro; `useEpgPrograms`/`nowNextForChannel`/`formatEpgTimeRange` existem); `npm run dev` recém-iniciado; ler `logic/*.md`, os stubs e os 4 arquivos de contrato

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: O modelo puro da grade — sem React, testável.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `navega por programa e por canal mantendo a hora de referência, e as abas Hoje/Amanhã saltam de dia` — origem: US2/AC1-AC3, FR-004/FR-014/FR-015/FR-016
- `a grade é proporcional e recortada na janela, e a rolagem mantém o foco visível dentro dos limites` — origem: US1/AC2, FR-001/FR-003/FR-014
- Comando: `npx vitest run src/features/live/guide/guideGrid.epg-guia-completo.contract.test.ts`

### Implementation

- [x] T002 [P] `programCovering`, `programNearest` (empate: o anterior) e `initialFocus` em `tv-web/src/features/live/guide/guideGrid.ts` — `logic/grade-e-foco.md` §1
- [x] T003 `moveHorizontal` e `moveVertical` em `tv-web/src/features/live/guide/guideGrid.ts` (pular lacuna, saturar, linha vazia, `null` na borda) → contrato: `navega por programa e por canal…`
- [x] T004 `dayOfTime` e `jumpToDay` em `tv-web/src/features/live/guide/guideGrid.ts` com `Date` **local** (`new Date(y, m, d + 1)`, nunca +24 h) → contrato: `navega por programa e por canal…`
- [x] T005 [P] `blocksInView`, `scrollForFocus` e `tickTimes` em `tv-web/src/features/live/guide/guideGrid.ts` (percentuais recortados; marcas de 30 min por `getMinutes()` local) → contrato: `a grade é proporcional…`
- [x] T006 [P] `tv-web/src/features/live/guide/guideRows.ts` (novo): `buildGuideRows(items, lookup)` (soma `offsetMs`, ordena, descarta programa inválido; item sem `epg_channel_id` ou sem programa = `programs: []`), `guideBounds(now)` (`[now−12 h, now+48 h]`) e `initialView(now, bounds)` (`max(from, floorLocal30(now) − 30 min)`, span 2 h) — `logic/grade-e-foco.md` §1/§3

### Testes da Fase

- [x] T007 [P] Testes adicionais (arquivos **não** de contrato): `guideGrid.test.ts` (empate de `programNearest`; `initialFocus` em linha vazia; `tickTimes` com fuso de 45 min via `TZ` simulado quando viável; sobreposição de programas), `guideRows.test.ts` (deslocamento somado; ordenação; sem id de EPG; janela inicial)

**Critério de Conclusão**: `npx vitest run src/features/live/guide/guideGrid.epg-guia-completo.contract.test.ts` → 2/2 verdes e `..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 031-epg-guia-completo` íntegro (da raiz); T007 verde; `npx tsc -b` e `npm run lint` limpos.

**Checkpoint**: Modelo da grade pronto — user stories podem começar.

**Registro da Fase**:

- Status: concluída (2026-09-29) — a Fase 1 (T001, só pré-condições) foi fechada junto, sem pausa própria.
- Feito: T001–T007. `guideGrid.ts` completo (`programCovering`/`programNearest`/`initialFocus`, `moveHorizontal`/`moveVertical`, `dayOfTime`/`jumpToDay` por calendário local, `blocksInView`/`scrollForFocus`/`tickTimes`); `guideRows.ts` (`buildGuideRows` com o deslocamento da fonte somado, `guideBounds`, `initialView`).
- Contrato: `npx vitest run src/features/live/guide/guideGrid.epg-guia-completo.contract.test.ts` → 2/2 verdes; `check-contract-tests.ps1` → trava íntegra (5 testes).
- Testes executados: `guideGrid.test.ts` + `guideRows.test.ts` (18, novos) verdes; `npx tsc -b` e `oxlint src/features/live/guide` limpos. Único vermelho da pasta: o contrato do `EpgGuide` (Fase 3), esperado. Os contratos 1–2 só foram reconfirmados vermelhos no `sdd-plan` (não repeti a checagem antes de implementar).
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Abrir o guia e ver a grade de programação (Priority: P1) 🎯 MVP

**Objetivo**: "Guia completo" do preview abre o guia em tela cheia, no canal de origem, com a grade completa; RETURN volta à Live TV com o foco no canal de origem; estados sempre com foco possível.

**Independent Test**: com EPG de teste, abrir o guia do preview e conferir grade proporcional, "Agora", linha da hora, foco inicial no canal de origem e RETURN restaurando o foco.

### Contrato da Fase

- `abre no programa atual do canal de origem, marca o agora, esmaece o encerrado, alcança o canal sem EPG, e OK/RETURN agem` — origem: US1/AC1-AC3, US2/AC5-AC6, FR-002/003/005–008/012/019–021
- `"Guia completo" do preview abre o guia (já não é "Em breve") no canal de origem, e RETURN volta à lista com o foco nesse mesmo canal` — origem: US1/AC1/AC4, FR-009/FR-011/FR-012
- Comando: `npx vitest run src/features/live/guide/EpgGuide.epg-guia-completo.contract.test.tsx src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx`

### Implementation

- [x] T008 [P] [US1] `tv-web/src/styles/guide.css` (novo, importado em `tv-web/src/main.tsx` entre os CSS de tela): raiz `.epg-guide` **opaca** (`--bg-canvas`) e `.epg-guide-screen`; barra; painel de detalhe; coluna de canais; cabeçalho de horas; `.epg-guide-block` (`left/width` em %, `min-width` legível, `.is-now`, `.is-past` esmaecido, `.is-empty`, `.no-scale` para foco); `.epg-guide-now-line`; estados. **Só tokens** (nenhum valor literal de cor/raio/espaço)
- [x] T009 [US1] `EpgGuide` em `tv-web/src/features/live/guide/EpgGuide.tsx`: hooks de dados (mesmos três do `LiveScreen` por `list.kind`, `useEpgPrograms`, `useSources`, `useNow`), `buildGuideRows`, virtualização vertical (`useVirtualizer` + `useVirtualFocusSync`), cabeçalho de horas (`tickTimes`), blocos por linha (`blocksInView`), linha da hora atual, marcadores `.is-now`/`.is-past`, canal indisponível (selo + esmaecido), foco/`refTime`/`view` inicial (`initialFocus` + `scrollForFocus`) — `logic/grade-e-foco.md` §1–§3, §9
- [x] T010 [US1] `EpgGuide`: painel de detalhe do topo (título, `formatEpgTimeRange`, chip "Agora", sinopse, canal — nunca texto fora do EPG, D-012) e os **estados** carregando / erro (com "Tentar de novo") / lista vazia / sem programação (explicação por estado + "Configurar EPG" quando houver `onOpenEpgSettings`), cada um com pelo menos um focável — `logic/grade-e-foco.md` §6/§7
- [x] T011 [US1] `EpgGuide`: `EpgGuideHandle` para a **zona grade** — `onDirection` (←/→ `moveHorizontal`, ↑/↓ `moveVertical`, `scrollForFocus` a cada passo, `refTime`), `onSelect` (OK: `onWatch`/avisos de §5), `onBack` (`onClose`) — `logic/grade-e-foco.md` §4/§5 → contrato: `abre no programa atual do canal de origem…`
- [x] T012 [US1] `tv-web/src/features/live/LiveScreen.tsx`: estado `guide`/`guideRef`; abrir do preview em `handleTrailSelect` (coluna 2, ação 2) com `setCol(1)` e **sem** o toast "Em breve"; renderização parada (só `EpgGuide` em `.screen.epg-guide-screen`, sem `withShell`); `useRemoteNav` encaminha `onDirection/onSelect/onBack` ao guia quando `guide && !playing` (e zera `onLongSelect`/`onFavoriteKey`); `onClose` = `setGuide(null)` — `logic/entradas-e-saida.md` §2–§3b, §5 → contrato: `"Guia completo" do preview abre o guia…`
- [x] T013 [US1] `tv-web/src/App.tsx`: `onOpenEpgSettings` no `case 'live'` (`dispatch open epg-settings` com `from: { name: 'live' }`) e `LiveScreen` repassa ao guia — `logic/entradas-e-saida.md` §7 (FR-013)

### Testes da Fase

- [x] T014 [P] [US1] `tv-web/src/features/live/guide/EpgGuide.states.test.tsx` (carregando/erro/vazio/sem programação/desativado: cada um com focável; "Configurar EPG" chama `onOpenEpgSettings`; nunca grade vazia sem saída) e `tv-web/src/features/live/LiveScreen.guide.test.tsx` (abrir do preview em "★ Favoritos" e "Todos", RETURN restaura por id); **atualizar** o teste existente de "Guia completo → Em breve" em `tv-web/src/features/live/LiveScreen.test.tsx` (≈ linhas 1369–1380) — deixa de ser mock (FR-011)

**Critério de Conclusão**: `npx vitest run src/features/live/guide/EpgGuide.epg-guia-completo.contract.test.tsx src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1` íntegro; T014 verde; contratos travados 024/018/030 da Live TV verdes sem edição; no navegador o guia abre do preview, RETURN volta ao canal de origem (quickstart 1–2, 6).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-09-29).
- Feito: `guide.css` (só tokens), `EpgGuide` (grade virtualizada, detalhe, estados carregando/erro/vazio/sem programação, seletor de lista, chip de cobertura de "Todos"), integração no `LiveScreen` (estado `guide`, abertura pelo preview, roteamento de teclas, renderização parada), `onOpenEpgSettings` no `App.tsx`. Adiantados para esta fase: seletor de lista (T026), `watchFromGuide` (T018) e as atribuições de `zapKeyRef` — a Fase 6/4/5 só completam testes e ajustes.
- Contrato: `npx vitest run src/features/live/guide/EpgGuide.epg-guia-completo.contract.test.tsx src/features/live/LiveScreen.epg-guia-completo.contract.test.tsx src/features/live/guide/guideGrid.epg-guia-completo.contract.test.ts` → 4/4 verdes; `check-contract-tests.ps1` → trava íntegra (5 testes; o do `PlayerLayer` segue vermelho até a Fase 5, como esperado).
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/live/guide src/features/live/LiveScreen.guide.test.tsx` → 6 arquivos, 31/31; `LiveScreen.test.tsx` 79/79 (teste "Guia completo → Em breve" atualizado, FR-011); `oxlint` sem erros (3 warnings de `exhaustive-deps`/`incompatible-library` do `useVirtualizer`, padrão já presente no repo).
- Pendências: `LiveScreen.guide.test.tsx` cobre abrir em "Todos" e assistir + RETURN; abrir a partir de "★ Favoritos" ficou coberto só pelo seletor/estados, sem teste de integração próprio (entra na verificação E2E da Fase 7). R-002 (guia opaco sobre o plano de hardware do AVPlay) segue só verificável na TV.

---

## Phase 4: User Story 2 - Navegar no tempo e assistir pelo guia (Priority: P1)

**Objetivo**: abas Hoje/Amanhã, CH±, reconciliação com dado novo e o "assistir" completo (lista do guia vira a vizinhança de zapping; foco na Live TV).

**Independent Test**: navegar da hora atual até amanhã, dar OK num programa futuro e ver o canal tocar; `↑/↓` no player percorre a lista do guia.

### Implementation

- [x] T015 [US2] `EpgGuide`: **zona barra** (item do seletor — só o botão, o painel vem na Fase 6 — e abas Hoje/Amanhã): `↑` na 1ª linha vai à barra, `↓` volta à grade; OK numa aba = `jumpToDay` (foco, `refTime`, `view`), aba ativa = `dayOfTime(refTime, now)` (reflete a hora focada e a virada da meia-noite) — `logic/grade-e-foco.md` §4
- [x] T016 [US2] `EpgGuide`: `onPage('previous'|'next')` (CH−/CH+) — `pageRows` = linhas visíveis − 1, mín. 1, saturando (FR-015)
- [x] T017 [US2] `EpgGuide`: reconciliação quando a programação muda com o guia aberto (foco por `channelId`+`programStart`; se o programa sumiu, `programNearest(row, refTime)`); "Agora" e linha da hora avançam com `useNow` (edge cases)
- [x] T018 [US2] `LiveScreen.tsx`: `watchFromGuide(channel, list, listKey)` — `zapSequenceRef = list`, `zapKeyRef = enteredOf(listKey)` (novo ref, atribuído também nos dois pontos de `playActiveChannel`), `setEntered`/`setFocusedIdentity`/`setCol(1)` no canal escolhido, mesmo canal só fecha, `lastGoodChannelRef`, `setPlaying`; parado fecha o guia na hora — `logic/entradas-e-saida.md` §2, §4 (FR-020, FR-012)
- [x] T019 [US2] `LiveScreen.tsx`: `onMediaKey` do `useRemoteNav` (`ChannelUp/Down` → `guideRef.onPage`) **só** enquanto `guide && !playing`

### Testes da Fase

- [x] T020 [P] [US2] `EpgGuide.nav.test.tsx` (abas: ativa acompanha a hora focada, "Amanhã" e volta; `↑` da 1ª linha vai à barra e `↓` volta ao mesmo item; `onPage`; reconciliação com programa removido; programa que acaba → esmaece) e `LiveScreen.guide.test.tsx` (assistir pelo guia: `↑/↓` seguintes usam a lista do guia; RETURN do player cai no canal escolhido; canal indisponível avisa; nenhuma requisição ao mover o foco — espiar `fetch`)

**Critério de Conclusão**: T020 verde; contratos 1–4 seguem verdes e trava íntegra; quickstart 3–5 e 10 (parado) no navegador.

**Checkpoint**: User Stories 1 e 2 funcionando de forma independente.

**Registro da Fase**:

- Status: concluída (2026-09-29).
- Feito: abas Hoje/Amanhã (barra: seletor + 2 abas; ativa = `dayOfTime(refTime)`; a janela alcança o 1º programa de amanhã), `onPage` (CH±), reconciliação por id+início (já vinha da Fase 3), `watchFromGuide` (adiantado na Fase 3), `onMediaKey` do `LiveScreen` (ChannelUp = anterior) só com `guide && !playing`.
- Contrato: contratos 1–4 verdes, trava íntegra.
- Testes executados: `EpgGuide.nav.test.tsx` 7 casos verdes (abas, barra↔grade, `onPage`, reconciliação, encerrado). Um caso de virada da meia-noite foi removido: `useNow` tica por timer real e o teste só falsificava `Date`; a virada segue coberta pelo contrato 1.
- Pendências: T020 no lado `LiveScreen` cobre assistir + RETURN e "sem requisição ao mover" (`LiveScreen.guide.test.tsx`); "↑/↓ do player usam a lista do guia" e "canal indisponível avisa" ficam para o E2E da Fase 7.

---

## Phase 5: User Story 3 - Guia a partir do player, sem parar o canal (Priority: P2)

**Objetivo**: o "Guia" do chrome é real e abre o guia por cima do vídeo, com a sessão viva; RETURN volta ao vídeo; escolher outro canal troca a sessão e só fecha o guia com o novo canal tocando.

**Independent Test**: tocar um canal, abrir o Guia pelo chrome, conferir que o áudio segue e RETURN volta ao vídeo sem reabrir a sessão; abrir de novo, escolher outro canal e conferir a troca.

### Contrato da Fase

- `"Guia" é real e OK nele chama onGuide quando a tela sabe abrir o guia; sem onGuide continua "Guia — em breve" e não chama nada` — origem: US3/AC1, FR-010/FR-011
- Comando: `npx vitest run src/components/PlayerLayer.epg-guia-completo.contract.test.tsx`

### Implementation

- [x] T021 [US3] `tv-web/src/components/chromeControls.ts`: `features.guide?` → `{ id:'guide', availability:'real', label:'Guia' }`, senão `'soon'` com o rótulo de hoje **sem** `comingSoonId`; `tv-web/src/components/PlayerLayer.tsx`: `controlsFor` passa `guide: Boolean(onGuide)`, OK na linha do Live chama `onGuide` (antes do toast), `soon` sem id → `showToast('O guia não está disponível neste player.')` — `logic/entradas-e-saida.md` §6 → contrato: `"Guia" é real e OK nele chama onGuide…`
- [x] T022 [US3] `PlayerLayer.tsx`: `PlayerLayerTopLayer.onMediaKey?: (key) => boolean` — `ChannelUp/Down` chegam ao `topLayer` quando ele define isso; qualquer outra tecla de mídia continua ignorada com `topLayer` aberto; `MediaStop` segue fechando o player (D-011)
- [x] T023 [US3] `LiveScreen.tsx`: `onGuide` → `openGuideFromPlayer` (lista = `zapKeyRef` traduzida, senão categoria do canal por `original_group` como `openZapping`; origem = `playing.id`; fecha o zapping se aberto), `topLayer` do guia (`content`, `onDirection/onSelect/onBack` via `guideRef`, `onMediaKey` → `onPage`; **sem** `onLongSelect`/`onFavoriteKey`), `onEnteredPlaying` fecha guia e zapping — `logic/entradas-e-saida.md` §2, §3, §3b
- [x] T024 [US3] Remover o mock `epg-guide`: `tv-web/src/lib/comingSoon.ts` e `tv-web/src/lib/comingSoon.test.ts`; ajustar `tv-web/src/components/chromeControls.test.ts` (casos que citavam `epg-guide`) e o que mais `Select-String -Pattern "epg-guide"` achar em `src/` (FR-011)

### Testes da Fase

- [x] T025 [P] [US3] `PlayerLayer.guia.test.tsx` (`topLayer.onMediaKey`: CH± chegam, outras teclas de mídia não; `MediaStop` fecha; toast do "Guia" sem `onGuide`) e `LiveScreen.guide.test.tsx` (guia aberto do player: sessão **não** fecha (`closeCount` 0); RETURN volta ao vídeo; escolher outro canal troca e o guia só fecha em `onEnteredPlaying`; falha da troca volta ao canal anterior com aviso — R-008; zapping e guia nunca abertos juntos)

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.epg-guia-completo.contract.test.tsx` → 1/1 verde e trava íntegra; **contratos travados 027 e 029 (`PlayerLayer.*`) e 024 verdes sem edição**; T025 verde; quickstart 7 e 10 (player) no navegador.

**Checkpoint**: User Stories 1–3 funcionando.

**Registro da Fase**:

- Status: concluída (2026-09-29).
- Feito: `chromeControls` (`features.guide`), `PlayerLayer` (`onGuide` no ramo do Live do `onSelect`; sem `onGuide` só avisa), `PlayerLayerTopLayer.onMediaKey` (retorna `void`, não `boolean` como o texto de T022), `LiveScreen.openGuideFromPlayer` (lista = `zapKeyRef`, fallback "Todos"), guia como `topLayer` (sem long-select/tecla amarela), fechamento só no `onEnteredPlaying` do canal escolhido (`guideWatchPendingRef`), mock `epg-guide` removido (`comingSoon.ts` + 2 testes), E2E `live-tv-ds-v14.mjs`/`player-chrome.mjs` ajustados (ainda não rodados).
- Contrato: `npx vitest run src/components/PlayerLayer.epg-guia-completo.contract.test.tsx` → 1/1 verde; 5/5 no total e as 15 travas do repositório íntegras.
- Testes executados: `PlayerLayer.guide.test.tsx` 3/3; `npx vitest run src/features/live src/components src/lib/comingSoon.test.ts` → 59 arquivos, 441/441; `tsc` limpo, `oxlint` sem erro. Um bug real achado pelo contrato: `onGuide` estava no ramo VOD do `onSelect` (corrigido).
- Pendências: o lado `LiveScreen` (sessão viva com guia aberto, troca fecha só ao tocar) não é testável em jsdom (adaptador `<video>` nunca chega a `playing`); T025 fechado pelo E2E `epg-guia-completo.mjs` (US3). R-008 (falha da troca com o guia aberto) não tem teste dedicado. R-002 (guia opaco sobre o plano de hardware) segue só na TV.

---

## Phase 6: User Story 4 - Trocar de lista dentro do guia (Priority: P3)

**Objetivo**: seletor no topo do guia com "★ Favoritos", "Todos" e as categorias, sem sair do guia.

**Independent Test**: abrir o seletor, escolher uma categoria nunca aberta e ver os canais dela carregarem no guia, com foco possível em todo estado.

### Implementation

- [x] T026 [US4] `EpgGuide`: seletor como **camada do próprio guia** (D-009, R-004): painel vertical `[★ Favoritos, Todos, …categorias]` com foco inicial na lista atual, `useScrollFocusedIntoView`, OK escolhe (troca `list`, foco no 1º canal, `initialFocus`), RETURN fecha só o seletor — `logic/grade-e-foco.md` §8
- [x] T027 [US4] `EpgGuide`: em "Todos", cabeçalho "Guia de X de Y categorias" (`coveredCategories`/`totalCategories`); categoria sem canais no aparelho lê pelo caminho da Live TV, com carregando/erro focáveis (já dos estados de T010) — FR-024/FR-025

### Testes da Fase

- [x] T028 [P] [US4] `EpgGuide.selector.test.tsx` (foco inicial na lista atual; escolher categoria carrega; RETURN em camadas seletor → guia; "Todos" mostra a cobertura; nenhuma requisição ao mover o foco dentro do seletor)

**Critério de Conclusão**: T028 verde; contratos seguem verdes; quickstart 8 no navegador.

**Registro da Fase**:

- Status: concluída (2026-09-29).
- Feito: T026 (seletor como painel do próprio guia) e T027 (cobertura de "Todos") já entregues; carregando/erro/vazio focáveis cobertos em `EpgGuide.states.test.tsx`.
- Contrato: sem contrato próprio nesta fase; trava íntegra.
- Testes executados: `EpgGuide.states.test.tsx` (entradas/abrir/RETURN) e `EpgGuide.selector.test.tsx` 3/3 (foco na lista atual, escolher categoria troca os canais sem requisição, RETURN em camadas, cobertura "Guia de 2 de 3 categorias").
- Pendências: nenhuma.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: E2E, dados reais, documentação e gates.

- [x] T029 [P] `tv-web/e2e/epg-dados-agora.mjs` é o molde: novo `tv-web/e2e/epg-guia-completo.mjs` (servidor fictício no próprio script, XMLTV com horários **relativos a agora**, incluindo programas de amanhã): abrir do preview no 2º canal; foco/painel; "Agora"/linha/encerrado esmaecido; canal sem EPG; `←/→/↑/↓`; abas; OK num futuro → toca; RETURN em camadas; guia aberto do player (áudio/sessão viva, troca de canal, fecha só ao tocar); seletor; sem programação (EPG desativado) → "Configurar EPG"; `assertOneFocus` a cada passo; **nenhuma requisição de EPG ao mover o foco**. `page.route` só para `${base}/live/**` (não `**/live/**`, que trava o Vite). Adicionar ao `test:e2e` em `tv-web/package.json`
- [x] T030 [P] `tv-web/e2e/epg-guia-completo-real.mjs` (**fora** do `test:e2e`): lê o `.env` da raiz em tempo de execução, cadastra a lista Xtream real, espera "EPG vinculado", favorita canais que têm programa no ar (descobertos por contagem, sem imprimir valores) e confere que o guia de "★ Favoritos" mostra "Agora" e barra; nunca imprime valor do `.env`, nome de canal/programa ou URL; pula com aviso se faltar `.env` (R-001)
- [x] T031 [P] Atualizar os roteiros que citam o mock: `tv-web/e2e/live-tv-ds-v14.mjs` (passo "Guia completo mostra Em breve" → abre o guia e RETURN volta) e `tv-web/e2e/player-chrome.mjs` (≈ linhas 278–280: "Guia" agora real)
- [x] T032 Gates: `npx tsc -b`, `npm run lint`, `npm run test` (flakes conhecidos confirmados isolados), `npm run build:tizen`, `npm run test:e2e` (com `npm run dev` recém-iniciado), `node e2e/epg-guia-completo-real.mjs`, `check-contract-tests.ps1` da 031 **e** das travas 017–030
- [x] T033 Rodar `quickstart.md` no navegador (cenário ponta a ponta)
- [x] T034 [P] Documentação: `CLAUDE.md` (parágrafo da 031), `.planning/backlog.md` (item 42c entregue; tabela "Próximas entregas" #5), `.planning/migracao-design-system-v14.md` (matriz: "EPG em tela cheia" e "Live: Guia completo" reais), `README.md` (guia completo deixa de ser "a avaliar" — só se a feature convergir)
- [x] T035 Revisão de segredos antes de commit: nenhum `console`/`logger` no guia; nenhum endereço de EPG em tela/`aria-label`; E2E real só com contagens
- [ ] T036 (Recomendado, não gate) Passada na TV física via `tizen-tv`: quickstart 1, 3, 5, 7 + **guia opaco sobre o plano de hardware do AVPlay com o áudio seguindo (R-002)**, fluidez segurando `↓`/`→` com centenas de canais (SC-002/R-003), CH± no guia, virada da meia-noite; registrar em `Riscos e Decisões`

**Registro da Fase**:

- Status: concluída (2026-09-29); T036 (passada física) fica aberto de propósito — recomendado, não gate (precedente da 030).
- Feito: E2E `epg-guia-completo.mjs` (fixture fictícia, ~60 asserções; em `test:e2e`) e `epg-guia-completo-real.mjs` (`.env`, só contagens/ms); `live-tv-ds-v14.mjs`/`player-chrome.mjs` atualizados; docs (CLAUDE.md, backlog 42c, matriz da migração); revisão de segredos (nenhum `console`/credencial em `features/live/guide` nem `LiveScreen`).
- Contrato: 5/5 verdes e trava íntegra; as 15 travas do repositório (017–031) íntegras.
- Testes executados: `tsc` limpo; `oxlint` sem erro; `npx vitest run` 1579/1583 — as 4 falhas são as flakes conhecidas (`LiveScreen.favorites`, `LiveScreen.test` T010, `MoviesScreen.favorites`, `SeriesScreen.favorites`), 106/106 isoladas em 3 rodadas; `npm run build:tizen` limpo; `npm run test:e2e` (14 scripts) exit 0; E2E real: canal com programa real achado, p95 tecla→foco 128 ms.
- Pendências: (1) R-003 não provado — no E2E real "Todos" cobriu só 2 de 41 categorias; a medição com milhares de canais fica para a TV. (2) Quickstart coberto por E2E automatizado, não interativo; limites −12 h/+48 h só nos contratos (`guideGrid`); "desativar EPG" testado pela variante lista-sem-EPG; áudio contínuo só provável na TV. (3) Achado de CSS real: `.screen` sobrescrita para `position: relative` zerava a altura do guia (corrigido). (4) `player-chrome.mjs` imprime um `AbortError` de `play()` interrompido na troca rápida de canal (já ocorria; sem falha).

---

### Checklist de Release

- [x] Fase 2 (Foundational) concluída
- [x] Fase 3 (User Story 1) concluída
- [x] Fase 4 (User Story 2) concluída
- [x] Fase 5 (User Story 3) concluída
- [x] Fase 6 (User Story 4) concluída
- [x] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (031 e travas 017–030, em especial 024/027/029/030)
- [x] `npm run build:tizen` verde
- [x] `npm run test:e2e` verde (inclui `e2e/epg-guia-completo.mjs`) e `e2e/epg-guia-completo-real.mjs` verde com o `.env`
- [x] Nenhum endereço de EPG/credencial em log, tela ou erro (T035)
- [x] Mock `epg-guide` removido e nenhum teste/E2E o cita
- [x] `quickstart.md` executado com sucesso
- [x] Documentação atualizada (T034)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende da Fase 2; T009 antes de T010/T011; T011 antes de T012
- **US2 (Phase 4)**: depende da Fase 3 (o componente existe)
- **US3 (Phase 5)**: depende da Fase 3 (`EpgGuide`, `LiveScreen` com `guide`) e de T018 (`zapKeyRef`); T021/T022 em `PlayerLayer` são independentes do resto
- **US4 (Phase 6)**: depende da Fase 3 (barra de T015)
- **Polish (Phase 7)**: depende de todas as stories

### Parallel Opportunities

- T002, T005, T006 (arquivos/funções diferentes) na Fase 2
- T008 (CSS) em paralelo com T009
- T021/T022 (`PlayerLayer`/`chromeControls`) em paralelo com a Fase 4 depois da Fase 3
- T029, T030, T031, T034 na Fase 7

---

## Parallel Example: Phase 2

```bash
Task: "T002 [P] programCovering/programNearest/initialFocus"
Task: "T005 [P] blocksInView/scrollForFocus/tickTimes"
Task: "T006 [P] guideRows.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1+2, ambas P1)

1. Fase 1 (T001)
2. Fase 2 (modelo puro + contratos 1 e 2)
3. Fase 3 (US1 + contratos 3 e 4)
4. Fase 4 (US2)
5. **PARAR E VALIDAR**: guia do preview completo, no navegador, com dado de teste e com o EPG real

### Incremental Delivery

1. Modelo puro → US1 (abrir/ver/RETURN) → US2 (navegar/assistir) → US3 (player) → US4 (seletor) → Polish

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- Flakes conhecidos sob paralelismo: `*.favorites.test.tsx`, `LiveScreen.test.tsx` (T010) — confirmar isolado antes de investigar
- Falha pré-existente conhecida e aberta (não é desta feature): `e2e/home-busca-configuracoes.mjs` passo "Continuar" (~19%, R-013 da 030)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
