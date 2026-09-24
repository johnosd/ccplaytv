---
description: "Lista de tasks da feature 013-favoritos"
---

# Tasks: Favoritos em Canais, Filmes e Séries

**Input**: Documentos de design de `sdd/specs/013-favoritos/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/gesto-ok-longo.md, logic/resolucao-favoritos.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/` (o backend `api/` não é tocado — contorno congelado, ADR-008).
- Camada de dados: `tv-web/src/lib/catalog/`; navegação: `tv-web/src/lib/useRemoteNav.ts`.
- Porta das telas: `tv-web/src/features/catalog/catalogApi.ts` (telas nunca importam `lib/catalog` direto — D-008).
- Comportamento compartilhado de favoritos: `tv-web/src/features/favorites/` (pasta nova).
- Telas: `tv-web/src/features/{live,movies,series}/`; estilos em `tv-web/src/features/screens.css` (só tokens de `tv-web/src/index.css`).
- Testes ao lado do arquivo (`*.test.ts[x]`); E2E em `tv-web/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Linha de base e estilos compartilhados.

- [X] T001 Registrar a linha de base em `tv-web/`: `npm run test`, `npm run lint`, `npx tsc -b` — anotar contagem de testes e qualquer falha pré-existente em `plan.md` → `Execution Notes` antes de mudar código.
- [X] T002 [P] Em `tv-web/src/features/screens.css`: classes `.fav-star` (estrela no cartão `.poster-box` e na linha `.live-item`, cor `var(--accent)`), `.live-item-favorites` (entrada "★ Favoritos" da trilha, distinguível sem depender só de cor — ícone + texto) e `.fav-hint` (dica fixa no rodapé da coluna de conteúdo, `--text-tertiary`). Nenhum valor literal de cor/raio/fonte.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Gesto de OK, schema, repositórios e hooks usados pelas três telas.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T003 [P] Em `tv-web/src/lib/useRemoteNav.test.tsx`: os 9 casos de `logic/gesto-ok-longo.md` §Testes (fake timers; `fireEvent.keyDown`/`keyUp` no `document`), incluindo a regressão "sem `onLongSelect` o OK age no keydown".
- [X] T006 [P] Em `tv-web/src/lib/catalog/userStateRepository.test.ts`: `parseStableId` ida-e-volta com `buildStableId` (id, nome com `|`, episódio), `listFavorites` (filtra fonte e tipo, ordem por `favoritedAt` desc, ignora não favoritos), `deleteUserStatesForSource` (só a fonte pedida).
- [X] T008 [P] Em `tv-web/src/lib/catalog/catalogRepository.test.ts`: `resolveFavorites` — por `providerStreamId` com `kind` (mesmo stream_id em live e VOD não colide), série por `seriesId`, M3U por nome (caixa/espaços), favorito não carregado conta em `unresolved`, geração antiga ignorada, ordem dos favoritos preservada, nome repetido em dois grupos → um registro.
- [X] T010 [P] Em `tv-web/src/features/catalog/catalogApi.test.tsx`: `useFavoriteIds` devolve o `Set` da fonte/tipo; `useFavoritesContent` não consulta enquanto `enabled=false` (D-005); `useToggleFavorite` grava, devolve o novo estado, invalida `favorite-ids`/`favorites-content`/`user-state` e recusa `kind` `episode` (D-009).
- [X] T012 [P] Em `tv-web/src/features/favorites/useFavoriteToggle.test.tsx`: aviso "Adicionado aos favoritos"/"Removido dos favoritos"; falha de gravação → "Não foi possível salvar o favorito" sem mudar a estrela (FR-013); item sem identidade estável → aviso explicativo (edge case); cálculo do vizinho ao desfavoritar dentro de "Favoritos" (seguinte, anterior se último, `null` se único — FR-018).

### Implementation

- [X] T004 Em `tv-web/src/lib/useRemoteNav.ts`: `onLongSelect`, `longSelectMs`, `LONG_SELECT_MS`, `STALE_PRESS_MS` e o listener de `keyup` + cancelamento em `blur`/`visibilitychange`, exatamente como `logic/gesto-ok-longo.md`. Setas/RETURN e o modo `modal` inalterados.
- [X] T005 Em `tv-web/src/lib/catalog/db.ts`: `version(9)` com o índice `[sourceId+generation+kind+providerStreamId]` (`data-model.md` §2), comentário no padrão das versões anteriores; teste de abertura v8 → v9 sem perda em `tv-web/src/lib/catalog/db.test.ts`.
- [X] T007 Em `tv-web/src/lib/catalog/userStateRepository.ts`: `StableIdParts`, `parseStableId`, `listFavorites`, `deleteUserStatesForSource` (`logic/resolucao-favoritos.md`).
- [X] T009 Em `tv-web/src/lib/catalog/catalogRepository.ts`: `resolveFavorites` pelo algoritmo de `logic/resolucao-favoritos.md` (índice v9 → `seriesId` → varredura por nome encerrável).
- [X] T011 Em `tv-web/src/features/catalog/catalogApi.ts`: `FavoritableKind`, `useFavoriteIds`, `FavoritesContent`, `useFavoritesContent` (mapeia com `toItemOut`), `useToggleFavorite`.
- [X] T013 Criar `tv-web/src/features/favorites/useFavoriteToggle.ts`: recebe `showToast` (desvio da descrição original — `sourceId`/`kind` seriam redundantes, o `item` passado a `toggle()` já carrega os dois, e é ele que `useToggleFavorite` usa de verdade); expõe `toggle(item, { visibleItems?, onFocusNeighbor? })` que usa `useToggleFavorite`, mostra o aviso e, quando chamado dentro de "Favoritos" desfavoritando, informa o id vizinho antes de a lista mudar.
- [X] T014 Criar `tv-web/src/features/favorites/FavoritesState.tsx` (+ caso de teste no mesmo `.test.tsx` de T012 ou próprio): estado vazio ("Segure OK sobre um canal/filme/série para favoritar", texto por tipo) com botão `tv-focus` controlado pela tela, e nota de não carregados (FR-009) sem número.

**Critério de Conclusão**: gesto de OK coberto pelos 9 casos; favoritos gravam, listam e resolvem contra a geração ativa em teste com `fake-indexeddb`; hooks e `useFavoriteToggle` testados; `npm run test`, `npm run lint` e `npx tsc -b` limpos; nenhuma tela mudou de comportamento ainda.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: T001–T014. `useRemoteNav` ganhou o gesto `onLongSelect` (keydown+keyup+limiar de 800ms, `STALE_PRESS_MS` pra keyup perdido, cancelamento em blur/visibilitychange) sem alterar nenhuma tela existente (modo legado intacto quando `onLongSelect` não é passado). Schema Dexie subiu pra v9 com o índice `[sourceId+generation+kind+providerStreamId]`. `userStateRepository.ts` ganhou `parseStableId` (inverso de `buildStableId`, preserva pipe em nome/episódio), `listFavorites` e `deleteUserStatesForSource`. `catalogRepository.ts` ganhou `resolveFavorites` (índice v9 → `seriesId` → varredura por nome com corte antecipado via sentinela `FavoritesScanComplete`). `catalogApi.ts` ganhou `useFavoriteIds`/`useFavoritesContent`/`useToggleFavorite`. `features/favorites/` (pasta nova) ganhou `useFavoriteToggle` (aviso + vizinho de foco) e `FavoritesState.tsx` (`FavoritesEmptyState` + `FavoritesUnresolvedNote`, dois componentes em vez de um — o "não carregados" precisa aparecer mesmo com a lista não-vazia). CSS: `.fav-star`/`.live-item-favorites`/`.fav-hint` em `screens.css`, só tokens.
- Testes executados: `npx tsc -b` limpo; `npm run lint` sem erro novo (só os 6 warnings pré-existentes de `react(incompatible-library)`/`react(only-export-components)`); `npm run test` → 46 arquivos, 530 testes (baseline T001 era 44/478 — 52 testes novos). Comando completo: `npm run test && npm run lint && npx tsc -b`.
- Pendências: nenhuma desta fase. Ver R-007 (deviation de T013 registrada abaixo).

---

## Phase 3: User Story 1 - Favoritar e achar um canal (Priority: P1) 🎯 MVP

**Objetivo**: Na Live TV, segurar OK favorita/desfavorita um canal e "★ Favoritos" no topo da trilha lista e toca os canais favoritos.

**Independent Test**: segurar OK sobre um canal, entrar em "★ Favoritos", tocar o canal, desfavoritar — tudo por teclado/controle (spec US1).

### Testes da Fase

- [X] T015 [US1] **Desvio registrado**: em `tv-web/src/features/live/LiveScreen.favorites.test.tsx` (arquivo NOVO, não `LiveScreen.test.tsx`) — aquele mocka `useCategoryList`/`useCategoryContent` e deixaria `useFavoriteIds`/`useFavoritesContent`/`useToggleFavorite` reais tocarem `fake-indexeddb` sem seed nenhum; separar evita ambiguidade de mocks e mantém `LiveScreen.test.tsx` intocado (zero risco de regressão nele). Tempo real (não fake timers) pro gesto — `waitFor` some com timer falso não avançado; ver `plan.md` R-008. Cobre (a)–(k) da descrição original.

### Implementation

- [X] T016 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: `FocusIdentity` da trilha vira união discriminada `TrailKey` (`{ kind: 'favorites' } | { kind: 'category', name }`, D-004); trilha combinada `trail = [Favoritos, ...categories]`, entrada "★ Favoritos" na posição 0; `entered: EnteredKey | null` (`{ kind: 'favorites' } | { kind: 'category', id }`); `useCategoryFocusPrefetch` não é chamado pra Favoritos (`focusedCategory` vira `undefined`). Padrão de foco ao abrir a tela continua sendo a primeira categoria REAL (índice 1 da trilha), não Favoritos — ver R-009.
- [X] T017 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: passar `onLongSelect` ao `useRemoteNav` só quando `col === 1` e há canal focado e nenhum player aberto (D-002), chamando `useFavoriteToggle`; OK curto mantém a lógica atual de `onSelect`.
- [X] T018 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: estrela `.fav-star` nas linhas cujo `stableIdOf(channel)` está em `useFavoriteIds(sourceId, 'channel')`; dica `.fav-hint` "Segure OK para favoritar" quando a coluna de conteúdo tem canais (FR-012).
- [X] T019 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: com "Favoritos" entrada, a coluna de conteúdo usa `useFavoritesContent(sourceId, 'channel', enteredFavorites)` (mesma lista virtualizada, estados de carregando/vazio via `FavoritesState`, nota FR-009); o `onSelect` da tela (não `onClick` do botão) trata OK no estado vazio como "voltar à trilha" — achado durante a escrita do teste (f): sem isso, FR-008/FR-020 (ativação por OK) não se cumpriam, mesmo bug de outras telas do backlog; foco reconciliado por id após desfavoritar (vizinho de T013).

**Critério de Conclusão**: todos os cenários (a)–(k) cobertos por T015 e passando; uma fonte sem nenhum favorito mostra "★ Favoritos" vazia e navegável; nenhum teste existente de `LiveScreen.test.tsx` regrediu (22/22, com 1 asserção atualizada pra incluir a nova entrada da trilha — não é regressão, é o comportamento pretendido); gates (`test`/`lint`/`tsc`) limpos.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: T015–T019. `LiveScreen.tsx` reescrito com a trilha combinada (Favoritos + categorias), gesto de OK na coluna de conteúdo, estrela, dica fixa, conteúdo de "Favoritos" via `useFavoritesContent`, e correção do OK no estado vazio (achado ao escrever T015-f). `LiveScreen.test.tsx`: `press()` passou a soltar Enter também (keydown+keyup), porque o gesto de OK só completa no keyup — sem isso, testes que dependiam do antigo "age no keydown" ficariam presos até o timer real de 800ms disparar por engano; 1 asserção de conteúdo da trilha atualizada pra incluir "★Favoritos". `LiveScreen.favorites.test.tsx` (novo): 11 testes (a)-(k).
- Testes executados: `npm run test` → 47 arquivos, 541 testes (0 regressão nos 22 de `LiveScreen.test.tsx`, 530→541 líquido); `npx tsc -b` e `npm run lint` limpos. Comando: `npx vitest run src/features/live/ && npm run test && npm run lint && npx tsc -b`.
- Pendências: nenhuma técnica. R-008/R-009 registrados em `plan.md`.

---

## Phase 4: User Story 2 - Favoritar filmes e séries (Priority: P2)

**Objetivo**: O mesmo gesto, estrela, dica e "★ Favoritos" nas grades de Filmes e Séries; OK curto continua abrindo o detalhe.

**Independent Test**: favoritar um filme e uma série, entrar em "★ Favoritos" de cada seção e abrir o detalhe por OK (spec US2).

### Testes da Fase

- [X] T020 [P] [US2] **Desvio registrado** (mesmo de T015): em `tv-web/src/features/movies/MoviesScreen.favorites.test.tsx` (arquivo novo). 4 testes: OK curto/demorado no keyup/keydown; "★ Favoritos" lista e abre por OK; vazio ativável por tecla; desfavoritar move ao vizinho da grade.
- [X] T021 [P] [US2] Em `tv-web/src/features/series/SeriesScreen.favorites.test.tsx` (arquivo novo, mesmo motivo). 3 testes: os mesmos de T020 (a)/(d)/(f), mais confirmação de que "Favoritos" mostra o cartão da série e nunca um episódio da mesma série (mesmo quando o episódio está no catálogo).

### Implementation

- [X] T022 [P] [US2] Em `tv-web/src/features/movies/MoviesScreen.tsx`: mesmas mudanças de T016–T019 adaptadas à grade (`TrailKey`/`EnteredKey` discriminados, entrada ★, `onLongSelect` só com filme focado, estrela em `.poster-box`, dica, conteúdo de "Favoritos" com `useFavoritesContent(sourceId, 'movie', …)` na mesma grade virtualizada com `lanes`, mesmo fallback de foco de R-009, mesmo roteamento de OK no vazio de FR-008).
- [X] T023 [P] [US2] Em `tv-web/src/features/series/SeriesScreen.tsx`: idem T022 com `kind: 'series'`. `SeriesDetailScreen.tsx` não tocado (episódio não é favoritável, D-009).

**Critério de Conclusão**: cenários da US2 cobertos e passando (7 testes novos); desfavoritar numa categoria da fonte tira a estrela e o item de "Favoritos" (invalidação de T011); testes existentes de Filmes/Séries sem regressão (`press()` ajustada nos dois arquivos, mesmo motivo de T015); gates limpos.

**Checkpoint**: User Stories 1 e 2 funcionais de forma independente.

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: T020–T023. `MoviesScreen.tsx` e `SeriesScreen.tsx` reescritos com o mesmo padrão de `LiveScreen.tsx` (Fase 3): trilha `[Favoritos, ...categories]`, gesto de OK na grade (curto abre o detalhe no keyup, demorado favorita), estrela em `.poster-box`, dica fixa, conteúdo de "Favoritos" via `useFavoritesContent`, fallback de foco por categoria sumida (R-009) e roteamento de OK no vazio (mesmo achado de T019, aplicado preventivamente aqui — nenhuma das duas telas tinha esse gap antes de eu escrever, porque copiei o padrão já corrigido). `MoviesScreen.test.tsx`/`SeriesScreen.test.tsx`: `press()` ajustada (keydown+keyup em Enter); nenhuma asserção de trilha existia nesses arquivos, então nada mais precisou mudar. Dois arquivos novos de teste: `MoviesScreen.favorites.test.tsx` (4), `SeriesScreen.favorites.test.tsx` (3).
- Testes executados: `npm run test` → 49 arquivos, 548 testes (0 regressão nos 16 pré-existentes de Filmes/Séries, 541→548 líquido); `npx tsc -b` e `npm run lint` limpos. Comando: `npx vitest run src/features/movies/ src/features/series/ && npm run test && npm run lint && npx tsc -b`.
- Pendências: nenhuma técnica.

---

## Phase 5: User Story 3 - Favoritos persistem e são honestos (Priority: P2)

**Objetivo**: Favoritos sobrevivem a reabrir o app e a ressincronizar; remoção de fonte limpa o estado; isolamento entre fontes.

**Independent Test**: favoritar, reabrir, ressincronizar, remover fonte (spec US3).

### Testes da Fase

- [ ] T024 [P] [US3] Em `tv-web/src/lib/catalog/sourceRepository.test.ts`: `deleteSource` apaga `userStates` da fonte removida e preserva os de outra fonte (FR-017, D-007).
- [ ] T025 [P] [US3] Em `tv-web/src/lib/catalog/catalogRepository.test.ts`: integração — favoritar, publicar nova geração com o mesmo `providerStreamId` (e, para M3U, o mesmo nome), `resolveFavorites` encontra o registro novo; reabrir `CatalogDb` com o mesmo nome mantém os favoritos (SC-003).
- [ ] T026 [P] [US3] Em `tv-web/src/features/catalog/catalogApi.test.tsx`: duas fontes com favoritos — `useFavoriteIds`/`useFavoritesContent` de uma nunca devolvem os da outra (US3 cenário 5).

### Implementation

- [ ] T027 [US3] Em `tv-web/src/lib/catalog/sourceRepository.ts`: `deleteSource` chama `deleteUserStatesForSource` (dentro do mesmo fluxo que já apaga catálogo e `importRuns`).

**Critério de Conclusão**: T024–T026 passando; nenhum favorito de fonte removida reaparece; gates limpos.

**Checkpoint**: todas as user stories funcionais.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, documentação canônica, verificação manual e TV física.

- [ ] T028 Criar `tv-web/e2e/favoritos.mjs` e `tv-web/e2e/fixtures/favoritos.m3u` (canais, filmes e episódios `SxxEyy` **fictícios**, URLs `http://127.0.0.1/…` inexistentes): o script sobe um servidor HTTP local com `Access-Control-Allow-Origin: *` para a fixture, usa Playwright em modo headless e cobre `quickstart.md` §A 1–7 com `keyboard.down('Enter')` / espera / `keyboard.up('Enter')`. Atualizar `tv-web/package.json` → `test:e2e` para rodar `e2e.mjs` e `e2e/favoritos.mjs`.
- [ ] T029 Rodar os gates completos em `tv-web/`: `npm run test`, `npm run lint`, `npx tsc -b`, `npm run build` — e o E2E (`npm run dev` + `npm run test:e2e`).
- [ ] T030 Executar `quickstart.md` §B e §C no navegador; anotar tempos de R-003/R-004 em `plan.md` → `Execution Notes`.
- [ ] T031 Documentação canônica: nota `**Atualização (013):**` em `sdd/adr/ADR-009-navegao-direcional-prpria-useremotenav-vez.md` (gesto `keyup` opt-in em `useRemoteNav`); `CLAUDE.md` (013 no status do projeto); `.planning/backlog.md` (itens 16 e 24 citam a 013 como entregue quando convergir).
- [ ] T032 Revisão de segredos: nenhum `stableId`, nome de item ou URL em log novo; fixture E2E sem credencial real; mensagens de erro sem detalhe técnico.
- [ ] T033 `npm run build:tizen` e `quickstart.md` §D na TV física via skill `tizen-tv` — **gate de SC-001 (R-001)**; resultado registrado em `plan.md`.

