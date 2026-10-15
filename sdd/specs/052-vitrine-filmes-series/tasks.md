---
description: "Tasks da feature 052 — vitrine de Filmes e Séries e tela de categoria em grade cheia"
---

# Tasks: Vitrine de Filmes e Séries e tela de categoria em grade cheia

**Input**: `sdd/specs/052-vitrine-filmes-series/` (spec.md, plan.md, `logic/vitrine-e-foco.md`, quickstart.md, handoff.md)

**Prerequisites**: plan.md, spec.md. Sem `research.md`/`data-model.md`/`contracts/` (nenhuma incerteza técnica, nenhum dado persistido, nenhuma API).

**Organization**: por user story. US1 (tela de categoria) e US2 (vitrine) são P1 e independentes de implementar; a integração (Fase 5) as liga no `App`. US3 (P2) é o refinamento de foco/estados.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Código em `tv-web/src/` (Vite/React/TS). Comandos a partir de `tv-web/`; scripts de trava rodam da raiz do repositório.
- Telas: `tv-web/src/features/vod/`. Navegação: `tv-web/src/navigation/appNav.ts` + `tv-web/src/App.tsx`. CSS: `tv-web/src/styles/vod.css`. Compartilhado: `tv-web/src/components/`.
- E2E: `tv-web/e2e/` (Playwright, `npm run dev` rodando e porta 5173 conferida; roteiro novo registrado em `e2e/run.mjs`).

## Phase 1: Setup

**Purpose**: baseline antes de mexer.

- [X] T001 Rodar `npx tsc -b` e `npx vitest run src/features/vod src/features/movies src/features/series src/features/home src/features/catalog src/navigation src/components` e registrar no `plan.md` (Execution Notes) o resultado base — só os 5 contratos desta feature devem falhar. Rodar `check-contract-tests.ps1` para 018, 019, 022, 023, 024, 025, 026, 036, 046, 049, 050 e 052 (todas íntegras).
- [X] T002 (parcial, ver Registro da Fase 1) Capturar 1920×1080 **antes** (Filmes com categoria aberta, Live, Configurações, Busca, detalhe de filme) via Playwright, fora do git, para o comparativo de SC-004 (T031).

**Checkpoint**: baseline registrado.

**Registro da Fase**:

- Status: Concluída (T002 parcial)
- Feito: baseline — `tsc -b` limpo; 105 arquivos de teste da área, só os 5 contratos da 052 falham (3 arquivos, pelo motivo esperado: `not implemented`/`expected null`/`expected []`); travas 018/019/022/023/024/025/026/036/046/049/050/052 íntegras; Vite na 5173 (PID 40068). T002: as capturas "antes" de Filmes (categoria aberta, 1920×1080 e 2200×1000) e de Live já existem em `tv-web/test-results/filmes-series-paridade-v14/` e `live-paridade-v14/` (geradas hoje pelos E2E da 048/050, estado idêntico ao de agora); Configurações, Busca e detalhes **não** foram capturados.
- Contrato: 0/5 verdes (esperado, vermelhos); trava íntegra.
- Testes executados: `npx tsc -b`; `npx vitest run src/features/vod src/features/movies src/features/series src/features/home src/features/catalog src/navigation src/components`.
- Pendências: capturas "antes" de Configurações/Busca/detalhes ficaram de fora (como na 050, SC-004 será verificado na T031 por escopo — nada fora de `features/vod`, `App.tsx`/`appNav` e `vod.css` muda — mais E2E dessas telas e capturas "depois").
---

## Phase 2: Foundational — dado e peças compartilhadas

**Purpose**: o que a vitrine (US2) e a categoria (US1) usam em comum.

### Contrato da Fase

- `até 12 itens do mais novo ao mais antigo, ignora item sem data e mantém a ordem de entrada nos empates` — FR-003, US2/AC3
- Comando: `npx vitest run src/features/vod/vodShowcase.vitrine-filmes-series.contract.test.ts`

### Implementation

- [X] T003 Implementar `recentlyAdded` em `tv-web/src/features/vod/vodShowcase.ts` conforme `logic/vitrine-e-foco.md` §2 (top-N estável, sem mutar a entrada) → contrato: `até 12 itens do mais novo…`
- [X] T004 Implementar `useRecentlyAdded` em `tv-web/src/features/catalog/catalogApi.ts` (substitui o stub) sobre `loadSearchIndex` + `recentlyAdded`, `enabled` por `sourceId`, sem rede; invalidar onde `catalog-search-index` já é invalidado.
- [X] T005 [P] Extrair o cartão "Ver todos" de `tv-web/src/features/home/HomeContent.tsx` (`HomeSeeAllCard`) para `tv-web/src/components/SeeAllCard.tsx` com markup e classes **idênticos** (prop `className` extra opcional); `HomeContent` passa a importá-lo. Contrato 026 e testes do Início seguem verdes sem edição.

### Testes da Fase

