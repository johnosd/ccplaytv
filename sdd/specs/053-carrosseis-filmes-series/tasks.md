---
description: "Tasks da feature 053 — carrosséis, lista lateral recolhível e slots TMDB na tela hero de Filmes e Séries"
---

# Tasks: Carrosséis de categoria, lista lateral recolhível e slots TMDB na tela hero de Filmes e Séries

**Input**: `sdd/specs/053-carrosseis-filmes-series/` — `spec.md`, `plan.md`, `logic/carrosseis-e-foco.md`, `quickstart.md`, `handoff.md`

**Prerequisites**: `plan.md` e `spec.md`; `contract-tests.lock` (5 testes) já gravado — o executor só os faz passar.

**Organization**: por user story. A Fase 3 junta US1 e a parte estrutural de US4 porque o percurso do contrato de US1 atravessa as fileiras reservadas.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Frontend em `tv-web/src/` (tela: `features/vod/`, dados: `features/catalog/`, componentes: `components/`, estilos: `styles/vod.css`, mocks "Em breve": `lib/comingSoon.ts`).
- E2E em `tv-web/e2e/`; docs em `sdd/specs/` e `.planning/backlog.md` (português).
- Comandos de `tv-web/` salvo indicação; scripts SDD da raiz.

---

## Phase 1: Setup

**Purpose**: partir de uma base conhecida.

- [X] T001 Rodar `npx vitest run src/features/vod src/features/catalog src/components` e `npx tsc -b` e anotar no Registro: só os 5 contratos da 053 falham; guardar `git status --short` (trabalho sem commit de outras features não é tocado).
- [X] T002 Em `.planning/backlog.md` → `## Ideias Futuras` (à mão, em português) criar os itens **67** (Top 10 filmes/séries da semana via TMDB, cruzado com a lista; depende da 032), **68** (Bem avaliados: nota real da fonte/TMDB) e **69** (Porque você assistiu: semelhantes da 035 validados na lista; depende da 035). São os `backlogItem` dos slots (T010).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: módulos puros, prévia e preferências que as telas consomem.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

### Contrato da Fase

- `buildShowcaseRows — contrato da feature 053 > ordem fixa sob o hero…` (FR-001/002/006..010)
- `foco da tela hero — contrato da feature 053 > lembra o cartão por fileira…` (FR-011..013, Constitution)
- Comando: `npx vitest run src/features/vod/vodShowcaseRows.carrosseis-filmes-series.contract.test.ts src/features/vod/vodShowcaseFocus.carrosseis-filmes-series.contract.test.ts`

### Implementation

- [X] T003 [P] Criar `tv-web/src/features/vod/vodRowFormats.ts`: tabela `ROW_FORMATS: Record<RowFormat, { itemWidth; itemHeight; cardWidth; rowHeight }>` com as medidas iniciais de `logic/carrosseis-e-foco.md` §6 (fonte única TS; o CSS lê por variáveis inline) e `rowHeight` = título + trilho.
- [X] T004 [P] [US1] Implementar `buildShowcaseRows` em `tv-web/src/features/vod/vodShowcaseRows.ts` (ordem, formatos, slots/categorias sempre, `groupLabel` na chave/destino, `vodGroupDisplay` no título, duplicadas descartadas) → contrato: `ordem fixa sob o hero…`
- [X] T005 [P] [US1] Implementar as 5 funções de `tv-web/src/features/vod/vodShowcaseFocus.ts` conforme `logic/carrosseis-e-foco.md` §2 (elegibilidade, memória `{id,index}`, `'top'`, reconciliação por id) → contrato: `lembra o cartão por fileira…`
- [X] T006 [P] [US2] Criar `tv-web/src/features/vod/vodShowcasePrefs.ts`: `readSideCollapsed(section)`/`writeSideCollapsed(section, value)` em `localStorage`, **toda** leitura/escrita em try/catch, falha/ausência = expandida.
- [X] T007 [US1] Implementar `useCategoryPreviews` em `tv-web/src/features/catalog/catalogApi.ts` (§4 da lógica): `useQueries`, chave `['category-preview', sourceId, id]`, `getActiveCategoryBlock` → senão `listChannels` com limite → senão `pending`; `PREVIEW_LIMIT = 12`; **nada** de `ensureCategory`/`fetch`/escrita. Retorna `ReadonlyMap<number, CategoryPreview>`.
- [X] T008 [US1] Em `tv-web/src/features/catalog/prefetchApi.ts` (`createPrefetchInvalidator.flush`) invalidar também `['category-preview', sourceId, categoryId]` por categoria que chegou.
- [X] T009 [P] Em `tv-web/src/features/vod/vodTarget.ts` alargar `VodShowcaseRow` para `ShowcaseRowKey | 'categories'` (importar o tipo de `vodShowcaseRows.ts`); `isShowcaseFocus` e `VodShowcaseFocus` ficam; corrigir os `Record<VodShowcaseRow, …>` que quebrarem no `tsc`.
- [X] T010 [P] [US4] Registrar em `tv-web/src/lib/comingSoon.ts` `vod-top10-movies`, `vod-top10-series`, `vod-rated`, `vod-because` (mensagens em português, `backlogItem` 67/67/68/69).

