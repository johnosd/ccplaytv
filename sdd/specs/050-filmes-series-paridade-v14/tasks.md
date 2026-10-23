---
description: "Tasks da feature 050 — paridade visual de Filmes e Séries com o Design System V14"
---

# Tasks: Paridade visual de Filmes e Séries com o Design System V14

**Input**: `sdd/specs/050-filmes-series-paridade-v14/` (spec.md, plan.md, quickstart.md)

**Prerequisites**: plan.md, spec.md. Sem `research.md`/`data-model.md`/`contracts/`/`logic/` (nenhuma incerteza técnica, nenhum dado novo, nenhuma API; as regras do "como" estão nas Decisões D-001..D-012 do plan).

**Organization**: por user story. US1 e US2 (P1) são independentes; US3 (P3) só mexe no modal de Ordenar e na toolbar já tocada pela US2 (fazer depois dela).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Código em `tv-web/src/` (Vite/React/TS). Comandos a partir de `tv-web/`; scripts de trava rodam da raiz do repositório.
- Filmes/Séries: `tv-web/src/features/vod/VodCatalogScreen.tsx` (uma tela, duas seções). CSS: `tv-web/src/styles/vod.css`.
- E2E: `tv-web/e2e/` (Playwright, `npm run dev` rodando; roteiro novo registrado em `e2e/run.mjs`).

## Phase 1: Setup

**Purpose**: baseline antes de mexer.

- [X] T001 Rodar `npx tsc -b` e `npx vitest run src/features/vod src/features/movies src/features/series src/components src/lib/focus` e registrar no `plan.md` (Execution Notes) o resultado base — só os 2 contratos desta feature devem falhar. Rodar `check-contract-tests.ps1` para 018, 025, 046, 048, 049 e 050 (todas íntegras). Conferir por busca que nenhum teste/E2E fixa o texto `Ordenar ·` e listar os que fixam `.vod-hero-eyebrow`/`.vod-hero-poster`.
- [X] T002 (adiada para a T019, ver Registro da Fase 1) Capturar 1920×1080 **antes** (Filmes e Séries com categoria aberta, ★ Favoritos, Live, Configurações, detalhe de filme) com `npm run dev` + Playwright, para o comparativo de SC-004 (guardar em `$CLAUDE_JOB_DIR`-like temporário ou `tv-web/e2e/.tmp`, fora do git).

**Checkpoint**: baseline registrado.

**Registro da Fase**:

- Status: Concluída (T002 adiada)
- Feito: baseline — `tsc -b` limpo; 94 arquivos/642 testes da área, só os 2 contratos 050 falham; travas 018/025/046/048/049/050 íntegras; Vite na 5173 (PID 32200). Buscas: `Ordenar · ` é fixado por `VodCatalogScreen.test.tsx` (linhas 684 e 784) → texto preservado com separador oculto por CSS (T009); `.vod-hero-title` é usado por `e2e/navegacao-por-pagina.mjs` (mantido); `.vod-hero-poster`/`.vod-hero-eyebrow` só em `vod.css` e `VodCatalogScreen.tsx`.
- Contrato: 0/2 verdes (esperado, vermelho por asserção); trava íntegra.
- Testes executados: `npx tsc -b`; `npx vitest run src/features/vod src/features/movies src/features/series src/components src/lib/focus`.
- Pendências: T002 (capturas ANTES) não feita — exigiria montar a fixture dos E2E só para isso; SC-004 será verificado na T019 por escopo de CSS (nada fora de `.vod-screen` muda) + capturas DEPOIS e, se necessário, build do HEAD em worktree.

---

## Phase 2: User Story 1 - Hero band e grade no visual do protótipo (Priority: P1) 🎯 MVP

**Objetivo**: a hero vira o painel com capa ao fundo, rótulo, título grande e metadados reais.

**Independent Test**: o contrato abaixo verde; captura com card com capa e outro sem.

### Contrato da Fase

- `hero: rótulo CCPLAY CINEMA, título do card focado, capa real só quando existe, sem nada focável` — US1/AC1+AC2+AC4, FR-001..FR-004
- Comando: `npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx -t "hero"`

### Implementation