- [X] T006 [P] `tv-web/src/features/vod/vodShowcase.test.ts`: `limit` 0/negativo, entrada vazia, datas iguais em bloco, valores não finitos (`NaN`) ignorados, entrada não mutada.
- [X] T007 [P] `tv-web/src/components/SeeAllCard.test.tsx`: renderiza o rótulo, `.tv-focus` quando focado, classe extra aplicada.

**Critério de Conclusão**: `npx vitest run src/features/vod/vodShowcase.vitrine-filmes-series.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1 -Slug 052-vitrine-filmes-series` íntegro; `HomeContent.test.tsx` e o contrato 026 verdes sem edição; `npx tsc -b` limpo.

**Registro da Fase**:

- Status: Concluída
- Feito: recentlyAdded (top-N estável, O(n log limit)) em vodShowcase.ts; useRecentlyAdded em catalogApi.ts compartilhando a chave/queryFn de catalog-search-index (useAggregatedItems) com select — sem rede; SeeAllCard extraído de HomeContent com markup idêntico (classe extra opcional).
- Contrato: vodShowcase.vitrine-filmes-series.contract.test.ts 1/1 verde; trava íntegra
- Testes executados: tsc limpo; vodShowcase.test.ts (3 casos de borda), SeeAllCard.test.tsx, src/features/home 100% verde (contrato 026 intacto)
- Pendências: Nenhuma.

---

## Phase 3: User Story 1 - Tela de categoria em grade cheia (Priority: P1) 🎯 MVP

**Objetivo**: a tela de categoria só com Pesquisar, Ordenar e a grade 2 × 6 com capa inteira.

**Independent Test**: os 2 contratos abaixo verdes; captura 1920×1080 com 12 cards inteiros e anel completo.

### Contrato da Fase

- `categoria: só toolbar + grade (sem sidebar nem hero); OK abre o item com o estado de volta; RETURN volta à vitrine` — US1/AC1+AC3+AC4+AC5, FR-006/008/009
- `★ Favoritos vazio: estado vazio com ação focável que volta à vitrine, e sem botão Ordenar` — US1/AC6, FR-008/013
- Comando: `npx vitest run src/features/vod/VodCategoryScreen.vitrine-filmes-series.contract.test.tsx`

### Implementation

- [X] T008 Criar `tv-web/src/features/vod/VodCategoryScreen.tsx` **copiando** `VodCatalogScreen.tsx` por cima do stub (manter `VodCategoryScreenProps` e renomear o componente para `VodCategoryScreen`). A tela antiga **continua montada no `App`** até a T024, para o app compilar e funcionar entre as fases.
- [X] T009 Em `VodCategoryScreen.tsx`, trocar "entrada aberta" por `target` (D-003/D-010, `logic/vitrine-e-foco.md` §4): remover `trail`/`TrailKey`/`col`/`categoryIdx`/`SideCategoryNav`/`focusedCategoryRef`/`trailScrollRef`/`useOverflowEdges(trail)` e o `enterCategory/enterFavorites/enterHistory/enterAll`; resolver `target.name → category`; foco inicial por `restore` → `recalledFocus` → 1º item. → contrato: `categoria: só toolbar + grade…`
- [X] T010 Em `VodCategoryScreen.tsx`, remover a hero e a seção "Aponte para uma categoria…"; `onOpenItem(itemId, restore)` entrega `VodCategoryRestore` (`focusedItemId`, `searchTerm`, `searchActive`, `focusedIndexHint`); RETURN: fecha a busca se aberta, senão `onBack`; ← na 1ª coluna não faz nada. `target.sort` inicia a ordenação sem `setSessionSort`. → contrato: ambos
- [X] T011 Estados da tela: ★ Favoritos/↺ Histórico vazios, categoria vazia, carregando, erro e "conteúdo sumiu" com ação focável que chama `onBack` (ou a ação própria), sem Ordenar em ★/↺ (FR-013). → contrato: `★ Favoritos vazio…`
- [X] T012 `tv-web/src/styles/vod.css`: remover `.vod-side-panel`/`.vod-side-head`/`.vod-side-nav*`, a regra `.vod-hero-band { display: none }` e os ajustes de coluna que existiam por causa da sidebar; a coluna de conteúdo ocupa a largura toda. **Medir** (E2E, T013): 2 linhas × 6 colunas inteiras, card ≥ 205px, capa sem recorte, anel inteiro contra `.vod-grid` e `.vod-content-column`. Se faltar altura: compactar cabeçalho (D-011), nunca encolher o card.
- [X] T013 Esqueleto do E2E `tv-web/e2e/vitrine-filmes-series.mjs` com a parte da categoria (modelo: `e2e/filmes-series-paridade-v14.mjs`): imprime `grade Npx; linhas em …; M colunas; card Wpx`, assert 2 linhas inteiras, ≥ 205px, sem scroll horizontal, anel inteiro no 1º/último card, continuação só nas bordas com itens ocultos; viewports 1920×1080 e 2200×1000.