### Testes da Fase

- [X] T011 [P] Testes de `vodRowFormats` (cada formato tem medidas > 0; `poster` = 284×383 como hoje) em `tv-web/src/features/vod/vodRowFormats.test.ts`.
- [X] T012 [P] Testes de `vodShowcasePrefs` (round-trip por seção; `localStorage` que lança → expandida, sem exceção) em `tv-web/src/features/vod/vodShowcasePrefs.test.ts`.
- [X] T013 Testes de `useCategoryPreviews` (bloco → `ready` limitado a 12 na ordem da fonte; sem bloco → `pending`; **`fetch` nunca chamado**; `ensureCategory` nunca chamado) em `tv-web/src/features/catalog/catalogApi.previews.test.tsx`, e do invalidador (a chave nova é invalidada) em `prefetchApi.test.ts`.

**Critério de Conclusão**: `npx vitest run` dos 2 contratos acima → 2/2 verdes; `check-contract-tests.ps1 -Slug 053-carrosseis-filmes-series` íntegro; `npx tsc -b` limpo; testes novos verdes; a suíte `vod`/`catalog`/`components` sem regressão (os 3 testes de tela da 053 seguem vermelhos até a Fase 3/4).

**Checkpoint**: módulos puros e dados prontos.

**Registro da Fase**:

