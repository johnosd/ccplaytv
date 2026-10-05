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

- [ ] T001 [P] Chaves novas em pt/en/es: `tv-web/src/lib/i18n/messages/home.ts` (fileiras "Ao vivo agora", "Filmes adicionados", "Séries adicionadas"; "AO VIVO"; "Todos os canais"; "faltam {time}"; selos `sr-only` "Novo"/"Assistido"/"Na Minha Lista"; "OK Detalhes"; rótulo do dock no billboard se mudar) e `tv-web/src/lib/i18n/messages/vodShowcase.ts` (`showcase.row.becauseOf` = "Porque você assistiu {title}", `showcase.eyebrow.because`). Conferir `areas.test.ts`.
- [ ] T002 [P] `tv-web/src/features/home/homeRowFormats.ts`: medidas de `logic/cards-e-expansao.md` §1 (fonte única, padrão de `features/vod/vodRowFormats.ts`).
- [ ] T003 [P] `tv-web/src/styles/home.css`: abrir o bloco "Home Vitrine expandida (feature 060)" e o token `--home-expand-duration` (padrão `var(--duration-standard)`) — só tokens V14, medidas por `var(--home-card-*)`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: regras puras, props opcionais e dados locais que as três stories usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `pickBecauseSeed — contrato da feature 060 › escolhe o concluído mais recente…` — FR-014, US3/AC2–AC3
- Comando: `npx vitest run src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts`

### Implementation

- [ ] T004 [P] `pickBecauseSeed` em `tv-web/src/lib/catalog/becauseSeed.ts` (stub existe) — regra de `logic/fileiras-e-dados.md` §2 passo 4 → contrato: `pickBecauseSeed — contrato da feature 060`
- [ ] T005 [P] `buildHomeRows` em `tv-web/src/features/home/homeRows.ts` — ordem/existência de `logic/billboard-e-navegacao.md` §3 (D-014)
- [ ] T006 [P] `cardBadges` em `tv-web/src/features/home/cardBadges.ts` — `logic/cards-e-expansao.md` §4
- [ ] T007 [P] `Rail` (`tv-web/src/components/Rail.tsx`): props opcionais `focusedItemWidth` e `align` (D-008, `logic/cards-e-expansao.md` §2); sem elas, comportamento idêntico
- [ ] T008 [P] `AppShell` (`tv-web/src/features/shell/AppShell.tsx` + `tv-web/src/styles/shell.css`): prop opcional `backdrop` como 1º filho de `.app-shell`, absoluto, atrás da topbar (D-004)
- [ ] T009 [P] Guardar backdrop que já chega (FR-021, `logic/fileiras-e-dados.md` §5): `TmdbTitleRef.backdropUrl?` (`tv-web/src/lib/catalog/db.ts`), `mapSimilar` (`tv-web/src/lib/metadata/tmdbMapping.ts`), `DiscoveryTitle.backdropUrl?` + `mapItem` (`tv-web/src/lib/metadata/tmdbDiscovery.ts`), `DiscoveryPick.backdropUrl?` em `projectTop10` e as imagens da Dica em `projectTip` (`tv-web/src/features/catalog/catalogApi.ts`). Sem bump do Dexie.
- [ ] T010 Hooks locais em `tv-web/src/features/catalog/catalogApi.ts`: `useHomeImages(items, extra)` (D-006, `logic/fileiras-e-dados.md` §1), `useContinueProgress(sourceId, items)` (`logic/cards-e-expansao.md` §6), `useRecentlyAdded` devolvendo `coveredCategories`/`totalCategories` (mesmo `select`, sem custo extra)

### Testes da Fase

- [ ] T011 [P] `tv-web/src/features/home/homeRows.test.ts` e `tv-web/src/features/home/cardBadges.test.ts` (NOVO no limite de 7 dias, relógio adiantado, nota 0/null)
- [ ] T012 [P] `tv-web/src/components/Rail.home-vitrine-expandida.test.tsx`: largura do focado, `align: 'start'`, sem props = igual a hoje; rodar também `Rail.biblioteca-componentes.contract.test.tsx` (022)
- [ ] T013 [P] `AppShell` com e sem `backdrop` (DOM idêntico sem a prop); testes de `tmdbMapping`/`tmdbDiscovery` para o backdrop (URL sem chave) e de `useHomeImages`/`useContinueProgress` (prioridade das fontes; sem duração → sem progresso)