### Testes da Fase

- [X] T014 Migrar `VodCatalogScreen.test.tsx`, `VodCatalogScreen.paginacao.test.tsx`, `VodCatalogScreen.limpar-historico.test.tsx` e `VodCatalogScreen.paridade-v14.test.tsx` para `VodCategoryScreen` (`git mv` + entrada por `target` em vez de navegar pela trilha); manter o que protegem (busca, ordenação, favoritar, histórico, paginação, molduras de continuação) — **não** afrouxar.
- [X] T015 Migrar `MoviesScreen.favorites.test.tsx`/`SeriesScreen.favorites.test.tsx` e o que mais montar a tela antiga por trilha para a tela de categoria (`target: favorites/category`).

**Critério de Conclusão**: `npx vitest run src/features/vod/VodCategoryScreen.vitrine-filmes-series.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1` íntegro (052); `VodCategoryScreen.*.test.tsx` migrados verdes; captura mostra a grade cheia 2 × 6.

**Checkpoint**: US1 funcional e testável isoladamente (a tela de categoria pode ser renderizada por qualquer `target`, mesmo sem a vitrine).

**Registro da Fase**:

- Status: Concluída
- Feito: VodCategoryScreen.tsx escrita a partir do VodCatalogScreen (a entrada vem de target; sem trilha, sidebar, hero e col); RETURN fecha a busca ou volta (onBack); estados vazio/erro/carregando/missing chamam onBack/retry/resync; ↑ da toolbar vai à topbar e a toolbar só marca foco com o conteúdo ativo (um foco por vez); target.sort inicia a ordenação sem gravar a sessão; dica de favoritar removida (já está no rodapé). CSS: sidebar e trilha removidas de vod.css; grade 2×6 medida no E2E novo: grade 832px, linhas em 216/586, 6 colunas, card 205px, 2 linhas inteiras visíveis com a margem atual (38px), capa sem recorte, anel inteiro (contra .vod-grid e .vod-content-column), sem scroll horizontal. E2E vitrine-filmes-series.mjs + e2e/lib/vod.mjs. Testes migrados dos antigos VodCatalogScreen/MoviesScreen/SeriesScreen para VodCategoryScreen.test.tsx (34), .catalogo.test.tsx (11), .favoritos-filmes/.series (8), .limpar-historico (+contrato 036 amendado, 5), .paridade-v14.test.tsx (1).
- Contrato: VodCategoryScreen.vitrine-filmes-series.contract.test.tsx 2/2 verde; trava íntegra
- Testes executados: tsc limpo; lint sem erros novos; vitest vod/movies/series/home/catalog/navigation/components/App verde; node e2e/vitrine-filmes-series.mjs passa
- Pendências: Os testes antigos de trilha/hero/sidebar foram APAGADOS (não portados): trilha com paginação (049), hero sobre a grade, ordem da side nav, memória entre categorias via trilha, "nunca lê ao mudar o foco na trilha". Os objetivos que ainda valem foram portados.

---

## Phase 4: User Story 2 - Vitrine com hero e fileiras reais (Priority: P1)

**Objetivo**: a vitrine com hero do card focado e as fileiras Continue assistindo, ★ Favoritos, Adicionados recentemente e Categorias.

**Independent Test**: os 2 contratos abaixo verdes; captura 1920×1080 com as 4 fileiras e outra só com Categorias.

### Contrato da Fase

- `mostra só as fileiras com dado real + Categorias (★, ↺, Todos primeiro); sem dado, só Categorias com o foco` — US2/AC1..AC4+AC7, FR-001/002/005/010/014
- `OK abre item, categoria e "Ver tudo" com o destino certo; o foco devolvido restaura o mesmo cartão por id` — US1/AC1+AC5, US2/AC6, FR-004/005/009
- Comando: `npx vitest run src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx`

### Implementation