- [X] T003 [US1] Criar `tv-web/src/features/vod/VodHeroArt.tsx` (D-005): `.vod-hero-art` sempre no DOM, `aria-hidden`, `<img src alt="" decoding="async">` só com `url` utilizável e sem falha; `onError` guarda a URL falha e não repete — copiar o padrão de `tv-web/src/features/live/LiveHeroArt.tsx`. → contrato: `hero: …`
- [X] T004 [US1] Em `tv-web/src/features/vod/VodCatalogScreen.tsx`, trocar o miolo de `.vod-hero-band` (hoje `.vod-hero-poster` + `PosterArt` de 80px): `<VodHeroArt url={heroItem.icon_url ?? undefined} />` + bloco de texto; `.vod-hero-eyebrow` com `CCPLAY CINEMA`/`CCPLAY SÉRIES` (por `section`), `★ SEUS FAVORITOS`, `↺ VISTOS RECENTEMENTE` (D-004); título e metadados **inalterados** (mesma lógica de Assistido/Continuar de/Em dia). Manter `aria-hidden="true"` e nenhum elemento focável. → contrato: `hero: …`
- [X] T005 [US1] Em `tv-web/src/styles/vod.css`, reescrever o bloco "Hero band": painel `--bg-surface`, borda `--bg-elevated`, `--radius-lg`, `min-height` 176px (D-011), `position: relative; overflow: hidden`; `.vod-hero-art` absoluta com `<img>` à direita (~45%, `object-fit: cover`, opacidade baixa) e degradê `90deg` da superfície para transparente; texto à frente (`position: relative`), título em `--fs-h1`/700 com até 2 linhas (`-webkit-line-clamp`), rótulo `--fs-caption` 700 `--accent`, metadados `--fs-body`. Apagar `.vod-hero-poster*`. Só tokens (FR-014), sem `filter: blur`.

### Testes da Fase

- [X] T006 [P] [US1] Teste não travado `tv-web/src/features/series/SeriesScreen.hero.test.tsx` (ou bloco novo no `SeriesScreen.test.tsx`): rótulo `CCPLAY SÉRIES`; entrada ★ Favoritos com item → `★ SEUS FAVORITOS`; ↺ Histórico → `↺ VISTOS RECENTEMENTE`; metadados reais mantidos ("Em dia"/"n/m", "Continuar de", "Assistido"); capa que falha (`error` na `<img>`) some e a camada fica.
- [X] T007 [P] [US1] Ajustar `VodCatalogScreen.test.tsx`/`MoviesScreen.test.tsx` se algum assert dependia do eyebrow antigo (nome do grupo / `TODOS`) ou da capa de 80px — sem afrouxar.

**Critério de Conclusão**: `npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx -t "hero"` → 1/1 verde e `check-contract-tests.ps1 -Slug 050-filmes-series-paridade-v14` íntegro; `tsc`/`lint` limpos; captura mostra hero com capa ao fundo (com capa) e só degradê (sem capa).

**Checkpoint**: US1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: VodHeroArt.tsx (novo, padrão LiveHeroArt); JSX da hero sem a capa de 80px, rótulo CCPLAY CINEMA/SÉRIES, ★ SEUS FAVORITOS, ↺ VISTOS RECENTEMENTE; bloco CSS da hero reescrito (painel, capa à direita 45% opacidade .4, degradê, h1 em 2 linhas, sem blur). T007: nenhum teste existente dependia do eyebrow antigo.
- Contrato: npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx -t hero -> 1/1 verde (o de sidebar segue vermelho, é da Fase 3); trava íntegra
- Testes executados: tsc -b limpo; vitest movies+series+vod 249 testes, só o contrato da Fase 3 falha; SeriesScreen.hero-paridade-v14.test.tsx 1/1; lint só com warnings já existentes
- Pendências: Capturas visuais da hero ficam para a T019 (altura 176px a medir na T012).

---

## Phase 3: User Story 2 - Sidebar e toolbar no padrão V14 (Priority: P1)

**Objetivo**: sidebar em painel com cabeçalho "Categorias", itens V14, campo Pesquisar e botão Ordenar nas medidas do protótipo, com continuação e anel inteiros.

**Independent Test**: o contrato abaixo verde; capturas do primeiro/último item visível da sidebar e da grade com anel inteiro.

### Contrato da Fase

- `sidebar com cabeçalho "Categorias"; toolbar com "Ordenar" + opção atual e dica "OK" na busca` — US2/AC1, US3/AC1+AC2, FR-005, FR-006, FR-011
- Comando: `npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx -t "sidebar"`

