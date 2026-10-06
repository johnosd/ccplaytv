---
description: "Tasks da feature 060 — Home no layout Vitrine expandida"
---

# Tasks: Home no layout "Vitrine expandida" do Design System

**Input**: Documentos de design de `sdd/specs/060-home-vitrine-expandida/`

**Prerequisites**: plan.md, spec.md, `logic/billboard-e-navegacao.md`, `logic/cards-e-expansao.md`, `logic/fileiras-e-dados.md`, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)

## Path Conventions

- Frontend único em `tv-web/` (React 19 + TypeScript + Vite); comandos de teste rodam de `tv-web/`.
- Tela: `tv-web/src/features/home/`; componentes compartilhados: `tv-web/src/components/`; shell: `tv-web/src/features/shell/`.
- Dados/hooks: `tv-web/src/features/catalog/` (`catalogApi.ts`, `becauseApi.ts`); regras puras de dado: `tv-web/src/lib/catalog/`; TMDB: `tv-web/src/lib/metadata/`.
- Filmes/Séries: `tv-web/src/features/vod/`; CSS: `tv-web/src/styles/home.css` (+ token em `tv-web/src/index.css`); idioma: `tv-web/src/lib/i18n/messages/`.
- E2E: `tv-web/e2e/*.mjs` + `tv-web/e2e/run.mjs` (`SUITE`). Scripts SDD da raiz: `.planning/scripts/powershell/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: textos, medidas e o esqueleto de CSS que todas as stories usam.

- [X] T001 [P] Chaves novas em pt/en/es: `tv-web/src/lib/i18n/messages/home.ts` (fileiras "Ao vivo agora", "Filmes adicionados", "Séries adicionadas"; "AO VIVO"; "Todos os canais"; "faltam {time}"; selos `sr-only` "Novo"/"Assistido"/"Na Minha Lista"; "OK Detalhes"; rótulo do dock no billboard se mudar) e `tv-web/src/lib/i18n/messages/vodShowcase.ts` (`showcase.row.becauseOf` = "Porque você assistiu {title}", `showcase.eyebrow.because`). Conferir `areas.test.ts`.
- [X] T002 [P] `tv-web/src/features/home/homeRowFormats.ts`: medidas de `logic/cards-e-expansao.md` §1 (fonte única, padrão de `features/vod/vodRowFormats.ts`).
- [X] T003 [P] `tv-web/src/styles/home.css`: abrir o bloco "Home Vitrine expandida (feature 060)" e o token `--home-expand-duration` (padrão `var(--duration-standard)`) — só tokens V14, medidas por `var(--home-card-*)`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: regras puras, props opcionais e dados locais que as três stories usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `pickBecauseSeed — contrato da feature 060 › escolhe o concluído mais recente…` — FR-014, US3/AC2–AC3
- Comando: `npx vitest run src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts`

### Implementation

- [X] T004 [P] `pickBecauseSeed` em `tv-web/src/lib/catalog/becauseSeed.ts` (stub existe) — regra de `logic/fileiras-e-dados.md` §2 passo 4 → contrato: `pickBecauseSeed — contrato da feature 060`
- [X] T005 [P] `buildHomeRows` em `tv-web/src/features/home/homeRows.ts` — ordem/existência de `logic/billboard-e-navegacao.md` §3 (D-014)
- [X] T006 [P] `cardBadges` em `tv-web/src/features/home/cardBadges.ts` — `logic/cards-e-expansao.md` §4
- [X] T007 [P] `Rail` (`tv-web/src/components/Rail.tsx`): props opcionais `focusedItemWidth` e `align` (D-008, `logic/cards-e-expansao.md` §2); sem elas, comportamento idêntico
- [X] T008 [P] `AppShell` (`tv-web/src/features/shell/AppShell.tsx` + `tv-web/src/styles/shell.css`): prop opcional `backdrop` como 1º filho de `.app-shell`, absoluto, atrás da topbar (D-004)
- [X] T009 [P] Guardar backdrop que já chega (FR-021, `logic/fileiras-e-dados.md` §5): `TmdbTitleRef.backdropUrl?` (`tv-web/src/lib/catalog/db.ts`), `mapSimilar` (`tv-web/src/lib/metadata/tmdbMapping.ts`), `DiscoveryTitle.backdropUrl?` + `mapItem` (`tv-web/src/lib/metadata/tmdbDiscovery.ts`), `DiscoveryPick.backdropUrl?` em `projectTop10` e as imagens da Dica em `projectTip` (`tv-web/src/features/catalog/catalogApi.ts`). Sem bump do Dexie.
- [X] T010 Hooks locais em `tv-web/src/features/catalog/catalogApi.ts`: `useHomeImages(items, extra)` (D-006, `logic/fileiras-e-dados.md` §1), `useContinueProgress(sourceId, items)` (`logic/cards-e-expansao.md` §6), `useRecentlyAdded` devolvendo `coveredCategories`/`totalCategories` (mesmo `select`, sem custo extra)

### Testes da Fase

- [X] T011 [P] `tv-web/src/features/home/homeRows.test.ts` e `tv-web/src/features/home/cardBadges.test.ts` (NOVO no limite de 7 dias, relógio adiantado, nota 0/null)
- [X] T012 [P] `tv-web/src/components/Rail.home-vitrine-expandida.test.tsx`: largura do focado, `align: 'start'`, sem props = igual a hoje; rodar também `Rail.biblioteca-componentes.contract.test.tsx` (022)
- [X] T013 [P] `AppShell` com e sem `backdrop` (DOM idêntico sem a prop); testes de `tmdbMapping`/`tmdbDiscovery` para o backdrop (URL sem chave) e de `useHomeImages`/`useContinueProgress` (prioridade das fontes; sem duração → sem progresso)

**Critério de Conclusão**: `npx vitest run src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1 -Slug 060-home-vitrine-expandida` íntegro; contratos 022, 035 e 057 (`tmdbDiscovery`, `discoveryRules`) verdes sem edição; testes da fase verdes; `npx tsc -b` limpo. Nenhuma tela mudou visualmente ainda.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída (2026-10-05) — Fases 1 e 2.
- Feito: T001 chaves pt/en/es (`home.ts`, `vodShowcase.ts`); T002 `homeRowFormats.ts`; T003 token `--home-expand-duration`; T004 `pickBecauseSeed`; T005 `buildHomeRows`; T006 `cardBadges`; T007 `Rail` (`focusedItemWidth`/`align`, remedida em `useLayoutEffect` só quando a prop existe); T008 `AppShell.backdrop` (+ CSS com `isolation`); T009 backdrop guardado em `TmdbTitleRef`/`DiscoveryTitle` e mapa `images` no retorno de `useWeeklyTop10`/`useDailyTip`; T010 `useHomeImages`, `useContinueCards` (+ `resolveContinueEntries` em `catalogRepository.ts`, que `resolveContinueWatching` agora reaproveita) e `useRecentlyAdded(…, enabled)` com cobertura.
- Contrato: `npx vitest run src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts` → 1/1 verde; `check-contract-tests.ps1` íntegro para 060, 026, 022, 035, 052, 053, 056, 057 e 059.
- Testes executados: `homeRows.test.ts` (3), `cardBadges.test.ts` (4), `Rail.home-vitrine-expandida.test.tsx` (4) + `Rail.test.tsx`/`Rail.item-width.test.tsx`/contrato 022 verdes, `AppShell.test.tsx` (+2), `tmdbMapping.test.ts` (+1), `tmdbDiscovery.test.ts` (+1), `catalogApi.home.test.tsx` (5): 48/48. Área `src/lib/catalog src/lib/metadata src/components src/features/shell src/features/catalog src/features/vod src/lib/i18n` → 1368 verdes e os 7 vermelhos esperados da Fase 5 (6 contratos emendados + `buildShowcaseRows` da 060); `npx tsc -b` limpo; lint sem erro novo.
- Pendências: nenhuma da fase. Desvios de design (ver Execution Notes): o backdrop do Top 10 sai por `images` e não por `DiscoveryPick.backdropUrl` (não mexe em `selectTop10`, sob contrato 057); `useContinueCards(sourceId)` devolve itens + progresso (no lugar de `useContinueProgress(sourceId, items)`), por precisar do episódio de cada estado.

---

## Phase 3: User Story 1 - Billboard que recolhe e fundo ambiente (Priority: P1) 🎯 MVP

**Objetivo**: o Início abre com o billboard em tela cheia, recolhe quando o foco desce, e o fundo acompanha o item focado — sem consulta nem reprodução por foco.

**Independent Test**: abrir o Início com e sem título para continuar, com e sem backdrop; descer/subir entre billboard, dock e fileiras; abrir um detalhe e voltar.

### Contrato da Fase

- `HomeContent — contrato da feature 060 › abre no billboard expandido…; ↓ recolhe…; ↑ volta…` — US1/AC1, AC3, AC5
- `HomeContent — contrato da feature 060 › andar pelos cards não reproduz nem faz requisição; o fundo ambiente…` — US1/AC4, FR-007, FR-022
- `HomeContent — contrato da feature 060 › voltando com o foco num card (por id)…` — US1/AC6, FR-020
- Comando: `npx vitest run src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx`

### Implementation

- [X] T014 [P] [US1] `tv-web/src/features/home/HomeAmbient.tsx`: camadas cor/imagem/vinheta, troca por opacidade, uma `<img>` por vez (`logic/billboard-e-navegacao.md` §6)
- [X] T015 [P] [US1] `tv-web/src/features/home/HomeBillboard.tsx`: eyebrow, título, meta, `DetailChips`, sinopse (3 linhas), ações com a primária de nome exato + `aria-describedby` para "faltam X" e barra via `primaryProgress`, Trailer por `trailerAction.ts`, boas-vindas com os atalhos; dock no canto (D-010, §2)
- [X] T016 [US1] `tv-web/src/features/home/HomeContent.tsx`: `data-state` do billboard, viewport `.home-rows` com a fileira focada no topo e `is-above`, primeira sincronização sem animação, linhas `dock → hero → fileiras` (D-017), `data-item-id` na raiz dos cards das fileiras atuais, alvo do fundo com atraso de 250 ms, `useTitleMetadata` do billboard tolerante a id inexistente (R-011), `TrailerLayer` no OK do Trailer → contratos: os 3 de `HomeContent — contrato da feature 060`
- [X] T017 [US1] `tv-web/src/features/home/HomeScreen.tsx`: passa `<HomeAmbient/>` ao `AppShell` (`backdrop`); `PlayerLayer` continua filho direto do `.screen` (FR-027)
- [X] T018 [P] [US1] Remover `home-trailer` de `tv-web/src/lib/comingSoon.ts` e de `tv-web/src/lib/i18n/messages/comingSoon.ts` (pt/en/es); atualizar `tv-web/src/lib/comingSoon.test.ts`
- [X] T019 [US1] `tv-web/src/styles/home.css`: billboard (tela cheia, legível sobre o fundo), modos `billboard`/`rows`, `is-above`, ambiente sob a topbar, dock no canto; reduced-motion

### Testes da Fase

- [X] T020 [P] [US1] `tv-web/src/features/home/HomeBillboard.test.tsx`: nome acessível exato com e sem progresso, `aria-describedby`, Trailer nos 3 estados, boas-vindas
- [X] T021 [US1] Atualizar `tv-web/src/features/home/HomeContent.test.tsx` e `HomeContent.top10-dica.test.tsx` (estrutura nova, dock acima do hero, sem skeletons) citando a 060; contrato 026 (`HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`) verde sem edição

**Critério de Conclusão**: `npx vitest run src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx` → 3/3 verdes; `check-contract-tests.ps1` íntegro para 060 e 026; testes da fase verdes; revisão visual no navegador dos cenários 1–7 do quickstart.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-05).
- Feito: T014 `HomeAmbient` (cor da capa → `<img>` → vinheta, uma imagem por vez); T015 `HomeBillboard` (nome acessível só o rótulo, "T1:E3 · faltam X" por `aria-describedby`, barra decorativa, ações soft-disabled); T016 `HomeContent` reescrito (linhas `dock → hero → fileiras` por `buildHomeRows`, billboard `expanded`/`collapsed`, fileira focada no topo com `is-above` nas anteriores, 1ª sincronização/restauração sem animar, fundo do card só após 250 ms parado, Trailer real, sem skeletons); T017 `HomeScreen` (fundo por portal na camada do `AppShell`); T018 `home-trailer` removido (registro, catálogo pt/en/es, `comingSoon.test.ts`); T019 `home.css` reescrito só com tokens; `HomeTitleCard` básico (raiz com `data-item-id`/`tv-focus`).
- Contrato: `npx vitest run src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx` → 3/3 verdes (+ `HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` da 026 1/1 verde, sem edição); `check-contract-tests.ps1` íntegro para 060, 026, 022, 035, 052, 053, 056, 057 e 059.
- Testes executados: `src/features/home` 66/66 verdes em 3 rodadas seguidas (sem instabilidade) — `HomeBillboard.test.tsx` (7, novo), `HomeContent.test.tsx` (+5 novos; 4 ajustados à ordem FR-018, ao dock acima do hero e a `.home-card`; o teste do dock "Em breve" passava por acidente e foi endurecido; `afterEach` passou a limpar `titleMetadata`), `HomeContent.top10-dica.test.tsx` (ordem e seletores novos; o teste de `scrollIntoView` virou o de recolher/`is-above`), `HomeScreen.test.tsx` (↑ do hero agora passa pelo dock). Suíte `src/features src/components src/lib src/navigation` → 2688 verdes e só os 7 vermelhos esperados da Fase 5; `tsc -b` limpo; lint com saída 0. E2E `top10-dica` adaptado (cards novos, ordem, espera da transição) → "Tudo certo", capturas `01-inicio` e `02-inicio-top10-focado` conferidas (billboard, dock no canto, fileira focada no topo, fundo esmaecido, numerais).
- Pendências: o E2E `top10-dica` foi adaptado aqui para poder conferir a tela; os demais roteiros afetados seguem na T038. Capturas com título em andamento/backdrop reais ficam para o `home-vitrine-expandida.mjs` (T037).

---

## Phase 4: User Story 2 - Cards maiores, selos e expansão no foco (Priority: P2)

**Objetivo**: pôsteres 250×375 com selos, Continuar 16:9 com progresso real, Top 10 com numeral e o card focado expandindo para 16:9.

**Independent Test**: percorrer cada fileira de títulos com itens com/sem backdrop, com/sem sinopse local, com/sem nota, assistidos, favoritos e recém-adicionados.

### Implementation

- [X] T022 [P] [US2] `tv-web/src/features/home/HomeTitleCard.tsx`: raiz com `data-item-id`/`tv-focus`, nome sobre a arte, selos (`cardBadges` + `sr-only`), barra de progresso opcional, camada expandida montada só no foco (com imagem 16:9, ou pôster + cor da capa), numeral do `rank` (`logic/cards-e-expansao.md` §3–§5)
- [X] T023 [US2] `tv-web/src/features/home/HomeContent.tsx`: todas as fileiras de títulos com `HomeTitleCard`, medidas de `homeRowFormats.ts`, `Rail` com `focusedItemWidth` e `align: 'start'`; leituras únicas de assistidos/favoritos/série em dia; imagens por `useHomeImages`
- [X] T024 [US2] Continuar assistindo 16:9 com `useContinueProgress` (barra só com posição e duração; legenda `T1:E3 · faltam X`) em `tv-web/src/features/home/HomeContent.tsx`
- [X] T025 [US2] `tv-web/src/styles/home.css`: cards, selos, expandido (largura/altura por variável), numeral; transição por `--home-expand-duration` (FR-028)

### Testes da Fase

- [X] T026 [P] [US2] `tv-web/src/features/home/HomeTitleCard.test.tsx`: selos aplicáveis, expandido com e sem imagem, sinopse ausente = linha ausente, nome acessível
- [X] T027 [US2] Teste em `HomeContent.test.tsx`: → no último card não sai da fileira; só um card expandido; barra do Continuar só com duração conhecida (SC-003)

**Critério de Conclusão**: contratos da 060 (3 da Home + 1 da semente) seguem verdes; contrato 022 verde; testes da fase verdes; `tsc` limpo; revisão visual do cenário 8–9 do quickstart.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-05).
- Feito: T022 `HomeTitleCard` completo (selos NOVO/★/✓/♥ com texto `sr-only`, barra e legenda do Continuar, camada expandida montada só no foco com imagem 16:9 ou pôster + cor da capa, numeral do Top 10 fora do card focável) + `useCachedTitleView` (metadata só do cache local) e `useDeferred`; T023 fileiras com `focusedItemWidth` e `align="start"` (só quando o conteúdo está ativo e a entrada é um título), selos por leituras únicas (`useWatchedIds`/`useFavoriteIds`/`useSeriesWatchedSummary` adiada); T024 Continuar 16:9 com `useContinueCards` (barra só com posição e duração reais, legenda `T1:E3 · faltam X`); T025 CSS dos selos, do card expandido (sem animar a largura = fallback FR-028 já embutido) e do Continuar.
- Contrato: contratos da 060 seguem 4/5 verdes (3 da Home + semente; o 5º é da Fase 5); `check-contract-tests.ps1` íntegro para 060, 026, 022, 035, 052, 053, 056, 057 e 059.
- Testes executados: `src/features/home` 80/80 verdes em 2 rodadas seguidas — `HomeTitleCard.test.tsx` (11, novo) e +3 em `HomeContent.test.tsx` (fim da fileira sem sair dela e só um card expandido, selos lidos do aparelho sem `fetch`, barra/legenda só com duração conhecida). Suíte `src/features src/components src/lib src/navigation`: só os 7 vermelhos esperados da Fase 5; `tsc -b` limpo (corrigi tipagem de dois `querySelector` nos meus testes); lint com saída 0. E2E `top10-dica` verde com as capturas conferidas (card expandido com pôster + informações, selo de nota, numerais).
- Pendências: capas em branco nas capturas do E2E são limitação da fixture (não do código). O ✓ de série usa "série em dia" (A-004) e só aparece depois de `HOME_DEFERRED_MS` (leitura de todos os episódios do aparelho adiada).

---

## Phase 5: User Story 3 - Fileiras novas, Ao vivo agora e "Porque você assistiu" (Priority: P3)

**Objetivo**: Filmes/Séries adicionados, "Ao vivo agora" com EPG e "Porque você assistiu X" no Início e em Filmes/Séries, na ordem de FR-018.

**Independent Test**: com e sem chave TMDB, com e sem título concluído, com e sem canais favoritos e EPG, com categorias obtidas e não obtidas.

### Contrato da Fase

- `buildShowcaseRows — contrato da feature 060 › com semente, "Porque você assistiu <título>"…` — FR-014–FR-016, SC-008
- Contratos **emendados** (D-012) que esta fase deixa verdes sem editar: `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts`, `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx`, `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx`, `vodShowcase.bem-avaliados.contract.test.ts`, `VodShowcaseScreen.bem-avaliados.contract.test.tsx`, `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`
- Comando: `npx vitest run src/features/vod/vodShowcaseRows.home-vitrine-expandida.contract.test.ts src/features/vod/vodShowcaseRows.carrosseis-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx src/features/vod/vodShowcase.bem-avaliados.contract.test.ts src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`

### Implementation

- [X] T028 [P] [US3] `tv-web/src/features/catalog/becauseApi.ts` (NOVO): `useBecauseYouWatched(sourceId, kind)` — `logic/fileiras-e-dados.md` §2; sem TMDB conectado, zero leitura de rede e `data = null` (D-011)
- [X] T029 [P] [US3] `buildShowcaseRows` lendo `hasBecause`/`becauseTitle` em `tv-web/src/features/vod/vodShowcaseRows.ts` (fileira `items` no lugar do slot; sem, nada) → contrato: `buildShowcaseRows — contrato da feature 060`
- [X] T030 [US3] `tv-web/src/features/vod/VodShowcaseScreen.tsx`: liga `useBecauseYouWatched(sourceId, copy.kind)`, `entriesOf('because')`, eyebrow do hero, imagens → contratos emendados 052/053/056/057
- [X] T031 [P] [US3] Remover `vod-because` de `tv-web/src/lib/comingSoon.ts` e do catálogo `comingSoon.ts` (pt/en/es) → contrato: `buildShowcaseRows — contrato da feature 060` (mocks removidos)
- [X] T032 [P] [US3] `tv-web/src/features/home/HomeLiveCard.tsx` + fileira "Ao vivo agora" (substitui "Canais favoritos", chave `channels`) com EPG e "Todos os canais" (`logic/fileiras-e-dados.md` §4)
- [X] T033 [US3] `tv-web/src/features/home/HomeContent.tsx`: fileiras `added-movies`/`added-series` (carga adiada, cobertura no cabeçalho), `because` (Início: `kind = 'any'`), ordem por `buildHomeRows` (D-014); `RowKey`/`rowExists` deixam de ser stub

### Testes da Fase

- [X] T034 [P] [US3] `tv-web/src/features/catalog/becauseApi.test.tsx`: sem chave → nenhum `fetch` e `null`; semente sem semelhantes na lista → `null`; com semelhantes → itens locais na ordem do TMDB, sem o próprio seed
- [X] T035 [P] [US3] `tv-web/src/features/home/HomeLiveCard.test.tsx` (com/sem EPG) e teste da ordem de fileiras no `HomeContent.test.tsx`
- [X] T036 [US3] Atualizar testes não travados que conheciam o slot: `tv-web/src/features/vod/vodShowcaseRows.discovery.test.ts`, `VodShowcaseScreen.carrosseis.test.tsx`, `VodShowcaseScreen.discovery.test.tsx`, `VodShowcaseScreen.test.tsx`, `VodShowcaseScreen.bem-avaliados.test.tsx` — citando a 060

**Critério de Conclusão**: o comando do Contrato da Fase → 7 arquivos verdes (1 da 060 + 6 emendados, 13 testes); `check-contract-tests.ps1` íntegro para 060, 052, 053, 056, 057; contratos da 060 das fases anteriores seguem verdes; testes da fase verdes; revisão dos cenários 10–11 do quickstart.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-05).
- Feito: T028 `becauseApi.ts` (`useBecauseYouWatched`; sem TMDB conectado só lê o estado da chave — nenhuma leitura de rede nem de semente); T029–T031 fileira `because` real em Filmes/Séries (sem slot, sem mocks `vod-because`/`home-trailer`); T032 `HomeLiveCard` + fileira "Ao vivo agora" (chave `channels`, número só quando derivável, programa e barra só com EPG, sem "A seguir"); T033 `HomeContent` com `added-movies`/`added-series` (carga adiada, cobertura no cabeçalho), `because` (`kind = 'any'`, fonte TMDB no cabeçalho) e um mapa único `titleRows` para seleção, direção, fundo e imagens; ordem por `buildHomeRows` (FR-018).
- Contrato: `npx vitest run` nos 7 arquivos do Contrato da Fase → 7/7 arquivos, 14/14 testes verdes (1 da 060 + 6 emendados); contrato 060 5/5 verde; `check-contract-tests.ps1` trava íntegra para 060, 026, 022, 035, 052, 053, 056, 057 e 059.
- Testes executados: `npx tsc -b` limpo; `npx oxlint src` sem erros (só warnings pré-existentes); `npx vitest run src/features src/components src/lib src/navigation` → 433 arquivos / 2717 testes verdes. Novos: `becauseApi.test.tsx` (4: sem chave → nenhum `fetch`; sem concluído → `null`; sem semelhante na lista → `null`; com semelhantes → ordem do TMDB sem o seed), `HomeLiveCard.test.tsx` (3), teste da ordem das fileiras no `HomeContent.test.tsx`; 3 testes de EPG da Home migrados de `.channel-row*` para `.home-live-*`. Um teste novo falhou de primeira por erro meu (`not.toBeNull()` aceita `undefined` = carregando) — corrigido para `toBeTruthy()`.
- Pendências: T036 não exigiu edição nova (os testes não travados já tinham sido atualizados na Fase 4/5 parcial; nenhum cita mais o slot). Comentários antigos "Canais favoritos" em `HomeContent.tsx`/`HomeScreen.tsx`/`LiveScreen.tsx` são só documentação de código. Cenários 10–11 do quickstart e as capturas das fileiras novas ficam para o E2E novo (T037) e a passada na TV (T043).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, suíte completa, TV física e documentação.

- [X] T037 [P] `tv-web/e2e/home-vitrine-expandida.mjs` (NOVO, com capturas em `test-results/home-vitrine-expandida/`): billboard, recolher, fundo sem requisição de API ao andar (seta segurada), voltar do detalhe, expansão, fileiras novas, Filmes com "Porque você assistiu"; adicionar à `SUITE` de `tv-web/e2e/run.mjs`; medir SC-007
- [X] T038 Ajustar E2E existentes afetados (R-004): `home-busca-configuracoes.mjs`, `top10-dica.mjs`, `carrosseis-filmes-series.mjs`, `vitrine-filmes-series.mjs`, `bem-avaliados.mjs`, `epg-dados-agora.mjs`, `shell-visual.mjs`/`paridade-visual.mjs` (prop do `AppShell`)
- [X] T039 Suíte completa: `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run build:tizen` (nenhum arquivo emitido novo fora de `tizen_web_project.yaml`)
- [X] T040 Revisão de segredos: nenhuma URL de imagem/capa/fundo em `console.*`, erro ou tela; `tmdbImageUrl` sem chave (constitution, FR-026)
- [X] T041 `npm run test:e2e` completo com `npm run dev` (gate antes da TV)
- [ ] T042 Executar `quickstart.md` (cenários 1–13 no navegador)
- [ ] T043 **Gate D-015**: passada na TV física com o skill `tizen-tv` (cenários da seção "TV física — gate" do quickstart); decidir FR-028 (`--home-expand-duration`) pela medição; registrar em Riscos e Decisões
- [ ] T044 Docs: Spec V14, seção "Home" (ordem de FR-018 com Dica e as duas fileiras de adicionados; R-003 se o usuário mudar a cor), protótipo `home()` se a ordem divergir; backlog (`update-feature-status.ps1 -Status Implementada`); `plan.md` (Estado Atual)

**Registro da Fase** (parcial — faltam T042, T043 e o fechamento de T044):

- Status: Em andamento (2026-10-05) — T037–T041 concluídas; T042 parcial; T043 (TV física) é o gate que falta.
- Feito: T037 `e2e/home-vitrine-expandida.mjs` (novo, na `SUITE`; painel Xtream e TMDB simulados) mede billboard expandido + dock, 1 ↓ → 1ª fileira com billboard recolhido (SC-005), ordem das fileiras, card expandido 667 × 375 e um só por vez, fundo ambiente, seta segurada sem nenhuma consulta ao painel/TMDB, voltar do detalhe no mesmo card, ↑ → billboard → dock → topbar, ação primária focável (SC-007: 28 ms no navegador de teste — a meta de 1 s é da TV), Filmes sem "Porque você assistiu" nem slot, sem credencial/chave no DOM nem no console; T038 E2E ajustados (`e2e.mjs`, `home-busca-configuracoes`, `historico-continuar-assistindo`, `limpar-historico`, `catalogo-em-blocos`, `carrosseis-filmes-series`: seletores `.home-card-title`/`.home-live-*`, ordem das fileiras, ↑ passa pelo dock, o slot "Em breve" deu lugar à checagem de que não existe); T040 revisão de segredos (nenhum `console.*`/`throw` novo, nenhuma URL de imagem interpolada em erro; confirmado também pelo E2E).
- Contrato: contrato 060 5/5 e `check-contract-tests.ps1` íntegro para 060, 026, 022, 035, 052, 053, 056, 057 e 059 (rodado na Fase 5; nenhum arquivo travado foi tocado depois).
- Testes executados: `npx tsc -b` limpo; `npm run lint` exit 0; `npx vitest run` → 443 arquivos / 2826 testes verdes; `npm run build` e `npm run build:tizen` exit 0 (o guard de `sync-tizen` não achou arquivo novo fora de `tizen_web_project.yaml`); `node e2e/run.mjs` → 40/40 scripts em 291 s (1ª rodada: 34/39 — as 5 falhas eram E2E antigos que conheciam o layout anterior, corrigidos e relidos verdes; nenhuma foi flake).
- Pendências: **T043 (TV física, gate D-015)** exige a TV e a avaliação humana de fluidez/legibilidade — decidir FR-028 (`--home-expand-duration`) pela medição; **T042**: os cenários 3, 4, 5, 7, 8, 9, 11 e 12 estão cobertos por E2E/unit; 1, 2, 6, 10 e 13 com dado real (título em andamento com backdrop, trailer, "Porque você assistiu" positivo, "Ao vivo agora" com EPG, en/es) ficam para a passada com a lista real; **T037**: o "Porque você assistiu" positivo (metadata TMDB casada + concluído) é coberto por `becauseApi.test.tsx`/contratos, não pelo E2E; **T044**: Spec V14 atualizada; faltam o status `Implementada` no backlog (só depois da TV) e a decisão de A-001/R-003 (cor da capa ao focar).

### Checklist de Release

- [X] Fase 2 (Fundação) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 060, 026, 022, 035, 052, 053, 056, 057, 059
- [X] `npm run test:e2e` verde (gate da constitution antes da TV)
- [ ] Frontend validado no navegador (`quickstart.md` cenários 1–13)
- [X] Revisão de segredos (T040)
- [ ] Passada na TV física aprovada (T043, gate D-015) — ou decisão explícita do usuário com risco registrado

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende da Fase 2 (AppShell `backdrop`, `buildHomeRows`, `useHomeImages`)
- **US2 (Phase 4)**: depende da Fase 3 (estrutura de fileiras e `data-item-id`) e do `Rail` (T007)
- **US3 (Phase 5)**: depende da Fase 2 (semente, backdrop das respostas) e da Fase 4 (cards); a parte de Filmes/Séries (T028–T031, T036) pode andar em paralelo com a Fase 4
- **Polish (Phase 6)**: depende de todas as stories

### Parallel Opportunities

- Fase 2: T004–T009 são arquivos diferentes.
- Fase 3: T014, T015 e T018 em paralelo; T016 depois deles.
- Fase 5: T028, T029, T031 e T032 em paralelo.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fases 1 e 2
2. Fase 3 (billboard + fundo) — **parar e validar** no navegador (cenários 1–7)

### Incremental Delivery

1. Setup + Fundação
2. US1 → billboard/fundo (MVP)
3. US2 → cards e expansão
4. US3 → fileiras novas + Filmes/Séries (contratos emendados ficam verdes aqui)
5. Polish → E2E, TV física (gate), docs

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Contratos travados (060 e os emendados de 052/053/056/057) **nunca** são editados no execute
- Um `useRemoteNav` por componente (regra da 040): os componentes novos não têm teclado
- Commitar após cada task ou grupo lógico coerente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