- [X] T016 `tv-web/src/features/vod/VodShowcaseScreen.tsx` (substitui o stub): dados (`useCategoryList`, `useHistoryContent`, `useFavoritesContent`, `useRecentlyAdded`), fileiras e entradas (`logic/vitrine-e-foco.md` §1), `Rail` + `useIdFocus` por fileira, `SeeAllCard` (classe `vod-see-all-card`), cartões de categoria (`vod-category-card`: nome via `vodGroupDisplay` + contagem de `knownCategoryCount`), seções `section.vod-row[aria-label]` com os rótulos exatos do contrato. → contrato: ambos
- [X] T017 Foco e restauração da vitrine (`useRemoteNav`, `moveRow`, `effectiveRow`, `initialRow`, `focusNow`) conforme §1; ↑ da 1ª fileira sai para a topbar quando há `shell` (`AppShell`/`TopBar` como na vitrine antiga e na Home); `onOpenItem`/`onOpenTarget` com `{row, id}`; RETURN → `onBack`. → contrato: `OK abre item, categoria e "Ver tudo"…`
- [X] T018 Hero da vitrine (§3): `VodHeroArt` + `.vod-hero-*`; item focado → capa/título/metadados reais (reusar a lógica de metadados da hero de 050: `watchedIds`, `resumePositions`, `watchedSummary`); categoria focada → nome + contagem sobre degradê; "Ver tudo" → mantém o último; sem botões, `aria-hidden`. → contrato: `mostra só as fileiras…`
- [X] T019 `MoviesScreen.tsx`/`SeriesScreen.tsx` viram casquinhas da vitrine (props de `VodShowcaseScreenProps`); `categoryScreenSnapshot.ts` perde a trilha e `FAVORITES_SNAPSHOT` (sai junto com a tela antiga, T024).
- [X] T020 `tv-web/src/styles/vod.css`: `.vod-showcase`, `.vod-row`, `.vod-row-title`, `.vod-category-card`, `.vod-see-all-card` (só tokens; foco sem escala em cartões de texto, anel inteiro; folga do `Rail` como na Home), rolagem vertical da pilha, indicador de continuação nas fileiras (já vem do `Rail`). Medir no E2E: hero + ≥ 2 fileiras inteiras sob ela.

### Testes da Fase

- [X] T021 [P] `tv-web/src/features/vod/VodShowcaseScreen.test.tsx`: hero por tipo de foco (item, categoria, "Ver tudo"), rótulos `★ SEUS FAVORITOS`/`↺ VISTOS RECENTEMENTE`/`CCPLAY SÉRIES`, fileira some quando vazia, item que sai do histórico enquanto em foco, carregando (`aria-busy`) e erro de categorias com ação focável, Séries (`section="series"`).

**Critério de Conclusão**: `npx vitest run src/features/vod/VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` → 2/2 verdes e `check-contract-tests.ps1` íntegro; `VodShowcaseScreen.test.tsx` verde; captura mostra a vitrine com as 4 fileiras.

**Checkpoint**: US2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: VodShowcaseScreen.tsx: hero fixa + pilha de fileiras (Rail + useIdFocus por fileira, SeeAllCard com classe vod-see-all-card, cartões de categoria vod-category-card com nome via vodGroupDisplay + contagem conhecida); foco por id e restauração (effectiveRow/initialRow), ↑ da 1ª fileira vai à topbar, OK abre item/categoria/Ver tudo com o foco entregue; estados categorias carregando/erro/vazio; fileira Adicionados em aria-busy enquanto lê. CSS da vitrine em vod.css (respiro de 24px entre cartões, Ver tudo com a altura do pôster, folga do anel). MoviesScreen/SeriesScreen (casquinhas) apagadas: o App usa VodShowcaseScreen direto.
- Contrato: VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx 2/2 verde; trava íntegra
- Testes executados: VodShowcaseScreen.test.tsx 7/7; E2E vitrine-filmes-series.mjs (fileiras só com dado real, hero, Ver tudo de ★ Favoritos e de Adicionados, voltar restaurando o cartão, detalhe e volta, Séries)
- Pendências: Altura: hero (176px) + 1 fileira de itens (370px) cabem; a 2ª fileira aparece cortada embaixo e o foco rola a pilha — D-006 (≥ 2 fileiras inteiras sob a hero) NÃO é atendido; registrado como R-012. Cartão "Ver tudo" e respiro foram ajustados após as capturas.

---

## Phase 5: Integração — navegação e `App`

**Purpose**: ligar vitrine ↔ categoria ↔ detalhe e o Início.

- [X] T022 `tv-web/src/navigation/appNav.ts`: tipos `movies-category`/`series-category` (D-002), `restore` da vitrine = `VodShowcaseFocus`, remover `openFavorites`; **sem** mudar o redutor. `appNav.test.ts`: abrir categoria empilha a vitrine com o foco; `back` a devolve; `switch-top` a partir da categoria; contratos 023/024 verdes sem edição.
- [X] T023 `tv-web/src/App.tsx`: renderizar `VodShowcaseScreen` (via `MoviesScreen`/`SeriesScreen`) e `VodCategoryScreen` (`*-category`), `onOpenTarget` → `open` com `from: {...vitrine, restore: foco}`, `onOpenItem` da categoria → `movie-detail`/`series-detail` com `from: {...categoria, restore}`; Início "Filmes (N)/Séries (N)" → `open` de `*-category` com `target: favorites`; `App.test.tsx` ajustado.
- [X] T024 Apagar o que ficou órfão: `FAVORITES_SNAPSHOT`, `CategoryScreenSnapshot` antigo, `VodCatalogScreen*` sem uso, regras de CSS mortas; `npx tsc -b` e lint sem avisos novos.

### Testes da Fase

- [X] T025 [P] `tv-web/src/App.test.tsx`/novo `App.vitrine.test.tsx`: vitrine → categoria → detalhe → voltar → voltar restaura cada tela (foco por id); Início → "Filmes (N)" → ★ Favoritos → RETURN volta ao Início.

