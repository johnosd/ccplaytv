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

- [ ] T001 Registrar a linha de base em `tv-web/`: `npm run test`, `npm run lint`, `npx tsc -b` — anotar contagem de testes e qualquer falha pré-existente em `plan.md` → `Execution Notes` antes de mudar código.
- [ ] T002 [P] Em `tv-web/src/features/screens.css`: classes `.fav-star` (estrela no cartão `.poster-box` e na linha `.live-item`, cor `var(--accent)`), `.live-item-favorites` (entrada "★ Favoritos" da trilha, distinguível sem depender só de cor — ícone + texto) e `.fav-hint` (dica fixa no rodapé da coluna de conteúdo, `--text-tertiary`). Nenhum valor literal de cor/raio/fonte.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Gesto de OK, schema, repositórios e hooks usados pelas três telas.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [ ] T003 [P] Em `tv-web/src/lib/useRemoteNav.test.tsx`: os 9 casos de `logic/gesto-ok-longo.md` §Testes (fake timers; `fireEvent.keyDown`/`keyUp` no `document`), incluindo a regressão "sem `onLongSelect` o OK age no keydown".
- [ ] T006 [P] Em `tv-web/src/lib/catalog/userStateRepository.test.ts`: `parseStableId` ida-e-volta com `buildStableId` (id, nome com `|`, episódio), `listFavorites` (filtra fonte e tipo, ordem por `favoritedAt` desc, ignora não favoritos), `deleteUserStatesForSource` (só a fonte pedida).
- [ ] T008 [P] Em `tv-web/src/lib/catalog/catalogRepository.test.ts`: `resolveFavorites` — por `providerStreamId` com `kind` (mesmo stream_id em live e VOD não colide), série por `seriesId`, M3U por nome (caixa/espaços), favorito não carregado conta em `unresolved`, geração antiga ignorada, ordem dos favoritos preservada, nome repetido em dois grupos → um registro.
- [ ] T010 [P] Em `tv-web/src/features/catalog/catalogApi.test.tsx`: `useFavoriteIds` devolve o `Set` da fonte/tipo; `useFavoritesContent` não consulta enquanto `enabled=false` (D-005); `useToggleFavorite` grava, devolve o novo estado, invalida `favorite-ids`/`favorites-content`/`user-state` e recusa `kind` `episode` (D-009).
- [ ] T012 [P] Em `tv-web/src/features/favorites/useFavoriteToggle.test.tsx`: aviso "Adicionado aos favoritos"/"Removido dos favoritos"; falha de gravação → "Não foi possível salvar o favorito" sem mudar a estrela (FR-013); item sem identidade estável → aviso explicativo (edge case); cálculo do vizinho ao desfavoritar dentro de "Favoritos" (seguinte, anterior se último, `null` se único — FR-018).

### Implementation

- [ ] T004 Em `tv-web/src/lib/useRemoteNav.ts`: `onLongSelect`, `longSelectMs`, `LONG_SELECT_MS`, `STALE_PRESS_MS` e o listener de `keyup` + cancelamento em `blur`/`visibilitychange`, exatamente como `logic/gesto-ok-longo.md`. Setas/RETURN e o modo `modal` inalterados.
- [ ] T005 Em `tv-web/src/lib/catalog/db.ts`: `version(9)` com o índice `[sourceId+generation+kind+providerStreamId]` (`data-model.md` §2), comentário no padrão das versões anteriores; teste de abertura v8 → v9 sem perda em `tv-web/src/lib/catalog/db.test.ts`.
- [ ] T007 Em `tv-web/src/lib/catalog/userStateRepository.ts`: `StableIdParts`, `parseStableId`, `listFavorites`, `deleteUserStatesForSource` (`logic/resolucao-favoritos.md`).
- [ ] T009 Em `tv-web/src/lib/catalog/catalogRepository.ts`: `resolveFavorites` pelo algoritmo de `logic/resolucao-favoritos.md` (índice v9 → `seriesId` → varredura por nome encerrável).
- [ ] T011 Em `tv-web/src/features/catalog/catalogApi.ts`: `FavoritableKind`, `useFavoriteIds`, `FavoritesContent`, `useFavoritesContent` (mapeia com `toItemOut`), `useToggleFavorite`.
- [ ] T013 Criar `tv-web/src/features/favorites/useFavoriteToggle.ts`: recebe `sourceId`, `kind`, `showToast`; expõe `toggle(item, { visibleItems?, onFocusNeighbor? })` que usa `useToggleFavorite`, mostra o aviso e, quando chamado dentro de "Favoritos" desfavoritando, informa o id vizinho antes de a lista mudar.
- [ ] T014 Criar `tv-web/src/features/favorites/FavoritesState.tsx` (+ caso de teste no mesmo `.test.tsx` de T012 ou próprio): estado vazio ("Segure OK sobre um canal/filme/série para favoritar", texto por tipo) com botão `tv-focus` controlado pela tela, e nota de não carregados (FR-009) sem número.

**Critério de Conclusão**: gesto de OK coberto pelos 9 casos; favoritos gravam, listam e resolvem contra a geração ativa em teste com `fake-indexeddb`; hooks e `useFavoriteToggle` testados; `npm run test`, `npm run lint` e `npx tsc -b` limpos; nenhuma tela mudou de comportamento ainda.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 1 - Favoritar e achar um canal (Priority: P1) 🎯 MVP

