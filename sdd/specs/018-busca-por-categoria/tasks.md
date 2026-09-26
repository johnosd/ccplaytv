---
description: "Tasks de implementação — 018-busca-por-categoria"
---

# Tasks: Busca por categoria com ícone de entrada e categoria virtual "Todos"

**Input**: `sdd/specs/018-busca-por-categoria/{spec.md, plan.md, logic/busca-por-categoria.md, quickstart.md}`

**Prerequisites**: `plan.md`, `spec.md`, `logic/busca-por-categoria.md` (contrato
do "como"), `contract-tests.lock` (definição de pronto — **testes travados,
nunca editar**).

**Organization**: fundação (helpers/tipos novos) primeiro; Live TV entrega
as três user stories de uma vez (US1/US2/US3 são a MESMA mudança de FSM,
só o escopo dos itens muda); Filmes+Séries espelham — juntas na mesma
fase, porque compartilham `CategoryScreenSnapshot` (um campo novo
obrigatório força as duas a migrar ao mesmo tempo para o build fechar
limpo, D-007/R-001).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1, US2 ou US3

## Path Conventions

- Frontend: `tv-web/src/` — dados em `lib/catalog/`, hooks de tela em `features/catalog/catalogApi.ts`, telas em `features/{live,movies,series}/`, roteador em `App.tsx`, CSS em `features/screens.css` (tokens de `index.css`)
- Testes: ao lado do arquivo (`*.test.ts(x)`); contratos em `*.busca-categoria.contract.test.ts(x)` (travados)
- E2E: `tv-web/e2e/*.mjs`