**Critério de Conclusão**: `npx vitest run src/lib/catalog/becauseSeed.home-vitrine-expandida.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1 -Slug 060-home-vitrine-expandida` íntegro; contratos 022, 035 e 057 (`tmdbDiscovery`, `discoveryRules`) verdes sem edição; testes da fase verdes; `npx tsc -b` limpo. Nenhuma tela mudou visualmente ainda.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

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

- [ ] T014 [P] [US1] `tv-web/src/features/home/HomeAmbient.tsx`: camadas cor/imagem/vinheta, troca por opacidade, uma `<img>` por vez (`logic/billboard-e-navegacao.md` §6)
- [ ] T015 [P] [US1] `tv-web/src/features/home/HomeBillboard.tsx`: eyebrow, título, meta, `DetailChips`, sinopse (3 linhas), ações com a primária de nome exato + `aria-describedby` para "faltam X" e barra via `primaryProgress`, Trailer por `trailerAction.ts`, boas-vindas com os atalhos; dock no canto (D-010, §2)
- [ ] T016 [US1] `tv-web/src/features/home/HomeContent.tsx`: `data-state` do billboard, viewport `.home-rows` com a fileira focada no topo e `is-above`, primeira sincronização sem animação, linhas `dock → hero → fileiras` (D-017), `data-item-id` na raiz dos cards das fileiras atuais, alvo do fundo com atraso de 250 ms, `useTitleMetadata` do billboard tolerante a id inexistente (R-011), `TrailerLayer` no OK do Trailer → contratos: os 3 de `HomeContent — contrato da feature 060`
- [ ] T017 [US1] `tv-web/src/features/home/HomeScreen.tsx`: passa `<HomeAmbient/>` ao `AppShell` (`backdrop`); `PlayerLayer` continua filho direto do `.screen` (FR-027)
- [ ] T018 [P] [US1] Remover `home-trailer` de `tv-web/src/lib/comingSoon.ts` e de `tv-web/src/lib/i18n/messages/comingSoon.ts` (pt/en/es); atualizar `tv-web/src/lib/comingSoon.test.ts`
- [ ] T019 [US1] `tv-web/src/styles/home.css`: billboard (tela cheia, legível sobre o fundo), modos `billboard`/`rows`, `is-above`, ambiente sob a topbar, dock no canto; reduced-motion

### Testes da Fase

- [ ] T020 [P] [US1] `tv-web/src/features/home/HomeBillboard.test.tsx`: nome acessível exato com e sem progresso, `aria-describedby`, Trailer nos 3 estados, boas-vindas
- [ ] T021 [US1] Atualizar `tv-web/src/features/home/HomeContent.test.tsx` e `HomeContent.top10-dica.test.tsx` (estrutura nova, dock acima do hero, sem skeletons) citando a 060; contrato 026 (`HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`) verde sem edição

**Critério de Conclusão**: `npx vitest run src/features/home/HomeContent.home-vitrine-expandida.contract.test.tsx` → 3/3 verdes; `check-contract-tests.ps1` íntegro para 060 e 026; testes da fase verdes; revisão visual no navegador dos cenários 1–7 do quickstart.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 - Cards maiores, selos e expansão no foco (Priority: P2)

**Objetivo**: pôsteres 250×375 com selos, Continuar 16:9 com progresso real, Top 10 com numeral e o card focado expandindo para 16:9.

**Independent Test**: percorrer cada fileira de títulos com itens com/sem backdrop, com/sem sinopse local, com/sem nota, assistidos, favoritos e recém-adicionados.

### Implementation