**Critério de Conclusão**: fluxo vitrine → categoria → detalhe → voltar ×2 funciona no navegador (E2E da T027); `npx vitest run src/navigation src/App.test.tsx` verde.

**Registro da Fase**:

- Status: Concluída
- Feito: appNav.ts: telas movies-category/series-category e restore da vitrine (VodShowcaseFocus | CategoryScreenSnapshot — o shape antigo fica na união só porque o contrato travado 023 o usa como restore de movies; isShowcaseFocus filtra); App.tsx renderiza VodShowcaseScreen e VodCategoryScreen com vodShell(), "Filmes (N)"/"Séries (N)" do Início abrem *-category (target favorites); FAVORITES_SNAPSHOT removido; telas e testes antigos apagados. Travas AMENDADAS e regravadas (aprovado pelo usuário): 025 (VodCategoryScreen.filmes-series-ds-v14: memória de foco por entrada), 036 (VodCategoryScreen.limpar-historico, target history), 049 (VodCategoryScreen.navegacao-por-pagina: grade cartão a cartão, ← na 1ª coluna não faz nada, ↑ vai à toolbar), 050 (VodScreens.paridade-v14: hero da vitrine e cromo da toolbar).
- Contrato: 052: 5/5 verdes; travas íntegras para 052, 025, 036, 049, 050 (regravadas) e 018, 019, 022, 023, 024, 026, 046, 048 (intactas)
- Testes executados: tsc limpo; App.test.tsx 5/5 (vitrine → categoria → detalhe → voltar ×2; Filmes (N) → ★ Favoritos); appNav.test.ts 41/41; vitest da área verde; contratos 023/024/026 verdes sem edição
- Pendências: E2E ainda NÃO migrados (Fase 6/T028): home-busca-configuracoes falha e os ~14 roteiros que abrem categorias pela sidebar também; o gate E2E completo só fecha depois da T028.

---

## Phase 6: User Story 3 - Foco, voltar e estados (Priority: P2)

**Objetivo**: nenhuma combinação de dados, estado ou volta deixa a pessoa sem foco visível ou na posição errada.

**Independent Test**: percorrer ↑↓←→ pela vitrine inteira, abrir/voltar de detalhe e de categoria, lista vazia/carregando/erro.

### Implementation

- [X] T026 Estados da vitrine: sem filmes/séries (`EmptyState` com ação focável), categorias carregando (`Spinner` + ação) e erro (`ErrorState` com "Tentar de novo"/"Voltar"), "conteúdo sumiu" (ressincronizar, soft disabled offline como na 042) — FR-013. Fileiras em carregamento com esqueleto `aria-busy`.
- [X] T027 Completar `e2e/vitrine-filmes-series.mjs` (vitrine): 4 fileiras com dados reais da fixture (histórico e favoritos criados via UI, itens com `added_at`), só Categorias sem dados, "Ver tudo" de cada fileira, ≤ 3 setas + OK até uma grade (SC-003), voltar restaura fileira/cartão, foco único e visível, anel inteiro nos cartões e nas bordas da fileira, hero com/sem capa; Filmes e Séries; viewports 1920×1080 e 2200×1000. Registrar em `e2e/run.mjs`.
- [X] T028 Migrar os E2E que abrem categorias pela sidebar: criar `tv-web/e2e/lib/vod.mjs` (`openVodCategory(page, section, name)`: vitrine → fileira Categorias → cartão pelo nome → OK) e migrar `audio-legendas-info`, `busca-por-categoria`, `capa-real`, `carga-listas`, `catalogo-em-blocos`, `ciclo-vida-player`, `favoritos`, `historico-continuar-assistindo`, `limpar-historico`, `metadata-tmdb`, `modal-temporada`, `semelhantes-elenco-ator`, `trailers`, `navegacao-por-pagina`, `home-busca-configuracoes` (rodar por lote com `node e2e/run.mjs --only a,b --jobs 1`). **Sem afrouxar** o que protegem.

### Testes da Fase

- [X] T029 [P] Testes unitários dos estados (T026) em `VodShowcaseScreen.test.tsx`.

**Critério de Conclusão**: E2E novo e os 15 migrados passam; nenhum estado deixa a pessoa sem elemento focável.

**Registro da Fase**:

