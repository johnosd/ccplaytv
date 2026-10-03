# Handoff — 050-filmes-series-paridade-v14

## Contexto

- Repositório `ccplayTv`, branch `feature/designWave2`. React 19 + TS + Vite em `tv-web/`, alvo Tizen 9 (`chrome108` não remover).
- Próximo comando: `/sdd-execute 050-filmes-series-paridade-v14`. Backlog: **Planejada** (0/30 itens — o script conta também o checklist de release).
- Fora desta sessão: `docs/design/design-system/CCPlayTV_Tizen_Ultimate_Prototype_v13_2.html` está **modificado e sem commit** — reler `catalog()` (linha ~773) antes de comparar. A feature 048 (Live) está "Em Execução" na mesma árvore, com T031/T033 abertas.

## O que a feature entrega

- **US1 (P1)**: hero band em painel — rótulo `CCPLAY CINEMA`/`CCPLAY SÉRIES`/`★ SEUS FAVORITOS`/`↺ VISTOS RECENTEMENTE`, título grande, metadados reais, capa real ao fundo sob degradê (sem blur). A hero **não é focável nem tem botões** (o protótipo tem "Abrir destaque/Pesquisar"; **não** adotados).
- **US2 (P1)**: sidebar em painel de 280px com cabeçalho "Categorias", itens V14, toolbar com Pesquisar (lupa + "OK") e Ordenar (rótulo + valor), anel de foco inteiro e indicador de continuação (sidebar e grade).
- **US3 (P3)**: modal de Ordenar em lista V14; campo Pesquisar ativo coerente.
- **Decisões do usuário que contrariam o óbvio**: as **fileiras** do protótipo ficaram **fora** (exigem nova zona de foco; só visual), os **detalhes** de filme/série ficaram **fora**, a **busca continua inline** (nada de modal com IME) e a sidebar **não** ganha tiles nem recolhe.

## Leitura obrigatória, em ordem

1. `spec.md` — escopo e FRs (FR-001..FR-016; FR-007/FR-008 não existem mais, a numeração não foi refeita).
2. `plan.md` — Decisões D-001..D-012 (o "como"), Riscos R-001..R-008, tabela de referências do DS.
3. `tasks.md` — T001..T022 por fase.
4. `quickstart.md` — verificação ponta a ponta.
5. `.planning/memory/constitution.md` — gate (foco, voltar, segredos).
6. Referência de padrão: `sdd/specs/048-live-paridade-v14/plan.md` e `tv-web/src/features/live/LiveHeroArt.tsx`, `tv-web/src/styles/live.css` (`.live-scroll-frame`), `tv-web/src/lib/focus/useOverflowEdges.ts`.

## Testes de contrato

- Travado: `tv-web/src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx` — **2 testes** (hero → Fase 2; sidebar/toolbar → Fase 3).
- Rodar (de `tv-web/`): `npx vitest run src/features/movies/MoviesScreen.paridade-v14.contract.test.tsx`
- Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 050-filmes-series-paridade-v14`
- Podem ser quebradas por esta feature (conferir íntegras): `025-filmes-series-ds-v14`, `049-navegacao-por-pagina`, `018-busca-por-categoria`, `046-memoria-foco-key-repeat`, `048-live-paridade-v14`.
- Classes fixadas pelo contrato: `.vod-hero-band`, `.vod-hero-eyebrow`, `.vod-hero-title`, `.vod-hero-art` (+ `img`), `.vod-side-head`, `.vod-toolbar-sort-label`, `.vod-toolbar-sort-value`, `.vod-toolbar-search-hint`.

## Stubs criados

Nenhum — os testes só usam a interface pública (DOM) e classes novas que o executor cria. Estão vermelhos por asserção (`expected 'AÇÃO' to be 'CCPLAY CINEMA'`; `expected null to be 'Categorias'`). `VodHeroArt.tsx` **não existe** ainda (T003).

## Armadilhas já mapeadas

- `VodCatalogScreen` serve Filmes **e** Séries (`MoviesScreen`/`SeriesScreen` são casquinhas): uma edição cobre as duas.
- Não mexer em `ROW_HEIGHT`/`CARD_WIDTH`/`CARD_GAP`/`GRID_COLS` (paginação 049 mede o passo) nem em `trailScrollRef`/`focusedCategoryRef` (049 mede a trilha por eles).
- `SideCategoryNav`, `ContentCard`, `PosterArt`, `components.css`, `shared.css` **não mudam** (Live/Home/Busca/Configurações os usam; FR-016). Regras de sidebar entram como `.vod-side-nav …` em `vod.css`.
- `.vod-hero-poster*` some; ~12 E2E dependem de `.vod-grid-cell`, `.vod-side-nav`, `.vod-toolbar-search-button`, `.side-category-nav-*`, `.content-card-title` — preservados (D-003).
- Hero aparece só com `showingContent` (como hoje); não mostrá-la com foco na sidebar (D-001).
- Texto atual do botão: `Ordenar · <opção> ▾`; vira dois `<span>`. Conferir que nenhum teste fixa o "·" (T001).
- Altura da hero (176px) é palpite a medir (R-002): reduzir a hero, nunca o card.
- Scroll/folga do anel (048): `scroll-padding` e `scrollPaddingStart/End` dependem um do outro; mexeu em um, mexa nos dois.
- Anel inteiro e continuação só se medem no navegador (E2E), não em jsdom. `innerText` do Playwright aplica `text-transform`.
- E2E têm `localhost:5173` fixo; 2º Vite vira 5174 → gate no código errado. Rodar parcial: `node e2e/run.mjs --only a,b --jobs 1`.
- Não acrescentar parágrafo de status ao `CLAUDE.md`.

## Pendências do Analyze

- **A-001 (LOW)**: spec FR-006/SC-001 dizem "nas medidas do protótipo", mas o plan usa hero de 176px (protótipo: 242px) e sidebar de 280px (252px) por legibilidade/espaço de grade (D-009/D-011). Divergências assumidas; registrar no T019.
- **A-002 (LOW)**: a numeração de FR/SC da spec tem lacunas (FR-007/FR-008/SC-003 removidos com as fileiras); não foi renumerada para não quebrar referências.
- **A-003 (LOW)**: rótulo da hero de **Séries** e de ★/↺ não está no contrato (só jsdom-viável por teste não travado, T006).
- **A-004 (MEDIUM)**: o fundo da hero usa capa de **retrato** recortada em faixa horizontal (R-004); pode parecer pior que o backdrop do protótipo. Validar na captura; alternativa registrada no plan.
- **A-005 (LOW)**: `docs/guia-praticas-app-tv/` não foi consultado neste plano (T020 cobre).

## Gate de pronto

- Contratos 2/2 verdes e travas íntegras (050, 025, 049, 018, 046, 048).
- De `tv-web/`: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build` (+ `build:tizen` se algo emitido mudar), `npm run test:e2e` completo com `npm run dev` na 5173.
- `quickstart.md` executado; capturas Live/Configurações/detalhes idênticas às de antes (SC-004).
- Docs: `update-feature-status.ps1 … -Status Implementada`, `plan.md` (Estado Atual/Execution Notes/PRÓXIMO), sem mexer no `CLAUDE.md`.
- Passada na TV física: **recomendação**, não gate.
