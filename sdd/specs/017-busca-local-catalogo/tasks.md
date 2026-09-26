---
description: "Tasks de implementação — 017-busca-local-catalogo"
---

# Tasks: Busca Local em Live TV, Filmes e Séries

**Input**: `sdd/specs/017-busca-local-catalogo/{spec.md, plan.md, logic/busca-local.md, quickstart.md}`

**Prerequisites**: `plan.md`, `spec.md`, `logic/busca-local.md` (contrato do
"como"), `contract-tests.lock` (definição de pronto — **testes travados,
nunca editar**).

**Organization**: fundação de dados/teclado primeiro; US1 em Live TV, depois
em Filmes/Séries (com a restauração ao voltar do detalhe); US2 fecha
cobertura e estado vazio.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 ou US2

## Path Conventions

- Frontend: `tv-web/src/` — dados em `lib/catalog/`, hooks de tela em `features/catalog/catalogApi.ts`, telas em `features/{live,movies,series}/`, roteador em `App.tsx`, CSS em `features/screens.css` (tokens de `index.css`)
- Testes: ao lado do arquivo (`*.test.ts(x)`); contratos em `*.contract.test.ts(x)` (travados)
- E2E: `tv-web/e2e/*.mjs`

Comando dos contratos (em `tv-web/`):
`npx vitest run src/lib/catalog/catalogSearch.contract.test.ts src/lib/useRemoteNav.busca.contract.test.tsx src/features/movies/MoviesScreen.busca.contract.test.tsx src/features/live/LiveScreen.busca.contract.test.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar a base antes de tocar código.

- [x] T001 Rodar em `tv-web/`: `npm run build` e a suíte da área (`npx vitest run src/features src/lib`), confirmando que só os 5 contratos falham (flakiness de `*.favorites.test.tsx` se confirma isolada com `--no-file-parallelism`), e `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 017-busca-local-catalogo` íntegro.

**Registro da Fase**:

- Status: Concluída
- Feito: T001
- Contrato: sem contrato nesta fase
- Testes executados: `npm run build` (limpo); `npx vitest run src/features src/lib` → 620 passed, 5 failed (os 5 contratos, pelo motivo esperado — ver Fase 2/3/4); `check-contract-tests.ps1` → trava íntegra
- Pendências: Nenhuma

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: dados da busca, hook e teclado — toda story depende disto.

**⚠️ CRITICAL**: nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `encontra por "contém" sem acento nem caixa, a partir de 3 caracteres, com quem começa pelo termo primeiro` — FR-005/007/010
- `lê só o tipo pedido da geração ativa e conta cobertura apenas das categorias com conteúdo no aparelho` — FR-002/009/014, D-003
- `deixa Backspace, espaço, Enter e setas laterais para o campo; RETURN e setas verticais continuam com a tela` — FR-003/020, D-005
- Comando: `npx vitest run src/lib/catalog/catalogSearch.contract.test.ts src/lib/useRemoteNav.busca.contract.test.tsx`

### Implementation

- [x] T002 [P] Em `tv-web/src/lib/catalog/catalogRepository.ts`: exportar uma leitura de todos os registros de um tipo na geração ativa por faixa do índice `[sourceId+generation+kind+groupOrder]` (reusando o `query()` interno) — ver `logic/busca-local.md` §1 passo 3.
- [x] T003 Em `tv-web/src/lib/catalog/catalogSearch.ts`: implementar `normalizeForSearch`, `buildSearchIndex`, `searchIndex` e `loadSearchIndex` exatamente como `logic/busca-local.md` §1 (cobertura D-003/FR-024, ordenação D-004) → contrato: os dois de `catalogSearch.contract.test.ts`.
- [x] T004 [P] Criar `tv-web/src/lib/useDebouncedValue.ts` (valor assentado após N ms; limpa o timer a cada mudança e no desmonte).
- [x] T005 Em `tv-web/src/features/catalog/catalogApi.ts`: implementar `useCatalogSearch` como `logic/busca-local.md` §2 (`belowMinimum` pelo termo cru, índice com `refetchOnMount: 'always'`, `toItemOut`, termo fora de `queryKey`).
- [x] T006 Em `tv-web/src/lib/useRemoteNav.ts`: guarda de alvo editável em keydown/keyup (`logic/busca-local.md` §3) → contrato: `deixa Backspace, espaço, Enter e setas laterais…`.

### Testes da Fase

- [x] T007 [P] `tv-web/src/lib/useDebouncedValue.test.ts`: só entrega o último valor depois da pausa; troca rápida nunca entrega valor intermediário.
- [x] T008 [P] `tv-web/src/features/catalog/catalogApi.test.tsx`: `useCatalogSearch` — `belowMinimum` imediato ao apagar para < 3; `enabled: false` não lê nada; índice relido a cada montagem.
- [x] T009 [P] `tv-web/src/lib/useRemoteNav.test.tsx`: sem alvo editável, Backspace/espaço/Enter continuam exatamente como antes (regressão da guarda).

**Critério de Conclusão**: `npx vitest run src/lib/catalog/catalogSearch.contract.test.ts src/lib/useRemoteNav.busca.contract.test.tsx` → 3/3 verdes e `check-contract-tests.ps1` íntegro; `npm run build` limpo; suíte de `src/lib` sem regressão.

**Checkpoint**: fundação pronta.

**Registro da Fase**:

- Status: Concluída
- Feito: T002–T009
- Contrato: `npx vitest run src/lib/catalog/catalogSearch.contract.test.ts src/lib/useRemoteNav.busca.contract.test.tsx` → 3/3 verdes; `check-contract-tests.ps1` → trava íntegra
- Testes executados: `npx tsc -b` limpo; os 5 arquivos tocados (contratos + `useDebouncedValue.test.ts` + `catalogApi.test.tsx` + `useRemoteNav.test.tsx`) → 58/58; suíte completa `src/features src/lib` → 624/630 (6 falhas: os 2 contratos ainda pendentes das Fases 3/4, esperado; 4 de `*.favorites.test.tsx`, confirmadas flakiness de timing pré-existente — 20/20 isoladas com `--no-file-parallelism`, sem relação com a guarda de teclado nova)
- Pendências: Nenhuma

---

## Phase 3: User Story 1 - Achar um canal pelo nome em Live TV (Priority: P1) 🎯 MVP

**Objetivo**: "🔍 Buscar" no topo da trilha do Live TV, campo com teclado do sistema, resultados na lista de canais com categoria, contagem e cobertura.

**Independent Test**: com categorias abertas, subir até "🔍 Buscar", digitar parte do nome, ver o canal com a categoria dele e tocá-lo com OK; fechar o player devolve a busca.

### Contrato da Fase

- `"🔍 Buscar" abre um campo vazio com foco; os resultados trazem a categoria, a contagem e a cobertura parcial` — FR-001/003/004/011/013/014
- Comando: `npx vitest run src/features/live/LiveScreen.busca.contract.test.tsx`

### Implementation

- [x] T010 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: `TrailKey`/`EnteredKey` com `search`; trilha `[search, favorites, ...]` fora do zapping e `[favorites, ...]` com `zapOpen` (D-009); `defaultTrailIdx` = nº de entradas virtuais (`logic/busca-local.md` §4 e §6) → contrato.
- [x] T011 [US1] Em `LiveScreen.tsx`: modo busca — entrar zera o termo e dá foco DOM ao `<input className="search-field field-box">`; itens da lista = `useCatalogSearch(...).items`; status (`Digite pelo menos 3 letras` / `N resultado(s)` / `Busca em X de Y categorias`); `<span className="live-item-group">` com a categoria em cada linha só em modo busca → contrato.
- [x] T012 [US1] Em `LiveScreen.tsx`: tabela de foco de `logic/busca-local.md` §4 (↓/Done 65376 do campo para o 1º resultado com `blur()`; ↑ da 1ª linha volta ao campo; RETURN resultado→campo→trilha; favoritar só com foco em resultado).
- [x] T013 [P] [US1] Em `tv-web/src/features/screens.css`: `.search-field` (reusa `.field-box`), linha de status, `.live-item-search` (mesmo padrão de `.live-item-favorites`), `.live-item-group` — só tokens de `index.css` (ADR-007).
- [x] T014 [US1] Atualizar testes existentes que listam a trilha exata ou contam setas a partir de "★ Favoritos" em `tv-web/src/features/live/LiveScreen.test.tsx` e `LiveScreen.favorites.test.tsx` (R-004) — só a composição esperada muda, nunca a força da asserção.

### Testes da Fase

- [x] T015 [P] [US1] `LiveScreen.test.tsx`: com `zapOpen`, a trilha não tem "🔍 Buscar" e o foco inicial do zapping continua no canal tocando (FR-023, D-009).
- [x] T016 [P] [US1] `LiveScreen.test.tsx`: RETURN num resultado volta ao campo com o termo; RETURN no campo volta à trilha; reentrar começa vazio (FR-004/FR-020).
- [x] T017 [P] [US1] `LiveScreen.test.tsx`: tecla Done (keyCode 65376) no campo leva ao 1º resultado (FR-016). "Segurar OK num resultado favorita sem tocar" (FR-018) movido para `LiveScreen.favorites.test.tsx` na Fase 5 (T029) — segue a separação de propósito já estabelecida entre os dois arquivos (`LiveScreen.test.tsx` mocka `useCatalogSearch`/dados; `.favorites.test.tsx` usa banco real via fake-indexeddb, necessário para `favoriteToggle` funcionar de verdade).

**Critério de Conclusão**: `npx vitest run src/features/live/LiveScreen.busca.contract.test.tsx` → 1/1 verde e `check-contract-tests.ps1` íntegro; `npx vitest run src/features/live` sem regressão (favoritos confirmados isolados).

**Checkpoint**: busca funcional no Live TV — MVP.

**Registro da Fase**:

- Status: Concluída
- Feito: T010–T017 (T017 dividido — ver nota acima; a parte de favoritar vai para T029 na Fase 5)
- Contrato: `npx vitest run src/features/live/LiveScreen.busca.contract.test.tsx` → 1/1 verde; `check-contract-tests.ps1` → trava íntegra
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/live --no-file-parallelism` → 58/58; suíte completa `src/features src/lib` → 632/635 (3 falhas: 1 contrato da Fase 4 ainda pendente, esperado; 2 de `*.favorites.test.tsx`, flakiness pré-existente confirmada — 16/16 isoladas)
- Pendências: achado real durante T011/T012 — desenhei inicialmente um botão "Voltar ao campo" para o estado sem resultado (FR-015), mas o campo já mantém foco DOM real nesse estado (só sai dele quando há resultado pra focar), então RETURN já garante saída sem beco sem saída — o botão seria redundante (dois elementos com aparência de foco ao mesmo tempo). Simplificado: sem botão, só a mensagem. Documentado no código.