- [ ] T022 [P] [US2] `tv-web/src/features/home/HomeTitleCard.tsx`: raiz com `data-item-id`/`tv-focus`, nome sobre a arte, selos (`cardBadges` + `sr-only`), barra de progresso opcional, camada expandida montada só no foco (com imagem 16:9, ou pôster + cor da capa), numeral do `rank` (`logic/cards-e-expansao.md` §3–§5)
- [ ] T023 [US2] `tv-web/src/features/home/HomeContent.tsx`: todas as fileiras de títulos com `HomeTitleCard`, medidas de `homeRowFormats.ts`, `Rail` com `focusedItemWidth` e `align: 'start'`; leituras únicas de assistidos/favoritos/série em dia; imagens por `useHomeImages`
- [ ] T024 [US2] Continuar assistindo 16:9 com `useContinueProgress` (barra só com posição e duração; legenda `T1:E3 · faltam X`) em `tv-web/src/features/home/HomeContent.tsx`
- [ ] T025 [US2] `tv-web/src/styles/home.css`: cards, selos, expandido (largura/altura por variável), numeral; transição por `--home-expand-duration` (FR-028)

### Testes da Fase

- [ ] T026 [P] [US2] `tv-web/src/features/home/HomeTitleCard.test.tsx`: selos aplicáveis, expandido com e sem imagem, sinopse ausente = linha ausente, nome acessível
- [ ] T027 [US2] Teste em `HomeContent.test.tsx`: → no último card não sai da fileira; só um card expandido; barra do Continuar só com duração conhecida (SC-003)

**Critério de Conclusão**: contratos da 060 (3 da Home + 1 da semente) seguem verdes; contrato 022 verde; testes da fase verdes; `tsc` limpo; revisão visual do cenário 8–9 do quickstart.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - Fileiras novas, Ao vivo agora e "Porque você assistiu" (Priority: P3)

**Objetivo**: Filmes/Séries adicionados, "Ao vivo agora" com EPG e "Porque você assistiu X" no Início e em Filmes/Séries, na ordem de FR-018.

**Independent Test**: com e sem chave TMDB, com e sem título concluído, com e sem canais favoritos e EPG, com categorias obtidas e não obtidas.

### Contrato da Fase

- `buildShowcaseRows — contrato da feature 060 › com semente, "Porque você assistiu <título>"…` — FR-014–FR-016, SC-008
- Contratos **emendados** (D-012) que esta fase deixa verdes sem editar: `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts`, `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx`, `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx`, `vodShowcase.bem-avaliados.contract.test.ts`, `VodShowcaseScreen.bem-avaliados.contract.test.tsx`, `VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`
- Comando: `npx vitest run src/features/vod/vodShowcaseRows.home-vitrine-expandida.contract.test.ts src/features/vod/vodShowcaseRows.carrosseis-filmes-series.contract.test.ts src/features/vod/VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx src/features/vod/vodShowcase.bem-avaliados.contract.test.ts src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx src/features/vod/VodShowcaseScreen.top10-dica-tmdb.contract.test.tsx`

### Implementation

- [ ] T028 [P] [US3] `tv-web/src/features/catalog/becauseApi.ts` (NOVO): `useBecauseYouWatched(sourceId, kind)` — `logic/fileiras-e-dados.md` §2; sem TMDB conectado, zero leitura de rede e `data = null` (D-011)
- [ ] T029 [P] [US3] `buildShowcaseRows` lendo `hasBecause`/`becauseTitle` em `tv-web/src/features/vod/vodShowcaseRows.ts` (fileira `items` no lugar do slot; sem, nada) → contrato: `buildShowcaseRows — contrato da feature 060`
- [ ] T030 [US3] `tv-web/src/features/vod/VodShowcaseScreen.tsx`: liga `useBecauseYouWatched(sourceId, copy.kind)`, `entriesOf('because')`, eyebrow do hero, imagens → contratos emendados 052/053/056/057
- [ ] T031 [P] [US3] Remover `vod-because` de `tv-web/src/lib/comingSoon.ts` e do catálogo `comingSoon.ts` (pt/en/es) → contrato: `buildShowcaseRows — contrato da feature 060` (mocks removidos)
- [ ] T032 [P] [US3] `tv-web/src/features/home/HomeLiveCard.tsx` + fileira "Ao vivo agora" (substitui "Canais favoritos", chave `channels`) com EPG e "Todos os canais" (`logic/fileiras-e-dados.md` §4)
- [ ] T033 [US3] `tv-web/src/features/home/HomeContent.tsx`: fileiras `added-movies`/`added-series` (carga adiada, cobertura no cabeçalho), `because` (Início: `kind = 'any'`), ordem por `buildHomeRows` (D-014); `RowKey`/`rowExists` deixam de ser stub