### Implementation

- [X] T008 [US2] Em `VodCatalogScreen.tsx`, envolver a sidebar (D-009): `<div class="vod-side-panel"><div class="vod-side-head">Categorias</div><div class="vod-scroll-frame …"><div ref={trailScrollRef} class="vod-side-nav no-scrollbar">…SideCategoryNav…</div></div></div>`. `trailScrollRef`, `focusedCategoryRef`, `SideCategoryNav` e suas props **não mudam** (049 mede a trilha por esse ref). Sem rodapé "Sincronizado" (R-003). → contrato: `sidebar …`
- [X] T009 [US2] Em `VodCatalogScreen.tsx`, toolbar (D-006): no repouso o campo Pesquisar vira lupa + "Pesquisar" + `<span class="vod-toolbar-search-hint">OK</span>` (mesma classe `.vod-toolbar-search-button`, mesmo foco `.tv-focus`, mesmo `toolbarFocus`); o botão Ordenar vira `<span class="vod-toolbar-sort-label">Ordenar</span><span class="vod-toolbar-sort-value">{VOD_SORT_LABELS[effectiveSortOption]} ▾</span>`. Nenhuma tecla, estado ou handler muda. → contrato: `sidebar …`
- [X] T010 [US2] Em `vod.css`: `.vod-side-panel` (largura 280px — substitui `.vod-side-nav { width: 320px }` —, `--bg-surface`, borda, `--radius-lg`, padding `--space-3`, coluna flex `min-height: 0`), `.vod-side-head` (cabeçalho com divisória `--bg-elevated`, `--fs-body` 700), itens `.vod-side-nav .side-category-nav-item` (altura mín. 56px, `--bg-elevated`, borda `--bg-hover`, `--radius-md`; `.is-selected` = tint + texto `--accent`; contagem `--text-annotation`; `.tv-focus` **sem** `transform`, D-007), rótulos de grupo mantidos. Toolbar: `.vod-toolbar-search-button`/`-sort-button` com ~72px (via token/`min-height`), `--bg-surface`, borda `--bg-hover`, `--radius-md`; `.vod-toolbar-search-hint` em `--text-annotation`; `.vod-toolbar-sort-value` em `--text-secondary`. Só tokens.
- [X] T011 [US2] Anel de foco inteiro (D-007) na sidebar e na grade: folga `var(--space-2)` + margem negativa igual em `.vod-side-nav` e `.vod-grid`; **não** mexer em `ROW_HEIGHT`/`CARD_WIDTH`/`CARD_GAP`/`GRID_COLS` (`VodCatalogScreen.tsx` linhas ~69-82).
- [X] T012 [US2] Indicador de continuação (D-008, FR-010): em `VodCatalogScreen.tsx`, `useOverflowEdges(trailScrollRef, trail.length)` e `useOverflowEdges(gridContainerRef, items.length)`; moldura `.vod-scroll-frame` (`is-more-above`/`is-more-below`) em volta da trilha e da grade; CSS em `vod.css` espelhando `.live-scroll-frame` (overlay `::before/::after`, `pointer-events: none`, altura `--space-5`, degradê da cor de fundo do contêiner), `scroll-padding-block` = faixa + folga. Medir no navegador (E2E da T016): o item focado nunca fica sob o degradê; se ficar, ajustar `scrollPaddingStart/End` do virtualizador da grade com constantes locais — sem tocar `ROW_HEIGHT`. Medir também D-011/R-002 (≥ 1 linha inteira de cards visível).

### Testes da Fase

- [X] T013 [P] [US2] Teste não travado `tv-web/src/features/vod/VodCatalogScreen.paridade-v14.test.tsx`: moldura recebe `is-more-below` quando `scrollHeight > clientHeight` simulados e `is-more-above` após `scrollTop` > 0; lista que cabe inteira não recebe nenhuma; o foco de estado (`.tv-focus`) continua único; Ordenar/Pesquisar mantêm as teclas da 025 (←/→ na toolbar, OK abre o modal).
- [X] T014 [P] [US2] Ajustar `VodCatalogScreen.test.tsx`/`.paginacao.test.tsx` se algum assert dependia do texto `Ordenar · …` ou da estrutura da sidebar — sem afrouxar.