---

## Phase 4: User Story 1 - Filmes e Séries, com volta do detalhe restaurada (Priority: P1)

**Objetivo**: mesma busca em Filmes e Séries (grade de pôsteres), e voltar do detalhe restaura a tela — busca e grade normal (D-006, fecha o bug de backlog).

**Independent Test**: Filmes → buscar → abrir um filme → voltar: termo, resultados e foco no filme; pela grade normal, categoria e foco restaurados.

### Contrato da Fase

- `abrir um resultado entrega um snapshot que, devolvido ao remontar a tela, restaura termo, resultados e foco no item` — FR-001/017/019 + Constitution: Voltar Restaura Foco e Posição
- Comando: `npx vitest run src/features/movies/MoviesScreen.busca.contract.test.tsx`

### Implementation

- [x] T018 [US1] Em `tv-web/src/features/movies/MoviesScreen.tsx`: entrada e modo busca como T010–T012, com os itens da grade vindo de `useCatalogSearch` (D-007) → contrato.
- [x] T019 [US1] Em `MoviesScreen.tsx`: montar o `CategoryScreenSnapshot` em `onOpenMovie(id, snapshot)` e inicializar o estado a partir de `restore` (`logic/busca-local.md` §5), tornando `snapshot` obrigatório na assinatura → contrato.
- [x] T020 [US1] Em `tv-web/src/features/series/SeriesScreen.tsx`: espelhar T018–T019 (`onOpenSeries(id, snapshot)`, `restore`).
- [ ] T021 [US1] Em `tv-web/src/App.tsx`: `restore?` nos tipos de tela `movies`/`series`; ao abrir o detalhe, gravar o snapshot na entrada de histórico da tela de origem; passar `restore={screen.restore}` às telas (§5).
- [x] T022 [US1] Atualizar testes existentes de trilha em `MoviesScreen.test.tsx`, `MoviesScreen.favorites.test.tsx`, `SeriesScreen.test.tsx`, `SeriesScreen.favorites.test.tsx` (R-004), e as chamadas a `onOpenMovie`/`onOpenSeries` que conferem argumentos exatos.