### Checklist de Release

- [ ] Fase 2 (Foundational) concluída
- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída
- [ ] `npm run test`, `npm run lint`, `npx tsc -b`, `npm run build` limpos
- [ ] Roteiro E2E `npm run test:e2e` verde (constitution v1.4.0)
- [ ] `quickstart.md` §B e §C executados
- [ ] `quickstart.md` §D na TV física (gate R-001) — ou decisão explícita do usuário registrada em R-001
- [ ] Revisão de segredos (T032) sem achados
- [ ] ADR-009, `CLAUDE.md` e backlog atualizados (T031)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories. Dentro dela: T004 depois de T003; T005 antes de T009; T007 antes de T009; T009 e T007 antes de T011; T011 antes de T013; T013/T014 fecham a fase.
- **US1 (Phase 3)**: depende da Fase 2. T016 → T017 → T018 → T019 (mesmo arquivo).
- **US2 (Phase 4)**: depende da Fase 2; não depende da US1 em código, mas reusa o padrão validado nela — recomendado fazer depois.
- **US3 (Phase 5)**: depende da Fase 2 (T007); independente de US1/US2.
- **Polish (Phase 6)**: depende das stories desejadas; T033 por último.

### Parallel Opportunities

- Fase 2: T003, T006, T008, T010, T012 (arquivos de teste diferentes).
- Fase 4: T020 ∥ T021 e T022 ∥ T023.
- Fase 5: T024, T025, T026.

---

## Parallel Example: Phase 2 (testes)

```bash
Task: "T003 [P] useRemoteNav.test.tsx — gesto"
Task: "T006 [P] userStateRepository.test.ts — parse/list/delete"
Task: "T008 [P] catalogRepository.test.ts — resolveFavorites"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 + Fase 2.
2. Fase 3 (Live TV).
3. **PARAR E VALIDAR**: gesto na Live TV no navegador; se houver TV à mão, antecipar `quickstart.md` §D.1 — é o maior risco (R-001).

### Incremental Delivery

1. Setup + Foundational → fundação pronta.
2. US1 → validar → MVP.
3. US2 (Filmes/Séries) → validar.
4. US3 (persistência/remoção) → validar.
5. Polish: E2E, docs, TV física.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar após cada task ou grupo lógico coerente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