- Status: Concluída (2026-10-03)
- Feito: `vodRowFormats.ts`, `buildShowcaseRows`, foco puro (5 funções), `vodShowcasePrefs.ts`, `useCategoryPreviews` (+`PREVIEW_LIMIT`, `categoryPreviewKey`), invalidação da prévia em `prefetchApi.ts`, `VodShowcaseRow` alargado (a tela mantém um alias transitório de 4 fileiras até a Fase 3), 4 entradas em `comingSoon.ts`, itens 67–69 no backlog (T002).
- Contrato: `npx vitest run src/features/vod/vodShowcaseRows…contract.test.ts src/features/vod/vodShowcaseFocus…contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: `npx vitest run src/features/catalog src/features/vod/vodRowFormats.test.ts src/features/vod/vodShowcasePrefs.test.ts` → 8 arquivos / 60 testes verdes; `npx tsc -b` limpo. T001: baseline antes da fase = só os 5 contratos novos vermelhos, `tsc` limpo.
- Pendências: nenhuma.
---

## Phase 3: User Story 1 (+ estrutura de US4) — Carrosséis por categoria e slots reservados (Priority: P1) 🎯 MVP

**Objetivo**: a tela hero mostra, sob o hero, as fileiras fixas, os 3 slots "Em breve" e um carrossel por categoria com "Ver tudo".

**Independent Test**: lista real com várias categorias → descer por todas as fileiras, abrir "Ver tudo" de duas categorias, abrir um card, voltar duas vezes e conferir o foco por id; slots sem consulta de rede.

### Contrato da Fase

- `VodShowcaseScreen — contrato da feature 053 > um carrossel por categoria depois das fileiras fixas…` (US1, FR-001..003, 007, 013)
- `… > slots reservados são focáveis e "Em breve"…` (US4, FR-008, 009, 011)
- Comando: `npx vitest run src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx -t "carrossel por categoria|slots reservados"`

### Implementation

- [X] T014 [US1] Em `tv-web/src/features/vod/VodShowcaseScreen.tsx` trocar as 4 `useIdFocus` por: `rows = buildShowcaseRows(...)`, `entriesOf(rowKey)` (§3) e estado de foco com `initialShowcaseFocus`/`moveShowcase*`/`reconcileShowcaseFocus` (§2); manter a lista lateral (`categories`) como zona separada (`side`) e as teclas atuais dela; `SEE_ALL_ID`/`SLOT_ENTRY_ID` vêm de `vodShowcaseRows.ts` → contrato: ambos
- [X] T015 [US1] Pilha vertical virtualizada em `VodShowcaseScreen.tsx` (§6): `useVirtualizer` vertical com `ROW_FORMATS[format].rowHeight`, `useVirtualFocusSync` na fileira focada, contêiner `.vod-showcase-rows`; substitui o `scrollIntoView` por fileira → contrato: carrossel por categoria
- [X] T016 [US1] Janela de prévias: fileiras de categoria de `focusIdx−1…focusIdx+3` → `useCategoryPreviews(sourceId, janela)`; `pending` na janela → `prioritizeCategory(id)` com debounce 300 ms (efeito com cleanup); manter `usePrefetchHint` + `useCategoryFocusPrefetch` (categoria da fileira focada **ou** da lista lateral) → contrato: carrossel por categoria
- [X] T017 [US1] Renderização das fileiras em `VodShowcaseScreen.tsx`: `section.vod-row[aria-label]` para **todas** (itens, slots, categorias); cabeçalho = título + "Ver tudo ›" **decorativo** (D-009); categoria `pending` → esqueleto `aria-busy` + só o cartão `.vod-see-all-card`; `ready` → `.content-card` + "Ver tudo"; **nunca** card inventado → contrato: carrossel por categoria
- [X] T018 [US4] Slot (`kind: 'slot'`): `.vod-slot-card` focável (`aria-disabled="true"`, `is-soft-disabled`, texto "Em breve" + `getComingSoon(slotId).message`) + cartões fantasma `aria-hidden` (10 no `top10` com número, 6 nos demais); OK só anuncia via `useAnnounce`; **sem** import de TMDB → contrato: slots reservados
- [X] T019 [US1] `handleSelect`/`focusNow`/hero para as novas fileiras: item abre detalhe; `SEE_ALL_ID` → `row.seeAll`; slot → só anúncio; `VodShowcaseFocus = { row: rowKey, id }`; hero de `SEE_ALL_ID`/slot mantém o último item (D-010); lista lateral continua `row: 'categories'` → contrato: ambos
- [X] T020 [P] [US1] CSS inicial em `tv-web/src/styles/vod.css`: `.vod-row` virtualizada (posicionamento absoluto), cabeçalho com "Ver tudo ›", `.vod-slot-card`/fantasmas com tokens V14 (sem literais), esqueleto de categoria pendente.
- [X] T021 [US1] Substituir (D-011) `tv-web/src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` por um equivalente na nova estrutura (mesmos 2 casos: fileiras e destinos de "Ver tudo"; restauração por id), regravar **só** a trava da 052 (`check-contract-tests.ps1 -Slug 052-vitrine-filmes-series -Write -Paths <3 arquivos>`) e anotar `R-020` em `sdd/specs/052-vitrine-filmes-series/plan.md` (autorizado em FR-016).
- [X] T022 [US1] Ajustar `tv-web/src/features/vod/VodShowcaseScreen.test.tsx`, `tv-web/src/App.test.tsx` e `tv-web/src/features/vod/VodScreens.paridade-v14.contract.test.tsx` **sem enfraquecer asserções** (só a estrutura nova de fileiras/slots); se uma trava dessas quebrar, parar e reportar.

### Testes da Fase

- [X] T023 [P] [US1] `tv-web/src/features/vod/VodShowcaseScreen.carrosseis.test.tsx`: categoria `pending` → `prioritizeCategory` chamado uma vez após o debounce e **não** ao passar o foco rápido; `pending → ready` preenche o carrossel; sem fileiras de itens → foco inicial na lista lateral; duas categorias com o mesmo nome → uma fileira.
- [X] T024 [P] [US4] Mesmo arquivo: nenhuma importação/chamada ao TMDB (`fetch` não chamado em todo o percurso); slot de Séries tem título "Top 10 séries da semana".

**Critério de Conclusão**: os 2 contratos de tela acima verdes (`-t`), `check-contract-tests.ps1` íntegro para 053 **e** 052 (regravada), travas 018/019/022/023/024/026/046/049 íntegras, `npx tsc -b` limpo, `npx vitest run src/features/vod src/features/catalog src/components src/App.test.tsx` verde exceto o contrato de recolher (Fase 4).

**Checkpoint**: carrosséis e slots funcionam; a grade (`VodCategoryScreen`) intocada.

**Registro da Fase**:

- Status: Concluída (2026-10-03)
- Feito: `VodShowcaseScreen` reescrita (fileiras dinâmicas por `buildShowcaseRows`, foco puro, pilha vertical virtualizada com `rangeExtractor` que mantém a fileira focada montada, janela de prévias −1…+3, `prioritizeCategory` com debounce de 300 ms, slots `.vod-slot-card` "Em breve" com fantasmas, categoria pendente/vazia como faixa só com "Ver tudo", hero que mantém o último item em slot/"Ver tudo"); CSS em `vod.css` (pilha absoluta, cabeçalho, faixa, slots, fantasmas); contrato 052 da tela hero substituído (mesmos 2 casos; ordem lida pelo foco) e trava 052 regravada (anotada como R-020 no plan da 052 — R-017 já era de outra coisa); `VodShowcaseScreen.test.tsx` ajustado (Top 10 entre Continue e Favoritos); `comingSoon.test.ts` ganhou as 4 chaves novas.
- Contrato: `npx vitest run src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx -t "carrossel por categoria|slots reservados"` → 2/2 verdes (o 3º, de recolher, é da Fase 4); trava 053 e as 34 travas do repositório íntegras (`check-contract-tests.ps1` por feature).
- Testes executados: `npx vitest run src/features src/components src/App.test.tsx src/lib` → 2311 verdes; falham só o contrato de recolher (Fase 4) e 4 testes alheios a esta feature (ver Pendências). `VodShowcaseScreen.carrosseis.test.tsx` (5 casos novos) verde. `npx tsc -b` limpo; `npm run lint` sem erros (1 aviso `incompatible-library` do `useVirtualizer`, igual ao do `Rail`).
- Pendências: (1) `src/lib/player/playerPreferences.test.ts` (3 falhas) e `src/lib/trailer/trailerCandidates.test.ts` (1 falha) falham porque os arquivos de produção correspondentes estão modificados sem commit na árvore (trabalho de outra feature) — não tocados aqui; (2) a validação visual/medidas dos formatos fica para a Fase 5 e o E2E para a Fase 6; (3) A-004: ↑ da 1ª fileira → topbar só é coberta no E2E (T036).
---

## Phase 4: User Story 2 — Lista lateral recolhível (Priority: P1)

**Objetivo**: recolher a lista para uma faixa estreita e expandi-la por controle remoto, com escolha lembrada.

**Independent Test**: recolher, navegar, reabrir o app e conferir que continua recolhida; expandir e escolher uma categoria.

### Contrato da Fase

- `… > ← na lista lateral recolhe e expande por controle remoto…` (US2, FR-004, 005, 013)
- Comando: `npx vitest run src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx -t "recolhe e expande"`

### Implementation

- [X] T025 [P] [US2] `tv-web/src/components/SideCategoryNav.tsx`: prop opt-in `collapsed?: boolean` → classe `side-category-nav--collapsed`; as entradas e o texto **continuam no DOM**; entradas sem `tile`/`icon` mostram a inicial (decorativa, `aria-hidden`); sem a prop o componente é idêntico (Live/Configurações) → contrato: recolhe e expande
- [X] T026 [US2] `VodShowcaseScreen.tsx`: estado `collapsed` inicializado por `readSideCollapsed(section)`; ← com o foco na lista alterna e grava (`writeSideCollapsed`), → vai às fileiras (como hoje); classe `is-collapsed` em `.vod-side-panel`; o foco fica na mesma entrada → contrato: recolhe e expande
- [X] T027 [P] [US2] CSS em `vod.css`: painel recolhido (≈ 96 px por token, largura transitada em 140 ms), tile/ícone centralizados, rótulo/contagem ocultos por CSS (`sr-only`-style, texto no DOM), cabeçalho "◀ Recolher" / "▶" decorativo; os carrosséis ocupam a largura liberada.

### Testes da Fase

- [X] T028 [P] [US2] `tv-web/src/components/SideCategoryNav.collapsed.test.tsx`: `collapsed` mantém rótulos no DOM e a seleção funciona; sem a prop o DOM é igual ao de antes (snapshot de classe).
- [X] T029 [P] [US2] `VodShowcaseScreen.carrosseis.test.tsx`: `localStorage` indisponível → abre expandida e recolher não lança.

**Critério de Conclusão**: contrato de recolher verde; os **5** contratos da 053 verdes no comando completo do `plan.md`; `check-contract-tests.ps1` íntegro; `Live`/`Settings` (`SideCategoryNav`) sem diferença nos testes existentes.

**Checkpoint**: US1 + US4 (estrutura) + US2 completas.

**Registro da Fase**:

- Status: Concluída (2026-10-03)
- Feito: `SideCategoryNav` com `collapsed` opt-in (classe `side-category-nav--collapsed`, inicial decorativa, texto no DOM); `VodShowcaseScreen` com estado `collapsed` (lido de `vodShowcasePrefs`), ← na lista alterna e grava, classe `is-collapsed` no painel, dica "◀ Recolher"/"▶" decorativa; CSS da faixa de 96 px (transição `--duration-fast`).
- Contrato: `npx vitest run src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` → 3/3 verdes; os 5 contratos da 053 verdes; trava 053, 052, 022, 024 íntegras (as demais conferidas na Fase 3, nada nelas mudou).
- Testes executados: `npx vitest run src/features/vod src/components src/App.test.tsx` → 82 arquivos / 462 testes verdes; `SideCategoryNav.collapsed.test.tsx` (2) e o caso de `localStorage` indisponível em `VodShowcaseScreen.carrosseis.test.tsx` verdes; `tsc -b` limpo.
- Pendências: aparência da faixa recolhida e do anel de foco só será vista no E2E/capturas (Fase 6).
---

## Phase 5: User Story 3 — Formatos de card por papel (Priority: P2)

**Objetivo**: Netflix-like sem perder a identidade — pôster alto grande, compacto, Top 10 com número e card largo quando houver imagem real.

**Independent Test**: com histórico, favoritos e várias categorias, conferir um formato por papel, o anel de foco inteiro em cada um e nenhum card sem dado real.

(Sem contrato próprio: o orçamento de 5 foi usado nas stories P1/riscos; formato é visual e coberto por testes de unidade + E2E com medição.)

### Implementation

- [X] T030 [P] [US3] `tv-web/src/components/ContentCard.tsx`: suporte **opt-in** ao `top10` (número grande à esquerda do pôster, decorativo `aria-hidden`) e ao `wide` (backdrop); props novas opcionais, Início/Busca/detalhes inalterados.
- [X] T031 [US3] `vod.css` + `VodShowcaseScreen.tsx`: aplicar `ROW_FORMATS[format]` (variáveis inline `--vod-card-w/--vod-card-h` na `section`) e as regras de `poster-xl`, `poster`, `poster-compact`, `top10` com tokens V14; foco sem escala nos cartões de texto; anel completo dentro da `Rail` (padding + margem negativa como a 052).
- [X] T032 [US3] Regra `wide` (§6 da lógica): hook de leitura **local** do `backdropUrl` do cache de metadata por `stableId` dos itens mostrados em `continue`; `wide` só se **todos** tiverem; senão `poster-xl`; sem consulta nova. Teste em `tv-web/src/features/vod/VodShowcaseScreen.carrosseis.test.tsx` (com/sem backdrop).
- [X] T033 [US3] Altura (R-006): medir em 1920×1080 e 2200×1000 quantas fileiras aparecem sob o hero; se faltar, comprimir o hero antes de encolher card; registrar números reais no Registro e em `R-006`.

### Testes da Fase

- [X] T034 [P] [US3] `tv-web/src/components/ContentCard.formats.test.tsx`: `top10` e `wide` renderizam, número `aria-hidden`; a variante `portrait` sem props novas é idêntica à de hoje.

**Critério de Conclusão**: testes novos verdes; suítes `components`/`vod`/`Home` sem regressão; medidas de T033 registradas; contratos 053 + travas ainda íntegros.

**Checkpoint**: visual completo.

**Registro da Fase**:

- Status: Concluída (2026-10-03)
- Feito: `ContentCard` com `rank` opt-in (Top 10) e uso da variante `wide`; regra pura `allHaveBackdrop` (`vodShowcase.ts`) + `useCachedBackdrops` (leitura local de `titleMetadata`, sem consulta) → `Continue assistindo` vira `wide` só com backdrop de TODOS os itens mostrados; CSS dos formatos por variáveis `--vod-card-w/--vod-card-h` vindas de `vodRowFormats.ts` (poster-xl 300, poster 260, compacto 200, top10 340, wide 400). Medidas (E2E, T033): a 1920×1080 a hero tem 176 px e a área das fileiras 746 px (a 1ª fileira aparece inteira; uma fileira `poster-xl` ocupa 528 px, `poster` 471, compacta/Top 10 388); a 2200×1000, hero 163 px e área de 691 px — não foi preciso comprimir a hero nem encolher card.
- Contrato: sem contrato próprio nesta fase (orçamento usado nas stories P1); os 5 contratos da 053 seguem verdes e a trava íntegra.
- Testes executados: `ContentCard.formats.test.tsx` (2), `vodShowcase.wide.test.ts` (2), caso `wide` em `VodShowcaseScreen.carrosseis.test.tsx`; `npx vitest run src/features/vod src/components src/App.test.tsx` verde; `tsc -b` limpo.
- Pendências: o `wide` raramente ativa (backdrop só existe depois de abrir um detalhe — R-004); o formato Top 10 com número só aparece nos fantasmas do slot reservado até a feature 67 ligar o TMDB.
---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, documentação e gates.

- [X] T035 Migrar `tv-web/e2e/lib/vod.mjs`, `tv-web/e2e/vitrine-filmes-series.mjs` e os roteiros que assumem as 3 fileiras/lista lateral fixas (grep `vod-row|vod-side-panel`) para a nova estrutura; rodar por lote com `node e2e/run.mjs --only a,b --jobs 1` (porta 5173 conferida).
- [X] T036 Criar `tv-web/e2e/carrosseis-filmes-series.mjs` (modelo: `vitrine-filmes-series.mjs`): descer pelas fileiras, "Ver tudo" de uma categoria e voltar ao mesmo carrossel, recolher/expandir e persistir, slots "Em breve" sem rede nova; capturas de Filmes e Séries em 1920×1080 e 2200×1000.
- [X] T037 Conferir `docs/guia-praticas-app-tv/` (foco, rolagem, texto mínimo) e Spec V14 §17/§16/§41 contra o resultado; registrar divergências em `plan.md` → Riscos.
- [X] T038 SC-006: capturas antes/depois de grade (`VodCategoryScreen`), detalhes, player, Live, Configurações e Busca idênticas (ou por escopo + E2E, como a 052/SC-004).
- [X] T039 Rodar `quickstart.md` ponta a ponta.
- [X] T040 Docs: `update-feature-status.ps1 -Slug 053-carrosseis-filmes-series -Status Implementada`, `plan.md` (Estado Atual/Execution Notes/PRÓXIMO), `R-020` na 052; **não** editar o `CLAUDE.md`.

**Registro da Fase (Polish)**:

- Status: Concluída (2026-10-03)
- Feito: `e2e/lib/vod.mjs` (`gotoRow` com a ordem nova, `ensureSideFocus` para `focusSideItem`/`focusFirstRealCategory`), `e2e/carrosseis-filmes-series.mjs` (novo, na `SUITE` de `run.mjs`: ordem das fileiras pelo foco, slot sem rede, ↑ à topbar, "Ver tudo" e RETURN, recolher/persistir/expandir, Séries, 302 categorias virtualizadas, card focado dentro da área, sem requisições externas); capturas em `tv-web/test-results/carrosseis-filmes-series/`. Guia Tizen conferido (restaurar origem ao voltar, indicador de rolagem/continuação; categorias laterais + conteúdo à direita) e Spec V14 §16/§17/§41 (Rail com fade e posição; foco por fileira e por id). SC-006 (grade, detalhes, player, Live, Configurações, Busca idênticos): por escopo — `VodCategoryScreen`, detalhes, player, Live, Settings e Busca não foram editados (só `SideCategoryNav` ganhou prop opt-in e `ContentCard` prop opt-in) — e pelos E2E desses fluxos verdes; não houve captura antes/depois lado a lado.
- Bugs achados e corrigidos pelo E2E (registrados em R-010..R-013): sobrescrita de foco da lista lateral por fileira que chega depois; `useQueries` com janela deslizante estourando "Maximum update depth"; contêiner flex encolhendo a pilha virtualizada; hero que aparecia/sumia mudando a altura sob o foco; tela reaproveitada entre Filmes e Séries (agora `key` por seção em `App.tsx`).
- Gates: `npx tsc -b` limpo; `npm run lint` sem erros; `npm run build` ok; `npm run test` → 2326 verdes e **5 falhas, todas contratos da feature 054 (idioma do app), outra sessão, vermelhos por desenho**; `node e2e/run.mjs` → 32/32 (duas rodadas completas; numa rodada intermediária `navegacao-por-pagina` falhou uma vez em paralelo e passou isolado e 3/3 em paralelo reduzido — flake não explicado, ver Pendências); 35 travas íntegras (`check-contract-tests.ps1` por feature); 5/5 contratos da 053 verdes.
- Pendências: (1) `navegacao-por-pagina` falhou 1× na rodada paralela completa sem causa identificada (passou depois 5× seguidas); (2) passada na TV física não feita (recomendação); (3) contratos 054 vermelhos pertencem a outra feature.
### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1 + estrutura de US4) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] 5 contratos da 053 verdes na suíte completa e `check-contract-tests.ps1` íntegro para **053, 052 (regravada), 018, 019, 022, 023, 024, 026, 046, 049**
- [X] De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` completo
- [X] `quickstart.md` executado (partes automatizáveis: E2E + unitários; passos visuais conferidos nas capturas)
- [X] Passada na TV física: **recomendação, fora do gate** — NÃO executada nesta sessão (custo das prévias e da pilha virtualizada segue sem medição no aparelho)