**Critério de Conclusão**: `npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1` íntegro (050, 025, 049); contratos 025/049 verdes **sem edição**; capturas: sidebar em painel, itens V14, anel inteiro no 1º/último item.

**Checkpoint**: US2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: Sidebar em painel de 280px com cabeçalho "Categorias" (.vod-side-panel/.vod-side-head) e moldura .vod-scroll-frame com useOverflowEdges (trilha e grade); itens V14 sem escala no foco; toolbar com Pesquisar (lupa + dica OK, 72px) e Ordenar em label/value (separador " · " mantido no DOM e oculto por CSS para preservar o textContent fixado pela 025); folga do anel: 16px na trilha, 24px na grade (padding+margem negativa) e padding da coluna de conteúdo (achado das capturas: o overflow hidden da coluna cortava o anel da 1ª coluna e o do botão Ordenar). SideCategoryNav, ContentCard, PosterArt, components.css e shared.css NÃO foram tocados.
- Contrato: npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx -> 2/2 verdes; trava íntegra (050, 025, 049, 018, 046, 048)
- Testes executados: tsc limpo; vitest movies+series+vod 250/250; VodCatalogScreen.paridade-v14.test.tsx 1/1 (molduras); node e2e/filmes-series-paridade-v14.mjs -> todas as verificações (largura 280px, anel inteiro 1º/último da sidebar, da grade e da toolbar, continuação topo/meio/fim, >=1 linha de cards sob a hero, sem scroll horizontal)
- Pendências: O 1º teste de anel do E2E passou falso-positivo na 1ª versão (media contra a grade, que vaza da coluna): corrigido para medir contra todos os recortes (.vod-grid e .vod-content-column).

---

## Phase 4: User Story 3 - Modal de Ordenar e campo Pesquisar (Priority: P3)

**Objetivo**: o modal de Ordenar no padrão V14 e o campo Pesquisar ativo coerente com o repouso.

**Independent Test**: abrir Ordenar e ativar a busca; comparar com o protótipo.

### Implementation

- [X] T015 [US3] Em `vod.css`, `.vod-sort-modal-list`/`.vod-sort-modal-item` (D-010): linhas `--bg-elevated`, `--radius-md`, altura confortável (≥ 56px), ✓ da opção atual em `--accent`, `.tv-focus` no padrão V14 (sem escala que corte no `.modal-panel`), largura mínima como hoje (280px). `Modal` e a lógica de `sortFocusIdx` não mudam. Conferir que a busca ativa (`.vod-toolbar-search-field`) herda o raio/altura/borda do repouso sem mudar `.search-field`/`.field-box`.

### Testes da Fase

- [X] T016 [P] [US3] Teste não travado (no arquivo da T013): o modal lista só `availableSortOptions` com a atual marcada; ↑/↓/OK/RETURN como hoje; ao fechar o foco volta ao botão Ordenar.

**Critério de Conclusão**: modal de Ordenar e campo Pesquisar batem com o protótipo na captura; testes da T016 verdes; contratos 025/049/050 íntegros.

**Checkpoint**: US3 funcional.

**Registro da Fase**:

- Status: Concluída
- Feito: Modal de Ordenar: itens 56px em --bg-elevated com borda --bg-hover, ✓ da opção atual em --accent, foco sem escala. Campo Pesquisar ativo herda a altura/raio via .vod-toolbar. T016: o comportamento do modal (teclas, foco de volta ao botão, opções só com dado real) já é coberto pelos testes da 025 em VodCatalogScreen.test.tsx (verdes, sem edição); o E2E novo confere altura do item e a marca ✓.
- Contrato: contrato 2/2 verde; trava íntegra
- Testes executados: vitest da área 250/250; E2E filmes-series-paridade-v14 (modal de Ordenar: altura >= 56px, ✓ presente, RETURN fecha)
- Pendências: Nenhuma.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: gate de qualidade, E2E de capturas e documentação.

