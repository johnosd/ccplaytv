---
description: "Tasks da feature 036 — Limpar histórico e remover item do Histórico"
---

# Tasks: Limpar histórico e remover item do Histórico

**Input**: Documentos de design de `sdd/specs/036-limpar-historico/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/remocao-historico.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)
- Caminhos relativos à raiz do repositório

## Path Conventions

- Todo o código em `tv-web/src/` (client-first, ADR-008); comandos `npm`/`npx` rodam dentro de `tv-web/`.
- Regras de dados em `tv-web/src/lib/catalog/`; UI compartilhada em `tv-web/src/features/history/` (nova); telas em `tv-web/src/features/{vod,movies,series,settings}/`.
- E2E em `tv-web/e2e/*.mjs`; scripts do SDD em `.planning/scripts/powershell/` (rodar da raiz).
- Contratos travados: `tv-web/src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts`, `tv-web/src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx` — **nunca editar**.

---

## Phase 1: Foundational — regras de dados do Histórico (bloqueia tudo)

**Objetivo**: `historyRemoval.ts` real e `listPlayed` respeitando `historyHiddenAt`, sem nenhuma UI.

**Independent Test**: os 4 contratos de dados verdes; `history.filmes-series-ds-v14.contract.test.ts` e `userStateRepository.historico.contract.test.ts` (travas da 025/019) continuam verdes.

### Contrato da Fase

- C1 `remover filme só do Histórico: sai do Histórico, mas a retomada, o favorito e o "assistido" ficam` — FR-008/012/013
- C2 `remover e apagar progresso tira do Histórico e de "Continuar"; uma reprodução nova devolve o filme ao Histórico` — FR-009/016
- C3 `remover uma série age sobre todos os episódios dela, de todas as temporadas — e só dela; "assistido" do episódio fica` — FR-015
- C4 `limpar Histórico de Filmes: apaga os indisponíveis também, mantém a retomada, e não toca Séries nem outra lista` — FR-014/025
- Comando (em `tv-web/`): `npx vitest run src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts`

### Implementation

- [X] T001 [US1] Implementar `isInHistory` em `tv-web/src/lib/catalog/historyRemoval.ts` (`logic/remocao-historico.md` §1) → contratos C1–C4
- [X] T002 [US1] `listPlayed` em `tv-web/src/lib/catalog/userStateRepository.ts` filtra por `isInHistory` (importar de `historyRemoval.ts` sem criar ciclo — se criar, mover `isInHistory` para `userStateRepository.ts` e reexportar) → C1, C2, C4
- [X] T003 [US1] `removeMovieFromHistory` (§2), transação `rw` em `userStates` → C1, C2
- [X] T004 [US1] `removeSeriesFromHistory` (§3), via `listEpisodes` + `buildStableId` (mesmo cálculo de `useSeriesWatchedSummary`) → C3
- [X] T005 [US2] `clearHistory` (§4) e `summarizeHistory` (§5) → C4
- [X] T006 [US1] Em `tv-web/src/features/catalog/catalogApi.ts`: `invalidateHistoryRemoval(queryClient)` (§10, lista fechada D-010), `useRemoveFromHistory()` (alvo `{kind:'movie', stableId, sourceId} | {kind:'series', seriesId, sourceId}` + `mode`), `useClearHistory()`, `useHistorySummary(sourceId, enabled)` (chave `['history-summary', sourceId]`)

### Testes da Fase

- [X] T007 [P] [US1] Testes complementares em `tv-web/src/lib/catalog/historyRemoval.test.ts`: remover item fora do Histórico é no-op; `historyHiddenAt = max(now, lastWatched)`; `clearHistory('both', 'history-and-progress')` apaga retomada de item já escondido (D-005); `summarizeHistory` (títulos, indisponíveis, `hasProgress`, escopo vazio)

**Critério de Conclusão**: comando do contrato → 4/4 verdes; `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 036-limpar-historico` íntegro; `npx vitest run src/lib/catalog` verde (exceto os contratos ainda vermelhos da 034, que não são desta feature); `npx tsc -b` limpo.

**Checkpoint**: regras de dados prontas — as duas stories podem começar.

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: `isInHistory` mora em `userStateRepository.ts` (reexportada por `historyRemoval.ts`, sem ciclo — o caminho previsto na T002) e `listPlayed` filtra por ela; `historyRemoval.ts` real (`removeMovieFromHistory`, `removeSeriesFromHistory` via `listEpisodes` + `buildStableId`, `clearHistory`, `summarizeHistory`), com um `removedState` comum (§1–§4); `catalogApi.ts` ganhou `invalidateHistoryRemoval` (lista fechada D-010), `useRemoveFromHistory`, `useClearHistory`, `useHistorySummary(sourceId, enabled)` e o tipo `HistoryRemovalTarget`.
- Contrato: `npx vitest run src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts` → 4/4 verdes na 1ª tentativa; trava íntegra (`check-contract-tests.ps1 -Slug 036-limpar-historico`); travas da 019 e 025 íntegras.
- Testes executados: `npx vitest run src/lib/catalog src/features/catalog` → 462/466 (as 4 falhas são os contratos da 034, não executada — esperado); `historyRemoval.test.ts` novo (6 casos: `isInHistory`, no-op fora do Histórico, `max(now, lastWatched)`, D-005 no lote, `summarizeHistory`); `npx tsc -b --noEmit` limpo; `npx oxlint src/lib/catalog src/features/catalog` limpo.
- Pendências: nenhuma. Nota: o plano diz "Dexie continua v12"; desde a 039 é **v15** — o campo continua sem índice, então nada muda (D-003 vale igual).

---

## Phase 2: User Story 1 — remover pela tecla vermelha na grade (Priority: P1) 🎯 MVP

**Objetivo**: no `↺ Histórico` de Filmes/Séries, a tecla vermelha abre a confirmação e remove o título focado, com foco no vizinho.

**Independent Test**: contrato C5 verde; em `npm run dev`, Filmes › ↺ Histórico, tecla vermelha (evento sintético `ColorF0Red`) remove o título.

### Contrato da Fase

- C5 `tecla vermelha no item focado abre a confirmação com "Cancelar" focado; "Remover do histórico" tira o item, foca o vizinho e mantém a retomada` — FR-001/007/008/011/017
- Comando (em `tv-web/`): `npx vitest run src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx`

### Implementation

- [X] T008 [P] [US1] `tv-web/src/lib/tizenColorKey.ts`: `REMOVE_COLOR_KEY = 'ColorF0Red'`, `REMOVE_COLOR_KEYCODE = 403`, `registerRemoveColorKey(): boolean` estrito (§7, D-007) e `isRemoveColorKeyRegistered()`; atualizar o comentário do topo ("Registra só a amarela") e a menção ao item 44 do backlog (retirado)
- [X] T009 [P] [US1] `tv-web/src/lib/useRemoteNav.ts`: handler opcional `onRemoveKey` (por nome ou `keyCode`), só reconhecido com handler, debounce próprio de 400 ms (§7) → C5
- [X] T010 [US1] `tv-web/src/App.tsx`: chamar `registerRemoveColorKey()` junto de `registerFavoriteColorKey()`/`registerMediaKeys()`
- [X] T011 [P] [US1] Extrair `computeNeighbor` de `tv-web/src/features/favorites/useFavoriteToggle.ts` para `tv-web/src/features/favorites/neighbor.ts` (exportada), sem mudar comportamento
- [X] T012 [US1] Criar `tv-web/src/features/history/HistoryRemovalModal.tsx` (§6): modos item/lote, 2 ou 3 ações, Cancelar em 0, estado de erro com "Tentar de novo"; CSS só com tokens (reusar `.modal-title`/`.modal-description`/`.modal-actions`) → C5
- [X] T013 [US1] `tv-web/src/features/vod/VodCatalogScreen.tsx`: estado `removalTarget` + leitura de `hasProgress` do alvo antes de abrir (§8; série via `series_id`); `onRemoveKey` só nas condições de §8 e nunca com o modal aberto → C5
- [X] T014 [US1] Confirmar → `useRemoveFromHistory`; sucesso: toast "Removido do histórico", foco no vizinho (T011); falha: modal em estado de erro (FR-020) → C5
- [X] T015 [US1] Dica "● Remover do histórico" junto do `FavoriteHint`, só com `isRemoveColorKeyRegistered() && enteredHistory && showResultsGrid` (FR-003)

### Testes da Fase

- [X] T016 [P] [US1] `tv-web/src/lib/useRemoteNav.test.ts` (ou arquivo existente): `onRemoveKey` por nome e por `keyCode` 403; sem handler a tecla não recebe `preventDefault`; segurar/repetir chama uma vez (FR-021)
- [X] T017 [P] [US1] `tv-web/src/features/history/HistoryRemovalModal.test.tsx`: sem progresso → 2 ações (US1/AC3); RETURN cancela; ←/→; erro com "Tentar de novo"; `findUnnamedControls` vazio. Mais, em `tv-web/src/features/vod/VodCatalogScreen.test.tsx`: tecla vermelha fora do Histórico não faz nada; série removida some da grade; último item → estado vazio focável (FR-018); "Remover e apagar progresso" tira de Continuar; `tizenColorKey` estrito (lista vazia → `false`, dica ausente)

**Critério de Conclusão**: comando do C5 → 1/1 verde e os 4 da Fase 1 continuam verdes; trava íntegra; `npx vitest run src/features/vod src/lib src/features/favorites src/features/history` verde; `npx tsc -b` e `npm run lint` limpos.

**Checkpoint**: US1 pela grade funcional (MVP).

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: `tizenColorKey.ts` — `REMOVE_COLOR_KEY`/`REMOVE_COLOR_KEYCODE`, `registerRemoveColorKey()` estrito e `isRemoveColorKeyRegistered()`; `useRemoteNav` — `onRemoveKey` (nome ou `keyCode` 403, só com handler, debounce de 400 ms); `App.tsx` registra a vermelha; `computeNeighbor` extraída para `features/favorites/neighbor.ts`; `features/history/HistoryRemovalModal.tsx` (item/lote, 2 ou 3 ações, erro com "Tentar de novo" repetindo o modo); `VodCatalogScreen` — `removal`/`removalOpening`, `historyTargetHasProgress` lido antes de abrir (função nova em `historyRemoval.ts`), `onRemoveKey` só com `enteredHistory && col 1 && toolbar null && item && nada aberto` (inclui o modal de Ordenar, que também não intercepta a vermelha), sucesso → toast + vizinho, falha → modal em erro; dica "● Remover do histórico" só com a tecla registrada.
- Contrato: `npx vitest run src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx src/lib/catalog/historyRemoval.limpar-historico.contract.test.ts` → 5/5 verdes na 1ª tentativa; trava íntegra.
- Testes executados: 14 testes novos (`useRemoteNav.removeKey.test.tsx`, `tizenColorKey.remove.test.ts`, `HistoryRemovalModal.test.tsx`, `VodCatalogScreen.limpar-historico.test.tsx`) verdes; `npx vitest run src/features/vod src/lib src/features/favorites src/features/history src/App` → 909/916 na 1ª rodada: 3 falhas em `App.test.tsx` eram o mock de `tizenColorKey` sem a função nova (corrigido: mock parcial com `importOriginal`, arquivo não travado) e 4 são os contratos da 034 (esperado); depois, `App.test.tsx` 3/3. `tsc` limpo; `oxlint` sem erro (só avisos antigos).
- Pendências: nenhuma.

---

## Phase 3: User Story 1 — ação "Remover do histórico" no detalhe (Priority: P1)

**Objetivo**: caminho completo por setas + OK em qualquer controle, e volta à grade reconciliada.

**Independent Test**: abrir um filme e uma série que estão no Histórico, remover pelo detalhe, voltar e ver o foco num vizinho.

### Implementation

- [X] T018 [US1] `tv-web/src/features/movies/MovieDetailScreen.tsx`: ação `remove-history` **por último** em `buildActions`, só com `isInHistory(userState)`; abre `HistoryRemovalModal` (item, `hasProgress = progressSeconds > 0`); sucesso → toast, ação some (§9, FR-004/FR-005)
- [X] T019 [US1] `tv-web/src/features/series/SeriesDetailScreen.tsx`: mesma ação depois de `trailer`, presente quando algum estado de episódio `isInHistory`; `hasProgress` sobre os episódios; alvo `series.series_id` (§9)
- [X] T020 [US1] Garantir que nenhum dos dois detalhes passa teclado à tela com o modal aberto (o `Modal` já captura; conferir que `onSelect` da tela não reabre)
- [X] T021 [US1] `tv-web/src/features/vod/VodCatalogScreen.tsx`: ao restaurar snapshot, se `focusedItemId` não existe mais e há `focusedIndexHint`, focar `items[min(dica, length - 1)]` (US1/AC9, Constitution "Voltar Restaura Foco")

### Testes da Fase

- [X] T022 [P] [US1] `MovieDetailScreen.test.tsx`/`SeriesDetailScreen.test.tsx`: ação ausente fora do Histórico (US1/AC8), presente e por último dentro, índice 0 continua a ação primária, remover mantém favorito/"assistido"
- [X] T023 [P] [US1] `VodCatalogScreen.test.tsx`: snapshot com id removido restaura no vizinho pela dica

**Critério de Conclusão**: contratos C1–C5 verdes e trava íntegra; os contratos travados de `MovieDetailScreen`/`SeriesDetailScreen` de outras features (025, 032, 033 e, se já executada, 035) continuam verdes — `npx vitest run src/features/movies src/features/series`; `tsc`/lint limpos.

**Checkpoint**: US1 completa (grade + detalhe).

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: `MovieDetailScreen` — ação `remove-history` por último (depois de `toggle-watched`), só com `isInHistory(userState)`, modal com `hasProgress = progressSeconds > 0`, sucesso → toast e a ação some (`safeActionFocus` faz o clamp). `SeriesDetailScreen` — mesma ação por último (depois de **Semelhantes**, que a 035 pôs depois de Trailer; a regra de fundo é "por último"), presente quando algum estado de episódio `isInHistory`, alvo `series.series_id`. T020: o `Modal` captura setas/OK/RETURN, então o `onSelect` da tela não reabre nada. T021: `VodCatalogScreen` usa `focusedIndexHint` do snapshot enquanto o foco ainda é o id restaurado (que sumiu) e a lista é a restaurada — sem ref lido no render; não dava para semear `lastItemFocusRef`, que o efeito grava com 0 enquanto a lista está vazia.
- Contrato: sem contrato nesta fase; C1–C5 seguem verdes e a trava da 036 íntegra; travas da 025, 032, 033 e 035 íntegras.
- Testes executados: `MovieDetailScreen.limpar-historico.test.tsx` (2), `SeriesDetailScreen.limpar-historico.test.tsx` (2) e um caso novo de restauração pela dica em `VodCatalogScreen.limpar-historico.test.tsx` — 8/8. `npx vitest run src/features/movies src/features/series src/features/vod` → 241/242 na 1ª rodada: o caso da 019 "a ação de assistido continua por último" (não travado) passou a ver "Remover do histórico" depois dela, como a §9 manda — asserção atualizada para "penúltima + Remover por último", e o suíte de filmes ficou 70/70. `tsc` limpo; `oxlint` sem erro.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 — aba Privacidade com limpeza em lote (Priority: P2)

**Objetivo**: Configurações › Privacidade com as três limpezas da lista ativa.

**Independent Test**: com filmes e séries reproduzidos, limpar só Filmes com "apagar progresso" e ver Séries intacta; depois limpar ambos mantendo a retomada.

### Implementation

- [X] T024 [US2] Criar `tv-web/src/features/settings/PrivacyPanel.tsx` (§11): nome da lista, três linhas com contagens de `summarizeHistory`, soft disabled com `aria-disabled` e motivo no nome, estado sem lista ativa com "Voltar às abas"; estilos em `tv-web/src/styles/settings.css` só com tokens
- [X] T025 [US2] `tv-web/src/features/settings/SettingsScreen.tsx`: `SettingsTab` + `'privacy'` antes de `'about'` (D-008), navegação ↑/↓/←/↑-topbar da aba, SELECT → modal lote ou toast de vazio, `useClearHistory` com toast e foco mantido (FR-028), modal em erro na falha
- [X] T026 [US2] Garantir que `useHistorySummary` só liga com a aba Privacidade ativa e que nada muda nas outras abas (contrato travado da 026 em `SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` continua verde)

### Testes da Fase

- [X] T027 [P] [US2] `tv-web/src/features/settings/PrivacyPanel.test.tsx` + casos em `SettingsScreen.test.tsx`: contagens (inclui indisponíveis), soft disabled sem modal (US2/AC4), sem lista ativa focável (US2/AC6), limpar ambos com progresso esvazia Continuar (US2/AC3), `findUnnamedControls` vazio

**Critério de Conclusão**: contratos C1–C5 verdes e trava íntegra; `npx vitest run src/features/settings` verde (inclui a trava da 026); `tsc`/lint limpos.

**Checkpoint**: US2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: pelo registro de abas do item 63 (R-005), não por `SettingsScreen.tsx` (que não mudou): `'privacy'` na união de `tabs/settingsTab.ts`, uma linha em `tabs/settingsTabs.ts` antes de "Sobre & créditos" (ícone `history`), módulo `tabs/PrivacyTab.tsx` (↑/↓/←, ↑ na 1ª linha vai à topbar, OK → modal em lote ou toast de vazio, `useClearHistory` com toast e foco mantido, modal em erro na falha), `PrivacyPanel.tsx` (cabeçalho com o nome da lista, três linhas com `aria-label` "Limpar histórico de X — contagem", linha vazia `.is-soft-disabled` + `aria-disabled`, estado sem lista com "Voltar às abas" via `EmptyState`), `privacyModel.ts` (texto e soma de "Ambos" — separado para não gerar aviso de `only-export-components`), estilos `.privacy-panel*` em `styles/settings.css` só com tokens. T026: `useHistorySummary` só roda com a aba montada, e a aba só monta quando ativa.
- Contrato: sem contrato nesta fase; C1–C5 verdes, trava da 036 íntegra, trava da 026 (`SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`) verde.
- Testes executados: `SettingsScreen.privacidade.test.tsx` (3: contagens com indisponíveis + linha vazia sem modal + `findUnnamedControls`; limpar ambos com apagar progresso esvazia Histórico e Continuar com foco mantido; sem lista ativa) e `privacyModel.test.ts` (2). 1ª rodada: 1 falha do **teste** (esperava a linha habilitada, mas durante "Carregando…" ela também não é `aria-disabled` — passou a esperar a contagem). `npx vitest run src/features/settings` → 52/52; `tsc` limpo; `oxlint` sem erro.
- Pendências: nenhuma.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T028 Suíte completa `npm run test` (flakes conhecidos de `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo: confirmar isolados antes de declarar), `npx tsc -b`, `npm run lint`, `npm run build:tizen` (sem arquivo novo emitido — se aparecer, listar em `tizen_web_project.yaml`)
- [X] T029 Todas as travas do repositório íntegras: `check-contract-tests.ps1` para 036 e para as features com lock que tocam as mesmas telas (019, 025, 026, 032, 033, 034/035 se já travadas)
- [X] T030 Criar `tv-web/e2e/limpar-historico.mjs` (fluxos US1 grade + detalhe e US2 Privacidade, tecla vermelha por evento sintético `ColorF0Red`, e um cenário com `tizen.tvinputdevice` falso via `page.addInitScript` provando a dica) e incluí-lo em `test:e2e` no `tv-web/package.json`; rodar `npm run test:e2e` inteiro com `npm run dev` recém-iniciado
- [X] T031 `tv-web/e2e/paridade-limpeza.mjs`: atualizar só a linha de base da(s) captura(s) de Configurações (aba nova, R-003), registrando em Execution Notes
- [X] T032 Rodar `quickstart.md` (cenários manuais no navegador)
- [X] T033 Documentação: parágrafo da 036 em `CLAUDE.md` (Project status), item 57 do backlog para `Entregue` na tabela de ideias, e nota da tecla vermelha no item 58 (verificação recomendada)

- [X] T034 [ad-hoc, descoberta na T031] Corrigir o recorte do foco nas linhas de largura total de Configurações (bug anterior à 036, visto na paridade: "Reduzir movimento" aparecia como "eduzir movimento … Ligad"; a linha nova da Privacidade tinha o mesmo defeito). Correção aprovada pelo usuário: `.no-scale` em "Adicionar lista", nas linhas de Acessibilidade, na caixa de versão de Sobre e nas linhas da Privacidade (DS §11: linhas não escalam), e folga de `var(--space-1)` em `.settings-panel` compensada por margem negativa igual (o anel não é mais recortado e o conteúdo não se move). Teste `SettingsPanels.foco-sem-escala.test.tsx`; paridade: 08/10 só com a aba nova, 09 com a linha focada inteira; E2E de Configurações verdes (R-007)

### Checklist de Release

- [X] Fase 1 (fundação de dados) concluída
- [X] Fase 2 (US1 grade) concluída
- [X] Fase 3 (US1 detalhe) concluída
- [X] Fase 4 (US2 Privacidade) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 036-limpar-historico` íntegro
- [X] Travas de outras features intactas (T029)
- [X] `npm run test:e2e` verde, incluindo `e2e/limpar-historico.mjs`
- [X] `build:tizen` limpo
- [X] `quickstart.md` executado
- [X] Passada na TV física: **recomendada, não gate** (tecla vermelha — R-002) — feita em 2026-10-01, confirmada pelo usuário na QN50Q60DAGXZD

---

## Dependencies & Execution Order

- **Phase 1** bloqueia tudo.
- **Phase 2** depende da 1. **Phase 3** depende da 2 (usa `HistoryRemovalModal` e a extração do vizinho). **Phase 4** depende da 1 e do `HistoryRemovalModal` (T012) — pode andar em paralelo à Phase 3 depois da 2.
- **Phase 5** depois de todas.

### Parallel Opportunities

- T008, T009, T011 em paralelo (arquivos diferentes).
- Phase 3 ∥ Phase 4 depois da Phase 2.

## Implementation Strategy

MVP = Phases 1 + 2 (remover pela grade). Depois o detalhe (caminho completo por setas + OK — necessário para a constitution, não opcional) e a aba Privacidade.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada fase coerente
- Parar em cada checkpoint pra validar

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 6: Convergence

**Origem**: `sdd-converge` de 2026-10-01 — duas lacunas, nenhuma CRITICAL/HIGH.

- [X] T035 [US1/US2] Com a confirmação aberta, a tela de trás não marca foco — exatamente um `.tv-focus` (o do modal): `VodCatalogScreen` (card focado com `removal` aberto), `MovieDetailScreen`/`SeriesDetailScreen` (ação com `removal` aberto) e `PrivacyTab` (linha com `confirm` aberto); ao fechar, o foco volta ao mesmo item (FR-010). Teste em cada um contando um único `.tv-focus` com o modal aberto. Origem: SC-004; Constitution "Foco Visível e Sem Becos Sem Saída" (C-01, MEDIUM)
- [X] T036 [US2] Rótulo da 3ª ação da aba Privacidade: "Limpar ambos" (nome acessível "Limpar ambos — {contagem}"), como a FR-023 nomeia — hoje é "Limpar histórico de Filmes e Séries"; ajustar `PrivacyPanel`/`privacyModel`, os testes e `e2e/limpar-historico.mjs` (a pergunta do modal em lote, "Limpar o histórico de Filmes e Séries?", fica). Origem: FR-023 (C-02, LOW)

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: T035 — com a confirmação aberta, a tela de trás não marca foco: card da grade (`removal === null`), ação do detalhe de filme e de série (`!removal`) e linha da Privacidade (`!confirm`); ao fechar, o foco volta ao mesmo item, porque o estado nunca mudou. T036 — `PRIVACY_ROW_LABEL` em `privacyModel.ts`: "Limpar histórico de Filmes/Séries" e "Limpar ambos" (FR-023); a pergunta do modal e os toasts continuam dizendo "Filmes e Séries".
- Contrato: `npx vitest run src/features/vod/VodCatalogScreen.limpar-historico.contract.test.tsx` → verde; trava íntegra.
- Testes executados: asserção de "exatamente um `.tv-focus`" com o modal aberto nos 4 lugares (+ RETURN devolvendo o foco à ação no detalhe de filme) — 12/12; `npx vitest run src/features/settings` 55/55; `npx vitest run src/features/movies src/features/series src/features/vod` 242/242; `tsc`, `oxlint` e `build:tizen` limpos; `node e2e/limpar-historico.mjs` verde (nova verificação do rótulo "Limpar ambos").
- Pendências: nenhuma.