**Objetivo**: Na Live TV, segurar OK favorita/desfavorita um canal e "★ Favoritos" no topo da trilha lista e toca os canais favoritos.

**Independent Test**: segurar OK sobre um canal, entrar em "★ Favoritos", tocar o canal, desfavoritar — tudo por teclado/controle (spec US1).

### Testes da Fase

- [ ] T015 [US1] Em `tv-web/src/features/live/LiveScreen.test.tsx` (fake timers, `keyDown`/`keyUp`): (a) OK curto na lista toca no keyup; (b) OK demorado favorita, mostra aviso e estrela e **não** abre `PlayerLayer`; (c) segurar mais não alterna de novo; (d) "★ Favoritos" é a primeira entrada da trilha e segurar OK nela entra como OK comum; (e) entrar em "Favoritos" lista os canais em ordem de `favoritedAt` desc e OK toca; (f) estado vazio: Enter no botão devolve o foco à trilha (ativação por tecla, não `click`); (g) nota de não carregados sem número; (h) desfavoritar o focado move ao vizinho; (i) fechar o player volta o foco ao mesmo canal em "Favoritos"; (j) categoria da fonte chamada "Favoritos" não colide com a virtual; (k) mover o foco sobre "★ Favoritos" não chama `useFavoritesContent` habilitado.

### Implementation

- [ ] T016 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: `FocusIdentity` da trilha vira união discriminada (`{ type: 'favorites' } | { type: 'source', name }`, D-004); entrada "★ Favoritos" renderizada na posição 0, fora de `categories`; `enteredCategoryId: number | 'favorites' | null`; `useCategoryFocusPrefetch` não é chamado para a entrada virtual.
- [ ] T017 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: passar `onLongSelect` ao `useRemoteNav` só quando `col === 1` e há canal focado e nenhum player aberto (D-002), chamando `useFavoriteToggle`; OK curto mantém a lógica atual de `onSelect`.
- [ ] T018 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: estrela `.fav-star` nas linhas cujo `stableIdOf(channel)` está em `useFavoriteIds(sourceId, 'channel')`; dica `.fav-hint` "Segure OK para favoritar" quando a coluna de conteúdo tem canais (FR-012).
- [ ] T019 [US1] Em `tv-web/src/features/live/LiveScreen.tsx`: com "Favoritos" entrada, a coluna de conteúdo usa `useFavoritesContent(sourceId, 'channel', true)` (mesma lista virtualizada, estados de carregando/vazio via `FavoritesState`, nota FR-009), com o botão do estado vazio ativado pelo `onSelect` da tela; foco reconciliado por id após desfavoritar (vizinho de T013).

**Critério de Conclusão**: todos os cenários da US1 da spec cobertos por T015 e passando; uma fonte sem nenhum favorito mostra "★ Favoritos" vazia e navegável; nenhum teste existente de `LiveScreen` regrediu; gates (`test`/`lint`/`tsc`) limpos.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 - Favoritar filmes e séries (Priority: P2)

**Objetivo**: O mesmo gesto, estrela, dica e "★ Favoritos" nas grades de Filmes e Séries; OK curto continua abrindo o detalhe.

**Independent Test**: favoritar um filme e uma série, entrar em "★ Favoritos" de cada seção e abrir o detalhe por OK (spec US2).

### Testes da Fase

- [ ] T020 [P] [US2] Em `tv-web/src/features/movies/MoviesScreen.test.tsx`: casos equivalentes a T015 (a)–(h), (j), (k) para a grade — OK curto abre o detalhe no keyup; OK demorado favorita sem chamar `onOpenMovie`; estrela no `.poster-box`; "★ Favoritos" na trilha; vazio ativável por Enter; desfavoritar move ao vizinho da grade.
- [ ] T021 [P] [US2] Em `tv-web/src/features/series/SeriesScreen.test.tsx`: mesmos casos de T020 para séries, mais: "Favoritos" mostra o cartão da série (nunca episódio) e OK abre o detalhe da série.

### Implementation

- [ ] T022 [P] [US2] Em `tv-web/src/features/movies/MoviesScreen.tsx`: mesmas mudanças de T016–T019 adaptadas à grade (`FocusIdentity` da trilha, entrada ★, `onLongSelect` só na coluna de conteúdo, estrela, dica, conteúdo de "Favoritos" com `useFavoritesContent(sourceId, 'movie', …)` na mesma grade virtualizada com `lanes`).
- [ ] T023 [P] [US2] Em `tv-web/src/features/series/SeriesScreen.tsx`: idem T022 com `kind: 'series'`. Não tocar `SeriesDetailScreen.tsx` (episódio não é favoritável, D-009).

**Critério de Conclusão**: cenários da US2 cobertos e passando; desfavoritar numa categoria da fonte tira a estrela e o item de "Favoritos" (invalidação de T011); testes existentes de Filmes/Séries sem regressão; gates limpos.

**Checkpoint**: User Stories 1 e 2 funcionais de forma independente.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

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