---

## Dependencies & Execution Order

- Fase 1 → Fase 2 (bloqueia tudo) → Fase 3 → Fase 4 → Fase 5 → Fase 6.
- Dentro da Fase 2: T003–T006, T009, T010 em paralelo; T007 antes de T008/T013.
- Dentro da Fase 3: T014 → T015 → T016 → T017/T018 → T019; T020 em paralelo; T021/T022 só depois da tela funcionar.

### Parallel Opportunities

- `[P]` marcadas na mesma fase têm arquivos independentes.

## Implementation Strategy

### MVP First

Fases 1–3: já entregam os carrosséis por categoria com "Ver tudo", os slots reservados e a pilha virtualizada. Validar no localhost antes da lista recolhível.

### Incremental Delivery

Fase 4 (recolher) e Fase 5 (formatos) acrescentam sem tocar nas anteriores; cada fase fecha com checkpoint e contratos íntegros.

## Notes

- A grade (`VodCategoryScreen`) **não** muda; se uma task parecer exigir isso, parar.
- Contratos travados nunca são editados; a única exceção é a troca autorizada do contrato 052 da tela hero (T021).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Emenda pós-execução (2026-10-03)

A pedido do usuário (ver spec E-1, plan D-012/R-016): `←`/`→` na lista lateral passaram a **paginar**; a lista só recolhe com o foco nos cards. Feito: `VodShowcaseScreen` (`pageSideList`, `collapsed = !inSide`, janela de estabilização do foco inicial), `vodShowcasePrefs` removido, contrato 3 reescrito + trava 053 regravada, `VodShowcaseScreen.carrosseis.test.tsx` e `carrosseis-filmes-series.mjs` atualizados, helpers E2E (`enterRows`, `ensureSideFocus`). Gates: `tsc` limpo, lint sem erros, 5/5 contratos, `npx vitest run src/features/vod src/components src/App.test.tsx` verde, E2E 32/32 (a rodada anterior teve 1 falha de Live que passou isolada 3×), travas todas íntegras.