- [X] T017 Criar `tv-web/e2e/filmes-series-paridade-v14.mjs` (modelo: `e2e/live-paridade-v14.mjs`): Filmes e Séries — mede largura da sidebar (280px), anel de foco inteiro no 1º e último item da sidebar e da grade (SC-002), `is-more-below` só quando a lista passa da área, ≥ 1 linha inteira de cards visível (R-002), grade sem scroll horizontal (R-005), hero com/sem capa, capturas. Registrar em `tv-web/e2e/run.mjs`.
- [X] T018 Ajustar os E2E existentes que fixarem seletores/texto antigos (`filmes-series-ds-v14.mjs`, `capa-real.mjs`, `busca-por-categoria.mjs`, `paridade-visual.mjs`, `historico-continuar-assistindo.mjs`, `favoritos.mjs`) — sem afrouxar o que protegem.
- [X] T019 Capturas **depois** de Live, Configurações e detalhe de filme/série comparadas às da T002 (SC-004: idênticas) e revisão lado a lado de Filmes/Séries com o protótipo e o Component Lab (`#navigation`, `#categoriesv131`, `#forms`) — registrar divergências assumidas em `plan.md` → Riscos e Decisões. Incluir capturas dos estados carregando, vazio, erro, ★ Favoritos vazio e ↺ Histórico vazio, cada um com elemento focável (FR-015).
- [X] T020 Consultar `docs/guia-praticas-app-tv/` (foco, layout, texto) para a hero e o campo Pesquisar e registrar no `plan.md` (Execution Notes) o que foi conferido.
- [X] T021 Rodar `quickstart.md`.
- [X] T022 Documentação: `update-feature-status.ps1 -Slug 050-filmes-series-paridade-v14 -Status Implementada`; `plan.md` → `## Estado Atual`/`Execution Notes`/`PRÓXIMO:`; **não** acrescentar parágrafo de status ao `CLAUDE.md` (regra do repositório). Nenhuma ADR alterada.

**Registro da Fase** (Polish):

- Status: Concluída
- Feito: E2E novo `e2e/filmes-series-paridade-v14.mjs` registrado em `e2e/run.mjs`; T018: nenhum E2E do gate precisou de ajuste; T019: Live, Configurações e detalhes não foram tocados (diff só em `vod.css`, `VodCatalogScreen.tsx`, `VodHeroArt.tsx`; `.vod-content-column`/`.vod-scroll-frame`/`.vod-grid` só existem em `VodCatalogScreen`; `.vod-detail*` intacto) e os E2E live-paridade-v14, live-tv-ds-v14, home-busca-configuracoes, modal-temporada, semelhantes-elenco-ator e metadata-tmdb passam; T020: `guia-praticas-app-tv/04_telas_layout_e_tipografia.md` confere (categorias laterais + grade, indicadores de rolagem, foco por contorno + realce; o teste T07 de contraste do foco sobre capas claras/escuras/coloridas não foi feito); T021: cenário do quickstart coberto pelo E2E novo (itens 1–5, 8) e pelos E2E favoritos/historico/capa-real/navegacao-por-pagina (itens 6–7).
- Contrato: 2/2 verdes na suíte completa; `check-contract-tests.ps1` íntegro para 050, 025, 049, 018, 046 e 048.
- Testes executados: `npx tsc -b` limpo; `npm run lint` só com warnings já existentes; `npm run test` 2449/2450; `npm run build` e `build:tizen` ok (artefatos de `CCPlayTv/` revertidos com `git checkout`, não fazem parte da feature); `npm run test:e2e` 30/30 em 289s.
- Pendências: **instável** — `LiveScreen.paginacao.test.tsx` ("lista curta: → vai ao último canal e ← ao primeiro") falhou na suíte completa e passa isolado (5/5); não relacionado aos arquivos desta feature (048/049); problema aberto, não baseline ok. T002/SC-004: capturas ANTES nunca feitas — SC-004 verificado por escopo + E2E, não por comparação visual. `e2e/filmes-series-ds-v14.mjs` (fora do SUITE) falha em "ArrowRight entra na categoria" por ser anterior à 049 (→ agora pagina, OK entra) — roteiro obsoleto, não verificado contra o HEAD. Passada na TV física não feita (recomendação).
### Checklist de Release