### Testes da Fase

- [ ] T034 [P] [US3] `tv-web/src/features/catalog/becauseApi.test.tsx`: sem chave → nenhum `fetch` e `null`; semente sem semelhantes na lista → `null`; com semelhantes → itens locais na ordem do TMDB, sem o próprio seed
- [ ] T035 [P] [US3] `tv-web/src/features/home/HomeLiveCard.test.tsx` (com/sem EPG) e teste da ordem de fileiras no `HomeContent.test.tsx`
- [ ] T036 [US3] Atualizar testes não travados que conheciam o slot: `tv-web/src/features/vod/vodShowcaseRows.discovery.test.ts`, `VodShowcaseScreen.carrosseis.test.tsx`, `VodShowcaseScreen.discovery.test.tsx`, `VodShowcaseScreen.test.tsx`, `VodShowcaseScreen.bem-avaliados.test.tsx` — citando a 060

**Critério de Conclusão**: o comando do Contrato da Fase → 7 arquivos verdes (1 da 060 + 6 emendados, 13 testes); `check-contract-tests.ps1` íntegro para 060, 052, 053, 056, 057; contratos da 060 das fases anteriores seguem verdes; testes da fase verdes; revisão dos cenários 10–11 do quickstart.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, suíte completa, TV física e documentação.

- [ ] T037 [P] `tv-web/e2e/home-vitrine-expandida.mjs` (NOVO, com capturas em `test-results/home-vitrine-expandida/`): billboard, recolher, fundo sem requisição de API ao andar (seta segurada), voltar do detalhe, expansão, fileiras novas, Filmes com "Porque você assistiu"; adicionar à `SUITE` de `tv-web/e2e/run.mjs`; medir SC-007
- [ ] T038 Ajustar E2E existentes afetados (R-004): `home-busca-configuracoes.mjs`, `top10-dica.mjs`, `carrosseis-filmes-series.mjs`, `vitrine-filmes-series.mjs`, `bem-avaliados.mjs`, `epg-dados-agora.mjs`, `shell-visual.mjs`/`paridade-visual.mjs` (prop do `AppShell`)
- [ ] T039 Suíte completa: `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run build:tizen` (nenhum arquivo emitido novo fora de `tizen_web_project.yaml`)
- [ ] T040 Revisão de segredos: nenhuma URL de imagem/capa/fundo em `console.*`, erro ou tela; `tmdbImageUrl` sem chave (constitution, FR-026)
- [ ] T041 `npm run test:e2e` completo com `npm run dev` (gate antes da TV)
- [ ] T042 Executar `quickstart.md` (cenários 1–13 no navegador)
- [ ] T043 **Gate D-015**: passada na TV física com o skill `tizen-tv` (cenários da seção "TV física — gate" do quickstart); decidir FR-028 (`--home-expand-duration`) pela medição; registrar em Riscos e Decisões
- [ ] T044 Docs: Spec V14, seção "Home" (ordem de FR-018 com Dica e as duas fileiras de adicionados; R-003 se o usuário mudar a cor), protótipo `home()` se a ordem divergir; backlog (`update-feature-status.ps1 -Status Implementada`); `plan.md` (Estado Atual)

### Checklist de Release

- [ ] Fase 2 (Fundação) concluída
- [ ] Fase 3 (US1) concluída
- [ ] Fase 4 (US2) concluída
- [ ] Fase 5 (US3) concluída
- [ ] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 060, 026, 022, 035, 052, 053, 056, 057, 059
- [ ] `npm run test:e2e` verde (gate da constitution antes da TV)
- [ ] Frontend validado no navegador (`quickstart.md` cenários 1–13)
- [ ] Revisão de segredos (T040)
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