Comando dos contratos (em `tv-web/`):
`npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar a base antes de tocar código de tela.

- [x] T001 Rodar em `tv-web/`: `npx tsc -b` (esperado: 8 erros, todos em `MoviesScreen.tsx`/`SeriesScreen.tsx`/`MoviesScreen.test.tsx`/`App.test.tsx` por causa do campo `searchActive` novo em `CategoryScreenSnapshot` — nenhum em `LiveScreen.tsx`, que não usa esse tipo); `npx vitest run` (esperado: só os 5 contratos da 018 vermelhos, pelo motivo esperado, mais a flakiness pré-existente de `*.favorites.test.tsx` já documentada nas features 016/017); `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 018-busca-por-categoria` íntegro.

**Registro da Fase**:

- Status: Concluída
- Feito: T001
- Contrato: sem contrato nesta fase
- Testes executados: `npx tsc -b` → 8 erros, exatamente os esperados (`MoviesScreen.tsx` linhas 105/133/376, `SeriesScreen.tsx` linhas 98/125/346, `MoviesScreen.test.tsx`, `App.test.tsx` — todos por `searchActive` faltando, nenhum em `LiveScreen.tsx`); `npx vitest run` → 711 total, 704 passed, 7 failed (5 dos contratos da 018 pelo motivo certo — asserção/`not implemented`; 3 de `*.favorites.test.tsx` em Live/Movies/Series, mesma flakiness de timing pré-existente das features 016/017); `check-contract-tests.ps1` → trava íntegra (5/5)
- Pendências: Nenhuma

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: helper de filtro genérico e leitura agregada de "Todos" — toda story depende disto.

**⚠️ CRITICAL**: nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `searchWithinItems filtra e ordena por termo sobre um tipo genérico — prefixo primeiro, resto depois, alfabético` — FR-005/007/012
- Comando: `npx vitest run src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts`

### Implementation

- [x] T002 Em `tv-web/src/lib/catalog/catalogSearch.ts`: implementar `searchWithinItems<T>` exatamente como `logic/busca-por-categoria.md` §7 (normaliza, prefixo primeiro, resto depois, alfabético) → contrato. Reescrever `searchIndex(index, term)` como wrapper fino sobre `searchWithinItems` (D-010) — **sem mudar sua assinatura pública**; `catalogSearch.contract.test.ts` (feature 017) continua passando sem qualquer edição.
- [x] T003 Em `tv-web/src/features/catalog/catalogApi.ts`: implementar `useAggregatedItems` (stub já criado) — reaproveita `loadSearchIndex` (React Query, mesmo padrão de cache de `useCatalogSearch`), devolve TODOS os itens do índice via `toItemOut`, sem aplicar filtro nenhum (`logic/busca-por-categoria.md` §7).
- [x] T004 [P] Em `tv-web/src/features/screens.css`: novo `.search-icon-button` (botão pequeno, focável, ícone 🔍, junto de `.live-column-title` num container flex `.category-title-row`) e `.live-item-all` (substitui `.live-item-search`) — só tokens de `index.css` (ADR-007).

### Testes da Fase

- [x] T005 [P] `tv-web/src/features/catalog/catalogApi.test.tsx`: `useAggregatedItems` agrega itens de mais de uma categoria já coberta; categoria nunca aberta fica de fora da lista E da contagem de cobertura; `enabled: false` não lê nada.

**Critério de Conclusão**: `npx vitest run src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1` íntegro; `npx vitest run src/lib/catalog/catalogSearch.contract.test.ts` (017, intocado) continua 2/2 verde; `npx tsc -b` só com os erros já documentados em T001 (Movies/Series/testes, não novos).

**Checkpoint**: fundação pronta.

**Registro da Fase**:

- Status: Concluída
- Feito: T002–T005
- Contrato: `npx vitest run src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts` → 1/1 verde; `check-contract-tests.ps1` → trava íntegra (5/5)
- Testes executados: `npx tsc -b` → 8 erros, os mesmos de T001, nenhum novo; `npx vitest run src/features/catalog/catalogApi.test.tsx src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts src/lib/catalog/catalogSearch.contract.test.ts src/lib/catalog/catalogSearch.test.ts` → 41/41 (inclui o contrato antigo da 017, `catalogSearch.contract.test.ts`, intocado e verde)
- Pendências: Nenhuma. Achado durante T002: reescrever `searchIndex` como wrapper de `searchWithinItems` passando `entry.normalizedName` como extrator de nome mudaria o critério de desempate alfabético (nome normalizado em vez do original) — corrigido reconstruindo a lista de `record`s e usando `record.name` como extrator, preservando o comportamento exato de antes.

---

## Phase 3: User Story 1+2+3 — Live TV (Priority: P1) 🎯 MVP

**Objetivo**: ícone de busca dentro de cada entrada (categoria real, ★ Favoritos, Todos) na tela de Live TV; nova entrada "Todos" na trilha; busca escopada por padrão, agregada só dentro de "Todos".

**Independent Test**: entrar numa categoria com vários canais, acionar o ícone, buscar um termo — só canais desta categoria aparecem; entrar em "Todos", ver canais de mais de uma categoria juntos e buscar entre eles.

### Contrato da Fase

- `buscar dentro de uma categoria acha só itens dela, nunca de outra categoria` — US1 AC1-3, FR-006
- `"Todos" lista itens de mais de uma categoria sem buscar, mostra cobertura parcial, e busca dentro dela funciona` — US2 AC1-4, FR-003/007/010
- `RETURN em camadas (resultado → campo → ícone → trilha) e trocar de categoria reseta a busca` — FR-008/017
- `o ícone de busca só aparece quando a categoria tem itens carregados` — D-006, Constitution: Foco Visível e Sem Becos Sem Saída
- Comando: `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx`

### Implementation

- [x] T006 [US1][US2][US3] Em `tv-web/src/features/live/LiveScreen.tsx`: `TrailKey`/`EnteredKey` sem `search`, com `all`; trilha `[favorites, all, ...categorias]`; `VIRTUAL_TRAIL_COUNT` constante `2` (remove a variação por `zapOpen` — D-001/D-009) → contrato.
- [x] T007 [US1][US2][US3] Em `LiveScreen.tsx`: estado `searchActive`/`searchTerm`/`topFocused` por entrada (D-002/D-003); `enterCategory`/`enterFavorites`/nova `enterAll` resetam os três ao trocar (`logic/busca-por-categoria.md` §1) → contrato: "RETURN em camadas...".
- [x] T008 [US2] Em `LiveScreen.tsx`: `useAggregatedItems(sourceId, 'channel', enteredAll)` alimenta "Todos"; `items` derivados conforme `logic/busca-por-categoria.md` §2 (`searchWithinItems` sobre `baseItems` quando `searchActive` e termo válido) → contrato: "'Todos' lista...".
- [x] T009 [US1] Em `LiveScreen.tsx`: mesmo `items`-derivado para categoria real/Favoritos (filtro client-side, D-004) → contrato: "buscar dentro de categoria...".
- [x] T010 [US1][US2][US3] Em `LiveScreen.tsx`: JSX do ícone (`.search-icon-button`, só quando `!searchActive && baseItems.length > 0`, D-006) junto ao `.live-column-title` (`.category-title-row`); campo (`.search-field`, reaproveitado da 017) substitui a lista quando `searchActive` → contrato: "ícone só aparece...".
- [x] T011 [US1][US2][US3] Em `LiveScreen.tsx`: navegação (`handleTrailDirection`/`handleTrailSelect`/`useRemoteNav.onBack`) conforme a tabela de `logic/busca-por-categoria.md` §3 (↑/↓ topo↔item, SELECT no ícone abre, RETURN em camadas).
- [x] T012 [US2] Em `LiveScreen.tsx`: zapping (`renderColumns()` reusado pelo `topLayer`) mostra "Todos" navegável; ícone de busca nunca renderiza quando `zapOpen` (D-009, FR-018) — `renderColumns()` já recebe esse contexto pelo estado do componente, sem prop nova.
- [x] T013 [P] Atualizar `tv-web/src/features/live/LiveScreen.test.tsx` e `LiveScreen.favorites.test.tsx`: trilha sem "🔍 Buscar" (com "Todos"), mocks de `useAggregatedItems` no lugar de `useCatalogSearch`, e os testes que exercitavam o modo `entered.kind === 'search'` antigo reescritos para o novo modelo (ícone + `searchActive`).

### Testes da Fase

- [x] T014 [P] [US3] `LiveScreen.favorites.test.tsx`: buscar dentro de "★ Favoritos" filtra só os favoritos do tipo (US3 AC1).
- [x] T015 [P] [US1] `LiveScreen.test.tsx`/`LiveScreen.favorites.test.tsx`: tecla Done (keyCode 65376) no campo leva ao 1º resultado; segurar OK num resultado favorita sem tocar (mesma cobertura que a 017 tinha, adaptada ao novo modelo).
- [x] T016 [P] [US2] `LiveScreen.test.tsx`: cobertura total dentro de "Todos" não mostra aviso (nem antes nem durante a busca); sem resultado mostra estado vazio com o campo mantendo foco DOM real (mesma decisão de UX da 017, R-005 daquela feature).

**Critério de Conclusão**: `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx` → 4/4 verdes e `check-contract-tests.ps1` íntegro; `npx vitest run src/features/live` sem regressão (favoritos confirmados isolados).

**Checkpoint**: busca funcional em Live TV — MVP.

**Registro da Fase**:

- Status: Concluída
- Feito: T006–T016
- Contrato: `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx` → 4/4 verdes; `check-contract-tests.ps1` → trava íntegra (5/5)
- Testes executados: `npx tsc -b` → 8 erros (os mesmos de T001, nenhum novo); `npx vitest run src/features/live --no-file-parallelism` → 66/67 (a 1 falha é `LiveScreen.busca.contract.test.tsx`, contrato OBSOLETO da feature 017 que testa a UI antiga — planejado para remoção só no Polish/T026 conforme D-011, não uma regressão desta fase); `LiveScreen.test.tsx` isolado → 40/40; `LiveScreen.favorites.test.tsx` isolado (`--no-file-parallelism`) → 15/15
- Pendências: **Bug real encontrado e corrigido durante T011**: a primeira versão de `handleTrailDirection` tinha um `return` incondicional dentro do bloco `if (topFocused) {...}`, que interceptava TODAS as direções (inclusive ←/→) sempre que o ícone/campo estava focado — ArrowLeft nunca saía para a trilha nesse estado. Pego pelo próprio contrato "RETURN em camadas..." (que passa por esse estado via ArrowLeft) falhando na primeira rodada; corrigido para só retornar cedo em ↑/↓, deixando ←/→ caírem no fluxo padrão.

---

## Phase 4: User Story 1+2+3 — Filmes e Séries (Priority: P1)

**Objetivo**: mesma busca em Filmes e Séries (grade de pôsteres), reaproveitando o snapshot de restauração ao voltar do detalhe (feature 017, D-007).

**Independent Test**: Filmes → entrar numa categoria → buscar → abrir um filme → voltar: termo, resultados e foco restaurados; "Todos" navegável e buscável igual à Live TV.

### Implementation

- [x] T017 [US1][US2][US3] Em `tv-web/src/features/movies/MoviesScreen.tsx`: espelhar T006–T012 (trilha, `searchActive`/`topFocused`, `useAggregatedItems` para "Todos", filtro client-side para categoria/Favoritos, ícone, navegação — sem zapping, que é exclusivo de Live TV).
- [x] T018 [US1][US2][US3] Em `MoviesScreen.tsx`: `onOpenMovie(id, snapshot)` monta o snapshot com `searchActive` (D-007); estado inicial (`col`/`trailKey`/`entered`/`searchActive`/`searchTerm`/`focusedItemId`) lido de `restore`.
- [x] T019 [US1][US2][US3] Em `tv-web/src/features/series/SeriesScreen.tsx`: espelhar T017–T018 (`onOpenSeries(id, snapshot)`, `restore`).
- [x] T020 Em `tv-web/src/features/catalog/categoryScreenSnapshot.ts`: removido `{kind:'search'}` de `SnapshotTrailKey`/`SnapshotEntered` — antecipado do Polish para o final desta fase, já que as três telas migraram na mesma leva de trabalho (D-007 atualizado).
- [x] T021 [P] Atualizar `MoviesScreen.test.tsx`, `MoviesScreen.favorites.test.tsx`, `SeriesScreen.test.tsx`, `SeriesScreen.favorites.test.tsx`, `App.test.tsx`: trilha sem "🔍 Buscar" (com "Todos"), snapshot com `searchActive`, testes do modo busca antigo reescritos.

### Testes da Fase

- [x] T022 [P] [US1] `MoviesScreen.test.tsx`: abrir um resultado de busca dentro de uma categoria → snapshot → remontar restaura termo/resultados/foco (mesmo ciclo que a 017 provava, adaptado ao ícone).
- [x] T023 [P] [US2] `SeriesScreen.test.tsx`: "Todos" lista séries de mais de uma categoria e a busca dentro dela funciona (espelha o contrato de Live TV, fora do orçamento de contrato).
- [x] T024 [P] [US1] `MoviesScreen.test.tsx`: categoria do snapshot que sumiu (reconciliação por id) continua funcionando sem travar — mesma garantia que a 017 já tinha, não deveria regredir.

**Critério de Conclusão**: `npx tsc -b` limpo (as três telas + snapshot consistentes entre si); `npx vitest run src/features/movies src/features/series src/App.test.tsx` sem regressão; os 5 contratos da 018 continuam verdes.

**Checkpoint**: busca redesenhada nas três seções.

**Registro da Fase**:

- Status: Concluída
- Feito: T017–T024
- Contrato: os 5 contratos da 018 → 5/5 verdes; `check-contract-tests.ps1` → trava íntegra
- Testes executados: `npx tsc -b` → **0 erros** (limpo pela primeira vez desde a Fase 2 — `search` removido de `categoryScreenSnapshot.ts` ao final desta fase, D-007 atualizado); `npx vitest run src/features/movies src/features/series src/App.test.tsx --no-file-parallelism` → 92/93 (a 1 falha é `MoviesScreen.busca.contract.test.tsx`, contrato OBSOLETO da 017, planejado para remoção no Polish/T026)
- Pendências: Nenhuma. Mesmo padrão de correção de trilha da Fase 3 (2 `ArrowUp` para alcançar "★ Favoritos" a partir do padrão) replicado em `MoviesScreen.favorites.test.tsx`/`SeriesScreen.favorites.test.tsx`. `MoviesScreen.tsx`/`SeriesScreen.tsx` ganharam um `.live-column-title` novo dentro de `.category-title-row` (não existia antes nessas duas telas) — necessário para o ícone de busca ter "o título/contagem" ao lado, conforme FR-001 pede explicitamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T025 Remover `useCatalogSearch` de `tv-web/src/features/catalog/catalogApi.ts` (dead code — nenhuma tela mais o chama, D-010); remover `{ kind: 'search' }` de `SnapshotTrailKey`/`SnapshotEntered` em `categoryScreenSnapshot.ts` (D-007); remover `.live-item-search` de `screens.css` se não usado mais (o novo `.live-item-all` o substitui).
- [x] T026 Remover `tv-web/src/features/live/LiveScreen.busca.contract.test.tsx` e `tv-web/src/features/movies/MoviesScreen.busca.contract.test.tsx` (feature 017 — testam a entrada "🔍 Buscar" na trilha, que não existe mais). **Não tocar** em `useRemoteNav.busca.contract.test.tsx` nem em `catalogSearch.contract.test.ts` (D-011 — continuam válidos e intocados).
- [x] T027 Criar `tv-web/e2e/busca-por-categoria.mjs` (padrão dos scripts existentes; fixture M3U local com pelo menos 2 categorias de canal e 2 de filme): buscar dentro de uma categoria e tocar; "Todos" lista e busca entre categorias com aviso de cobertura; abrir um filme por busca e voltar restaura termo/foco; RETURN em camadas. Adicionar ao `test:e2e` em `tv-web/package.json`; remover `tv-web/e2e/busca-local.mjs` (feature 017 — testava a UI antiga) e sua entrada em `test:e2e`.
- [x] T028 [P] `sdd/specs/017-busca-local-catalogo/spec.md`/`plan.md`: nota inline `**Atualização (feature 018):**` confirmando que o design de busca desta feature foi substituído (já anunciado no R-006 daquela feature). ADR-009 não precisa de emenda nova — a guarda de alvo editável (D-008) não muda de comportamento, só de onde na árvore de estados é usada.
- [x] T029 Rodar `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` (com `npm run dev`) em `tv-web/` — todos limpos (ou documentar honestamente o que não está, como a 017 fez para os scripts pré-existentes quebrados nesta máquina Windows).
- [x] T030 Atualizar `CLAUDE.md` com o parágrafo da feature 018, substituindo a descrição do design antigo (017) pelo novo comportamento.

### Checklist de Release

- [x] Fase 2 (Foundational) concluída
- [x] Fase 3 (Live TV) concluída
- [x] Fase 4 (Filmes/Séries) concluída
- [x] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [x] `npm run test` / `lint` / `build` limpos; `test:e2e` — script novo desta feature limpo (cadeia completa pode seguir com as limitações pré-existentes já documentadas na 017)
- [x] `quickstart.md` executado pelo menos em emulador/navegador (TV física recomendada, não gate obrigatório)

**Registro da Fase**:

- Status: Concluída
- Feito: T025–T030
- Contrato: `npx vitest run src/features/live/LiveScreen.busca-categoria.contract.test.tsx src/lib/catalog/catalogSearch.busca-categoria.contract.test.ts` → 5/5 verdes; `check-contract-tests.ps1 -Slug 018-busca-por-categoria` → trava íntegra
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run` completo → 716 testes, 714 passando (2 falhas em `*.favorites.test.tsx` sob paralelismo total, flakiness de timing pré-existente das features 016/017, confirmada 100% passando isolada com `--no-file-parallelism`); `npm run lint` → limpo (só warnings pré-existentes de `react-hooks/exhaustive-deps`/`incompatible-library`, mesmos de antes desta feature); `npm run build` → limpo. `npm run test:e2e` (cadeia completa): `e2e.mjs` falha por seletor desatualizado (pré-existente, R-007 da 017); `favoritos.mjs`/`zapping-live-tv.mjs` falham por `executablePath` fixo do Chromium do sandbox Linux ausente nesta máquina Windows (pré-existente, mesmo R-007); `capa-real.mjs` 17/17; `m3u-sob-demanda.mjs` 2 de 3 rodadas limpas (flakiness de timing sob carga da máquina, ver R-005); `busca-por-categoria.mjs` (novo desta feature) 17/17, confirmado estável em 2 rodadas. Verificação manual do `quickstart.md` feita no navegador via Playwright MCP contra o dev server real (não só os mocks dos testes unitários) — foi essa verificação que revelou os dois bugs corrigidos abaixo, que os testes mockados nunca exercitariam.
- Pendências: dois achados fora do escopo formal da 018, ambos investigados e corrigidos nesta fase com aprovação explícita do usuário — ver R-005 (bug de teste em `m3u-sob-demanda.mjs`) e R-006 (ícone de busca não respeitava `contentUnavailable`, e o bug mais profundo de `readStored` que isso revelou) em `plan.md`. Os três scripts E2E pré-existentes quebrados nesta máquina Windows (`e2e.mjs`, `favoritos.mjs`, `zapping-live-tv.mjs`) permanecem como estavam — fora do escopo desta feature, já documentados desde a 017.

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** bloqueia tudo.
- **Fase 3 (Live TV)** depende só da 2.
- **Fase 4 (Filmes/Séries)** depende da 2 e reusa os padrões da 3 (fazer em ordem) — Filmes e Séries fecham JUNTAS (compartilham `CategoryScreenSnapshot`, R-001).
- **Polish (5)** por último — só aí `useCatalogSearch`/testes antigos da 017 saem.

### Parallel Opportunities

- T004/T005 em paralelo; testes `[P]` de cada fase entre si.

---

## Implementation Strategy

### MVP First

1. Fases 1–2 (fundação).
2. Fase 3 (Live TV) → **parar e validar** a busca por categoria + "Todos".

### Incremental Delivery

3. Fase 4 → Filmes/Séries (ambas juntas).
4. Polish → limpeza de código morto, E2E, notas de ADR/spec/backlog/CLAUDE.md, gates.

## Notes

- Testes de contrato são **travados** — nunca editar; se um parecer errado, parar e reportar (emenda precisa de `R-00X` em `plan.md` e regravação da trava).
- `logic/busca-por-categoria.md` é o contrato do "como" — desvio volta para `plan.md` → Riscos e Decisões.
- `tsc -b` do projeto inteiro só fica limpo de novo ao FINAL da Fase 4 (D-007/R-001) — não é uma regressão se os erros já documentados em T001 persistirem até lá.
- Commitar após cada fase fechada.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