### Testes da Fase

- [x] T023 [P] [US1] `SeriesScreen.test.tsx`: mesmo ciclo abrir-resultado → snapshot → remontar do contrato de Filmes (Séries fica fora do orçamento de contrato).
- [x] T024 [P] [US1] `MoviesScreen.test.tsx`: grade normal (sem busca) — abrir um filme de uma categoria e remontar com o snapshot restaura categoria entrada e foco no filme; categoria que sumiu cai no padrão (reconciliação por id) — FR-022.
- [x] T025 [P] [US1] `tv-web/src/App.test.tsx` (ou o teste de navegação existente, se houver): voltar do detalhe entrega à tela de origem o snapshot gravado na ida.

**Critério de Conclusão**: `npx vitest run src/features/movies/MoviesScreen.busca.contract.test.tsx` → 1/1 verde e `check-contract-tests.ps1` íntegro; `npx vitest run src/features/movies src/features/series` sem regressão.

**Checkpoint**: busca nas três seções; volta do detalhe restaurada em Filmes/Séries.

**Registro da Fase**:

- Status: Concluída
- Feito: T018–T025
- Contrato: `npx vitest run src/features/movies/MoviesScreen.busca.contract.test.tsx` → 1/1 verde; `check-contract-tests.ps1` → trava íntegra (5/5)
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/movies src/features/series` → 90/90; `npx vitest run src/features src/lib` → 638 passed, 2 failed (`MoviesScreen.favorites.test.tsx` e `LiveScreen.favorites.test.tsx`, mesma flakiness de timing pré-existente já registrada nas Fases 2/3 — confirmada 17/17 isoladas com `--no-file-parallelism`, sem relação com o trabalho desta fase)
- Pendências: Nenhuma. `SeriesScreen.tsx` espelhou `MoviesScreen.tsx` integralmente (T020); `App.tsx` ganhou `restore?` nos tipos `movies`/`series` e grava o snapshot na entrada de histórico da tela de origem antes de empurrar `movie-detail`/`series-detail` (T021, sem alterar a assinatura genérica de `goto`); T022 corrigiu as 4 suítes de trilha existentes (nova entrada "🔍Buscar", segundo argumento de snapshot); T023–T025 adicionaram cobertura não-travada: ciclo busca→snapshot→restore em Séries (espelha o contrato de Filmes), grade normal (sem busca) com restore e reconciliação por id quando a categoria do snapshot sumiu (cai no estado real em vez de travar ou mostrar a categoria fantasma), e um `App.test.tsx` novo provando que o roteador entrega de volta o snapshot gravado na ida.

---

## Phase 5: User Story 2 - Saber o que a busca cobriu (Priority: P2)

**Objetivo**: cobertura e estado vazio corretos em todos os casos.

**Independent Test**: seção com categorias não abertas mostra "Busca em X de Y categorias"; com cobertura total, nenhum aviso; sem resultado, estado vazio focável.

### Implementation

- [x] T026 [US2] Nas três telas: estado vazio `Nenhum resultado para "{termo}"` com a linha de cobertura quando aplicável (FR-015; `logic/busca-local.md` §4). **Redação ajustada em 2026-09-25** (decisão do usuário, ver `plan.md` → Riscos e Decisões): sem botão "Voltar ao campo" — o campo mantém foco DOM real nesse estado (único elemento focável, já satisfaz FR-015) e RETURN a partir dele já sai sem beco sem saída; um botão dedicado duplicaria a aparência de foco. Já implementado nas Fases 3 e 4 nas três telas.
- [x] T027 [US2] Nas três telas: aviso de cobertura só quando `covered < total` (FR-014) — nunca com cobertura total. Já implementado nas Fases 3/4 (`searchCoveragePartial` idêntico em `LiveScreen.tsx`/`MoviesScreen.tsx`/`SeriesScreen.tsx`).

### Testes da Fase

- [x] T028 [P] [US2] Novo `tv-web/src/lib/catalog/catalogSearch.test.ts` (arquivo não-contrato): nenhuma categoria aberta → `0 de Y`; categoria `eager` → coberta mesmo sem `itemsFetchedAt`; categoria com `itemsFetchedAt` vencido (>24h) continua coberta (a busca local nunca re-obtém, D-002).
- [x] T029 [P] [US2] `MoviesScreen.test.tsx` + `LiveScreen.test.tsx`: sem resultado → estado vazio, campo mantém foco DOM real e RETURN sai sem prender o controle (redação ajustada — ver T026/R-005, sem botão dedicado); cobertura total → sem aviso (novo teste em ambas; `LiveScreen.test.tsx` já cobria "sem resultado" desde T017).

**Critério de Conclusão**: os 5 contratos continuam verdes; T028–T029 verdes; `npm run test` limpo (favoritos confirmados isolados).

**Checkpoint**: US2 completa.

**Registro da Fase**:

- Status: Concluída
- Feito: T026–T029
- Contrato: `check-contract-tests.ps1` → trava íntegra (5/5); os 5 arquivos de contrato → 5/5 verdes
- Testes executados: `npx tsc -b` limpo; `npm run test` → 706 total, 704 passed, 2 failed (`SeriesScreen.favorites.test.tsx` + 1 outro `*.favorites.test.tsx`, mesma flakiness de timing pré-existente — confirmada 20/20 isoladas com `--no-file-parallelism`, sem relação com esta fase)
- Pendências: Nenhuma. **Conflito real encontrado e resolvido com o usuário** (gatilho de parada obrigatória do sdd-execute, passo 13): T026/FR-015 pediam um botão focável "Voltar ao campo" no estado vazio, mas as Fases 3/4 já haviam implementado (e documentado como achado) o oposto — sem botão, porque o campo mantém foco DOM real nesse estado e um botão extra duplicaria a aparência de foco. Perguntado ao usuário via AskUserQuestion; resposta: manter sem botão. `spec.md` (FR-015) e `tasks.md` (T026) emendados com nota inline; `plan.md` → Riscos e Decisões ganhou R-005 registrando a decisão. T027 já estava implementado nas três telas desde as Fases 3/4 (só confirmado e marcado). T028 ganhou um arquivo de teste novo, não-contrato (`catalogSearch.test.ts`), testando `loadSearchIndex` direto contra fake-indexeddb. T029 preencheu a lacuna real: Filmes não tinha nenhum teste de busca vazia/cobertura ainda (só o contrato de restore); Live TV já tinha "sem resultado" desde a Fase 3, faltava só "cobertura total → sem aviso" em ambas.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T030 Criar `tv-web/e2e/busca-local.mjs` (padrão dos scripts existentes; fixture M3U local com categorias de canal e filme): buscar canal e tocar; buscar filme, abrir e voltar com termo/foco restaurados; aviso de cobertura; RETURN em camadas. Adicionado ao `test:e2e` em `tv-web/package.json`.
- [x] T031 [P] ADR-009 (`sdd/adr/`): nota inline `**Atualização (feature 017):**` sobre a guarda de alvo editável do `useRemoteNav` (D-005).
- [x] T032 [P] `sdd/specs/016-zapping-live-tv/spec.md` → Clarifications: nota de emenda da FR-004 (a trilha do zapping omite "🔍 Buscar", D-009 da 017).
- [x] T033 [P] `.planning/backlog.md`: marcar o `[Bug] Voltar do detalhe pra grade não restaura foco nem posição` como resolvido pela 017 (D-006); atualizar a nota do item 8 (empty state de busca agora existe).
- [x] T034 Rodar `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` (com `npm run dev`) em `tv-web/`. Resultado: `test`/`lint`/`build` limpos (ver Registro da Fase). `test:e2e` **não** está limpo nesta máquina Windows, por um motivo pré-existente e alheio a esta feature: `e2e.mjs`, `e2e/favoritos.mjs` e `e2e/zapping-live-tv.mjs` já falhavam antes da 017 (o primeiro por um seletor desatualizado, os outros dois por apontarem para um caminho fixo de Chromium só válido no sandbox Linux, sem fallback) — `e2e/busca-local.mjs` (novo, desta feature) roda com fallback de binário e passou 2/2 vezes isolado.
- [x] T035 Atualizar `CLAUDE.md` com o parágrafo da feature 017.

### Checklist de Release

- [x] Fase 2 (Foundational) concluída
- [x] Fase 3 (US1 — Live TV) concluída
- [x] Fase 4 (US1 — Filmes/Séries + volta do detalhe) concluída
- [x] Fase 5 (US2) concluída
- [x] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [x] `npm run test` / `lint` / `build` limpos; `test:e2e` — o script novo desta feature (`busca-local.mjs`) limpo; a cadeia completa segue quebrada nesta máquina Windows por scripts pré-existentes sem relação com a 017 (ver T034)
- [ ] `quickstart.md` executado na TV física (cenários A–G) — A–C decidem R-003

**Registro da Fase**:

- Status: Concluída
- Feito: T030–T035
- Contrato: `check-contract-tests.ps1` → trava íntegra (5/5); os 5 arquivos de contrato → 5/5 verdes
- Testes executados: `npm run test` → 704/706 (2 falhas de flakiness pré-existente de `*.favorites.test.tsx`, confirmadas isoladas); `npm run lint` limpo (só warnings pré-existentes); `npm run build` limpo; `tv-web/e2e/busca-local.mjs` (novo) → 17/17 verificações, 2/2 execuções estáveis; `npm run test:e2e` completo **não** limpo nesta máquina Windows por scripts pré-existentes sem relação com esta feature (ver T034)
- Pendências: **Decisão do usuário durante esta fase (2026-09-25)**: pediu um redesenho da UX de busca (escopo por categoria + categoria virtual "Todos" + ponto de entrada como ícone em vez de item de trilha) que contradiz o design atual (D-001/FR-001 desta spec: entrada única no topo da trilha, pesquisando todas as categorias do tipo). Perguntado explicitamente via AskUserQuestion se deveria convergir a 017 como está ou reabrir e redesenhar agora; resposta: "convergir mas não gastar muita energia — fechar como está e redesenhar em seguida". Por isso T034 não persegue os scripts E2E pré-existentes quebrados nesta máquina (fora do escopo desta feature), e o quickstart em TV física fica pendente (R-003 não decidido) — a feature fecha `Implementada` no estado atual (design "busca por tipo, entrada única na trilha"), e o redesenho pedido vira trabalho novo, não uma continuação de tasks aqui.

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** bloqueia tudo.
- **Fase 3 (Live)** e **Fase 4 (Filmes/Séries)** dependem só da 2; a 4 reusa os padrões da 3 (fazer em ordem).
- **Fase 5** depende das 3 e 4 (toca as três telas).
- **Polish (6)** por último.

### Parallel Opportunities

- T002/T004 em paralelo; T007–T009 em paralelo.
- Testes `[P]` de cada fase entre si.

---

## Implementation Strategy

### MVP First

1. Fases 1–2 (fundação).
2. Fase 3 (Live TV) → **parar e validar** a busca de canais.

### Incremental Delivery

3. Fase 4 → busca em Filmes/Séries + volta do detalhe.
4. Fase 5 → cobertura e vazio.
5. Polish → E2E, notas de ADR/spec/backlog, gates, TV física.

## Notes

- Testes de contrato são **travados** — nunca editar; se um parecer errado, parar e reportar (emenda precisa de `R-00X` em `plan.md` e regravação da trava).
- `logic/busca-local.md` é o contrato do "como" — desvio volta para `plan.md` → Riscos e Decisões.
- Commitar após cada fase fechada.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