- Status: Concluída
- Feito: estados da vitrine (carregando, erro, sem categorias, `aria-busy`) cobertos por `VodShowcaseScreen.test.tsx` (T026/T029); E2E `vitrine-filmes-series.mjs` completo, em 1920×1080 e 2200×1000, com SC-003 ("Todos" a 2 setas do foco inicial), 3ª linha nunca visível e rolagem por linha (T027/T040); **20 roteiros E2E migrados** para a vitrine com lista lateral e a grade sem trilha, via `e2e/lib/vod.mjs` (`openVodCategory`, `focusSideItem`, `focusFirstRealCategory`, `gotoRow`) (T028). A migração revelou uma regressão real: a 052 tinha perdido a pré-carga por foco/dica de seção da 038 (`carga-listas`) — restaurada (D-018).
- Contrato: `check-contract-tests.ps1 -Slug 052-vitrine-filmes-series` → 5/5 verdes, trava íntegra (regravada em 2026-10-03 após a emenda "lista lateral", com aprovação do usuário).
- Testes executados: `npx vitest run` (354 arquivos / 2445 testes verdes); `node e2e/run.mjs --jobs 3` (31/31; `historico-continuar-assistindo` falhou uma vez em paralelo e passou isolado — concorrência); `node e2e.mjs`; `npx tsc -b`; `npm run lint` sem erros.
- Pendências: o E2E live-tv-ds-v14 (Live, não desta feature) falhou em 2 de 4 rodadas paralelas completas e passou isolado 3/3 e em trio — aberto como R-019 (suspeita: o gesto de segurar OK sob carga), nunca como baseline ok.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: emenda dos contratos, gate de qualidade e documentação.

- [X] T030 **Emenda dos contratos travados (D-013, decisão do usuário já registrada)**: para cada um — `025` `MoviesScreen.filmes-series-ds-v14.contract.test.tsx`, `036` `VodCatalogScreen.limpar-historico.contract.test.tsx` (→ `VodCategoryScreen.limpar-historico…`, `target: history`), `049` `VodCatalogScreen.navegacao-por-pagina.contract.test.tsx`, `050` `MoviesScreen.paridade-v14.contract.test.tsx` — reescrever o teste nas telas novas **preservando o objetivo** (ordem pessoal ★/↺/Todos e memória por entrada na vitrine+categoria; remoção do histórico; paginação só na grade; hero com/sem capa, sem nada focável), apagar o arquivo antigo, regravar a trava da feature (`check-contract-tests.ps1 -Slug <slug> -Write -Paths …`) e anexar `R-00X` ("emendado pela 052, motivo, data") no `plan.md` daquela feature. Respeitar o orçamento de 5 testes por feature.
- [X] T031 Capturas **depois** de Live, Configurações, Busca e detalhes de filme/série comparadas às da T002 (SC-004: idênticas) e revisão lado a lado da vitrine com o protótipo/Component Lab (`#rails`, `#navigation`, `#categoriesv131`); registrar divergências assumidas em `plan.md` → Riscos e Decisões.
- [X] T032 Consultar `docs/guia-praticas-app-tv/` (foco, layout, rolagem) para a vitrine e registrar o que foi conferido (incl. teste de contraste do foco sobre capas claras/escuras — guia T07).
- [X] T033 Rodar `quickstart.md`.
- [X] T034 Documentação: `update-feature-status.ps1 -Slug 052-vitrine-filmes-series -Status Implementada`; `plan.md` → `## Estado Atual`/`Execution Notes`/`PRÓXIMO:`; backlog (`.planning/backlog.md`, sem editar a mão as colunas geradas); **não** acrescentar parágrafo de status ao `CLAUDE.md` (regra do repositório); nenhuma ADR alterada.

**Registro da Fase**:

- Status: Concluída
- Feito: T030 — as 4 travas (025, 036, 049, 050) foram emendadas e regravadas na Fase 5 (R-015); em 2026-10-03 as de 052, 049 e 050 voltaram a ser regravadas por decisões do usuário (lista lateral; Pesquisar/Ordenar nas grades). T031 — SC-004 por **escopo**: nada de Live/Configurações/Busca/detalhes/player foi editado (só `features/vod`, `App.tsx` (`vodShell`), `AppShell` — `hints` opcional, os demais continuam com rodapé — e tokens novos em `index.css`); os E2E dessas telas passam (`live-*`, `home-busca-configuracoes`, `player`, `e2e.mjs`). Sem capturas "antes" de Configurações/Busca/detalhes (como na 050). T032 — `docs/guia-praticas-app-tv/04` ("Em Filmes e Séries, usar categorias laterais e grade de pôsteres"; foco = contorno + realce, T07 contraste sobre capas claras/escuras) e `08` (foco único, volta restaura posição): a lista lateral e a grade seguem o guia; o foco da grade é anel + brilho interno sobre qualquer capa. T033 — `quickstart.md` reescrito para o desenho final e executado pelos E2E e pelo usuário na TV física. T034 — status Implementada e docs atualizados.
- Contrato: 12 travas íntegras (052, 025, 036, 049, 050, 018, 019, 022, 023, 024, 026, 046).
- Testes executados: os da Fase 6; `npx vitest run src/styles/tokens.test.ts` (74 verdes) após os tokens novos.
- Pendências: nenhuma.