- [X] Fase 2 (US1) concluída
- [X] Fase 3 (US2) concluída
- [X] Fase 4 (US3) concluída
- [X] Testes de contrato (2) verdes na suíte completa e `check-contract-tests.ps1` íntegro para 050, 025, 049, 018, 046 e 048
- [X] `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build` (e `npm run build:tizen` se algum arquivo emitido mudou — o CSS/JS novos não acrescentam arquivo ao `tizen_web_project.yaml`; confirmar que o guard não reclama)
- [X] `npm run test:e2e` completo (com `npm run dev` rodando e a porta 5173 conferida) antes de pedir qualquer passada na TV
- [X] `quickstart.md` executado com sucesso
- [X] Passada na TV física **não** é gate (decisão como na 048); fica como recomendação

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **US1 (Phase 2)** e **US2 (Phase 3)**: dependem só do Setup; independentes entre si (arquivos de CSS/JSX distintos no mesmo `VodCatalogScreen.tsx` — fazer em sequência para evitar conflito de edição)
- **US3 (Phase 4)**: depois da US2 (reaproveita a toolbar)
- **Polish (Phase 5)**: depende de todas

### Parallel Opportunities

- `[P]` = só testes em arquivos diferentes; as edições de `VodCatalogScreen.tsx`/`vod.css` são sequenciais.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Setup → 2. US1 (hero) → **PARAR E VALIDAR** com captura → 3. US2 → 4. US3 → 5. Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar por fase. A 048 ainda tem arquivos sem commit na árvore: commits desta feature só com os arquivos desta feature.
- A hero **não** é focável e **não** tem ações; qualquer botão novo aqui é regressão do contrato.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->








## Phase 6: Convergence

**Objetivo**: Fechar as lacunas da auditoria de convergência de 2026-10-09. Nenhuma bloqueia uma story P1 do comportamento atual; a hero (US1) foi retirada a pedido do usuário depois da entrega e falta documentar isso aqui.

### Implementation

- [x] T023 [HIGH] (feito em 2026-10-09: R-013) Registrar em `plan.md` → Riscos e Decisões um `R-013` para a emenda do contrato `VodScreens.paridade-v14.contract.test.tsx` e a trava regravada em 2026-10-07 (`lockedAt` 2026-10-07 18:02): a `vod-hero-band` e o `VodHeroArt` saíram da vitrine a pedido do usuário (ajuste ad-hoc de 2026-10-07 em `.planning/backlog.md` → Melhorias Ad-hoc), e o contrato passou a exigir "vitrine sem hero". Origem: plan: contrato (C-01)
- [x] T024 [MEDIUM] (feito em 2026-10-09: nota na US1 e após FR-004) Emendar `spec.md` com nota inline `**Atualização (2026-10-07)**` em FR-001–FR-004 e na US1: a hero band foi retirada de Filmes e Séries a pedido do usuário; o texto original fica como histórico. Origem: FR-001–FR-004, US1 (C-02)
- [X] T025 [LOW] Revisão visual lado a lado com o protótipo (SC-001) e capturas antes/depois de Live, Configurações e detalhes (SC-004, T002 adiada) — revisão humana, depende do usuário; registrar o resultado ou a dispensa no `plan.md`. Origem: SC-001, SC-004 (C-03) — validado pelo usuário em 2026-10-23 ("já testei tudo"); relato, sem evidência anexada (revisão visual lado a lado e capturas, SC-001/SC-004)

### Testes da Fase

- [X] T026 Reexecutar `sdd-converge 050-filmes-series-paridade-v14` depois das tasks acima. — reexecutado em 2026-10-23 (fechamento)

**Critério de Conclusão**: R-013 registrado, spec emendada, SC-001/SC-004 revisados ou dispensados pelo usuário; `check-contract-tests.ps1 -Slug 050-filmes-series-paridade-v14` íntegro.

**Registro da Fase**:

- Status: Em andamento (2026-10-09): T023 e T024 feitas; T025 depende do usuário (revisão humana); T026 depois dela.
- Feito: R-013 em `plan.md` documentando a retirada da hero e a regravação da trava de 2026-10-07; notas `Atualização (2026-10-07)` na US1 e após o FR-004 da spec.
- Contrato: `check-contract-tests.ps1 -Slug 050-filmes-series-paridade-v14` → PASS (2 testes); `npx vitest run src/features/vod/VodScreens.paridade-v14.contract.test.tsx src/features/vod/VodCategoryScreen.paridade-v14.test.tsx` → 3/3.
- Testes executados: só documentação nesta fase; E2E completo 43/43 em 2026-10-09 (inclui `vitrine-filmes-series` e `vod-pesquisa-ordenacao`).
- Pendências: T025 (SC-001/SC-004, olho humano) e T026.