---

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (integração) concluída
- [X] Fase 6 (US3) concluída
- [X] Testes de contrato (5 da 052 + os 4 amendados regravados) verdes na suíte completa e `check-contract-tests.ps1` íntegro para 052, 025, 036, 049, 050 e para 018, 019, 022, 023, 024, 026, 046
- [X] `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build` (e `npm run build:tizen` — conferir que o guard não reclama; reverter os artefatos de `CCPlayTv/` com `git checkout` se não forem parte da entrega)
- [X] `npm run test:e2e` completo (com `npm run dev` rodando e a porta 5173 conferida) antes de pedir qualquer passada na TV
- [X] `quickstart.md` executado com sucesso
- [X] Passada na TV física **não** é gate (como 048/050); fica como recomendação (custo da leitura de "Adicionados recentemente" em lista grande, R-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — a vitrine (US2) usa `recentlyAdded`/`SeeAllCard`; a categoria (US1) não depende dela
- **US1 (Phase 3)** e **US2 (Phase 4)**: dependem do Foundational; independentes entre si (arquivos distintos). A tela antiga (`VodCatalogScreen.tsx`) fica montada no `App` até a T024, então o app não quebra entre as fases.
- **Integração (Phase 5)**: depende de US1 e US2
- **US3 (Phase 6)**: depende da Fase 5
- **Polish (Phase 7)**: depende de todas

### Parallel Opportunities

- `[P]` = só testes/arquivos distintos; as edições de `VodCategoryScreen.tsx`, `vod.css` e `App.tsx` são sequenciais.

---

## Implementation Strategy

### MVP First (US1 + US2 + integração)

1. Setup → 2. Foundational → 3. US1 → 4. US2 → 5. Integração → **PARAR E VALIDAR** no localhost (a vitrine e a categoria) → 6. US3 → 7. Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar por fase, só com arquivos desta feature (a árvore tem trabalho sem commit de 048/049/050/051 — R-010).
- A hero **não** é focável e **não** tem ações; qualquer botão novo nela é regressão do contrato.
- A tela antiga (`VodCatalogScreen.tsx`) só é apagada na T024, depois de a integração da T023 estar no ar, para o app nunca ficar sem Filmes/Séries no meio do trabalho; os testes dela migram por cópia nas Fases 3/4 e os antigos são apagados junto, na T024.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

**Purpose**: fechar as lacunas entre a spec/plano e o que foi de fato construído (a vitrine e a grade evoluíram depois do plano, por decisão do usuário, e a documentação ficou para trás). Origem: `sdd-converge` de 2026-10-03. As tasks T026–T029 e T031–T034 das fases anteriores seguem no mesmo estado (T026/T029 estão cobertas por testes já existentes — marcar com a evidência; T031–T034 continuam pendentes e fecham a feature).

- [X] T035 [HIGH] Registrar a decisão do usuário (2026-10-03) de que **"Categorias" é a lista lateral da vitrine** (`.vod-side-panel` + `SideCategoryNav`, título "Filmes"/"Séries"), não uma fileira: emendar `spec.md` (FR-002, FR-005, US1, US2/AC4+AC7, edge case de 1 categoria) e `plan.md` (D-004, D-005 — hero na lista lateral, D-007/D-008 — ←/→ entre lista e fileiras, D-012 — a sidebar volta ao CSS) como **decisão registrada** (novo `D-015` + linha em `## Riscos e Decisões`), sem apagar o histórico. Origem: FR-002, FR-005, plan: D-004/D-012.
- [X] T036 [HIGH] Registrar a decisão do usuário (2026-10-03): **a topbar volta em Filmes/Séries (vitrine e categoria), sem o rodapé de dicas** (AppShell com hints opcional; ROW_HEIGHT 402px para manter 2 linhas inteiras sob a topbar). ↑ do alto da vitrine vai à barra Pesquisar/Ordenar e dali à topbar; trocar Filmes↔Séries/Busca/Configurações é direto. **Já implementado e coberto** por itrine-filmes-series.mjs e e2e.mjs — falta só emendar FR-006/FR-011/US3/AC1 (a topbar existe; o rodapé não) e registrar D-0xx. Origem: FR-006, FR-011.
- [X] T037 [HIGH] Registrar a decisão da **grade em 6 colunas fluidas coladas, pôster `cover` e foco por dentro do pôster** (vão `--space-1`, `ROW_HEIGHT` 428px, 2 linhas inteiras com o recorte de `clip-path` e rolagem por linha em `VodCategoryScreen.scrollToRow`; anel de 5px + brilho interno em `::before`, sem escala): emendar FR-007, SC-001 e D-011 ("capa inteira, nunca recorte" não vale mais — o recorte lateral é aceito) e a regra de foco com escala do V14 §11.1 para esta grade (anotar divergência assumida). Origem: FR-007, SC-001, plan: D-011.
- [x] T038 [LOW] **Pesquisar e Ordenar ficam nas grades (a tela de categoria, a "vitrine de cards"), como na spec (FR-006/FR-008); a tela de Filmes/Séries com hero e fileiras NÃO tem a barra.** Em 2026-10-03 a barra foi experimentada na tela de hero (com `VodTarget` com `intent`/`query`) e depois removida por decisão do usuário; o código e os testes voltaram ao modelo da spec (trava 052/049/050 regravadas de novo ao texto original). Nada a emendar na spec.
- [X] T039 [HIGH] `tv-web/src/styles/vod.css`: trocar os **literais de cor** dos blocos da 052 por tokens do V14 — `box-shadow: inset 0 0 24px rgba(255, 122, 61, 0.55)` (anel interno do foco na grade), `rgba(0, 0, 0, 0.85)` (degradê do título), `rgba(0, 0, 0, 0.9)` (sombra do título), `rgba(0, 0, 0, 0.35)` — por `--accent`/`--focus-glow`/token de scrim existente (ou criar o token em `index.css` com comentário). As larguras/alturas fixas da geometria (428/383/260px, mesmo padrão dos 205px da 009) ficam como estão, documentadas. Origem: FR-015, Constitution/ADR-007 ("novas telas consomem tokens, nunca cor literal").
- [X] T040 [MEDIUM] Completar o E2E `vitrine-filmes-series.mjs` (T027 ficou parcial): viewport 2200×1000 além de 1920×1080; medir **SC-003** (≤ 3 setas + OK da vitrine a uma grade, para qualquer fileira); trocar o assert "capa inteira" por "6 colunas fluidas, 2 linhas inteiras, **sem 3ª linha visível**, anel dentro do card"; cobrir a rolagem por linha (↓ por 3+ linhas mantém 2 linhas inteiras). Origem: SC-001, SC-003, FR-012.
- [X] T041 [LOW] Marcar T026 e T029 com a evidência (estados da vitrine: carregando, erro, sem categorias, `aria-busy` — `VodShowcaseScreen.test.tsx` "categorias carregando, com erro e sem nenhuma categoria"; contrato `sem dado… foco na lista lateral`) e fechar o `## Registro da Fase` 6 (T028 concluída: 20 roteiros migrados, `e2e/lib/vod.mjs`, E2E 31/31, 2026-10-03). Origem: FR-013, T026/T029.
- [X] T042 [LOW] Limpar o que ficou **sem uso**: CATEGORY_CARD_WIDTH/CATEGORY_CARD_HEIGHT/isCategories na vitrine e o CSS .vod-category-card* (a topbar voltou — shell/zone/withShell **ficam**). Origem: plan: D-008 (dead code).
- [X] T043 [LOW] Registrar no `plan.md` (`D-010`/`R-017`) que a pré-carga por foco (`useCategoryFocusPrefetch` + `usePrefetchHint`) **foi restaurada** na vitrine e na tela de categoria (o plano mandava remover a de trilha; a 052 a tinha perdido e o E2E `carga-listas` — renovação de categoria vencida — pegou). Origem: plan: D-010, feature 038.
- [X] T044 Depois de T035–T043: rodar `npx tsc -b`, `npm run lint`, `npm run test`, `node e2e/run.mjs --jobs 3`, `check-contract-tests.ps1` (052 e as 11 travas vizinhas), e seguir com **T031–T034** (capturas SC-004, guia Tizen, quickstart, status/backlog) para a feature fechar como Implementada e depois `sdd-converge` de novo.

**Registro da Fase**:

- Status: Concluída
- Feito: T035–T038/T043 — decisões pós-spec registradas em `spec.md` ("Emendas pós-execução" E-1..E-5), `plan.md` (D-015..D-018, R-016..R-018, Estado Atual, Execution Notes) e `logic/vitrine-e-foco.md`; a topbar voltou (sem rodapé), a grade é fluida em 6 colunas com 2 linhas inteiras e foco por dentro; Pesquisar/Ordenar ficam nas grades (T038: a barra na tela de hero foi experimentada e removida). T039 — `--scrim-media`, `--text-shadow-media` (novos) e `--accent-tint-border` substituem os literais de cor de `vod.css`. T040 — E2E em 1920×1080 e 2200×1000 com SC-003, 3ª linha e rolagem por linha. T041 — T026/T029 marcadas. T042 — removidos `CATEGORY_CARD_*`, o ramo `isCategories`, o cartão de categoria e o CSS `.vod-category-card*` (`shell`/`zone` ficam: a topbar voltou). T044 — gates abaixo.
- Contrato: 5/5 verdes, trava íntegra.
- Testes executados: `npx tsc -b` limpo; `npx vitest run` (2445 verdes); `node e2e/run.mjs --jobs 3` e `node e2e.mjs` verdes; `E2E_W=2200 E2E_H=1000 node e2e/vitrine-filmes-series.mjs` verde.
- Pendências: o E2E live-tv-ds-v14 (Live, não desta feature) falhou em 2 de 4 rodadas paralelas completas e passou isolado 3/3 e em trio — aberto como R-019 (suspeita: o gesto de segurar OK sob carga), nunca como baseline ok.