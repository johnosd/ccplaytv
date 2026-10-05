---
description: "Tasks da feature 059 — detalhe de filme e de série no layout Cinema"
---

# Tasks: Detalhe de filme e de série no layout Cinema do Design System

**Input**: `sdd/specs/059-detalhe-cinema-filme-serie/` — `spec.md`, `plan.md`, `logic/*.md`, `quickstart.md`

**Prerequisites**: plan.md, spec.md, logic/hero-cinema.md, logic/semelhantes-duas-linhas.md, logic/cor-da-capa.md

**Organization**: Setup → Fundação (regras puras + componentes de apresentação) → US1 (filme) → US2 (série) → US3 (abas) → Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1, US2, US3

## Path Conventions

- Frontend único em `tv-web/`; comandos de teste rodam de `tv-web/`; scripts `.planning/` rodam da raiz.
- Telas: `tv-web/src/features/movies/MovieDetailScreen.tsx`, `tv-web/src/features/series/SeriesDetailScreen.tsx`.
- Peças compartilhadas do detalhe: `tv-web/src/features/vod/`.
- Regra de cor: `tv-web/src/lib/color/`.
- Textos: `tv-web/src/lib/i18n/messages/detail.ts` (pt é a base; en e es obrigatórios).
- CSS: bloco novo ao FIM de `tv-web/src/styles/vod.css`.
- E2E: `tv-web/e2e/*.mjs` (runner `tv-web/e2e/run.mjs`, dev server na 5173).

---

## Phase 1: Setup

**Purpose**: textos novos e o esqueleto do CSS.

- [X] T001 [P] Chaves novas em `tv-web/src/lib/i18n/messages/detail.ts` (pt/en/es): `detail.remaining` ("faltam {time}" / "{time} left" / "quedan {time}"), `detail.chips` ("Categoria e gêneros" / "Category and genres" / "Categoría y géneros"), `detail.meta.seasons` ("{n} temporadas", com forma singular para n=1, nas três línguas), `detail.similar.missingRow` ("Não encontrados na sua lista" / "Not found in your list" / "No encontrados en tu lista"), `detail.similar.noneInList` ("Nenhum título semelhante está na sua lista." + en/es), `detail.origin.source` ("Dados: fonte" / "Data: source" / "Datos: fuente"). Reusar `person.inList` para o título "Na sua lista". FR-023
- [X] T002 [P] Abrir o bloco "Detalhe Cinema (feature 059)" ao fim de `tv-web/src/styles/vod.css` com as custom properties locais `--detail-cover-width: 400px`, `--detail-cover-height: 600px`, `--detail-hero-height: 860px` (`logic/hero-cinema.md` §1). Só acrescentar, nunca reeditar regras antigas.

**Checkpoint**: textos e esqueleto prontos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: regras puras, hook e componentes de apresentação usados pelas três stories.

**⚠️ CRITICAL**: nenhuma story começa antes desta fase.

### Contrato da Fase

- `primaryProgress — contrato da feature 059 › só há progresso com posição de retomada válida E duração conhecida…` — FR-007, SC-003
- `dominantColorFromPixels — contrato da feature 059 › ignora transparente, preto e branco…` — FR-002, SC-001
- Comando (de `tv-web/`): `npx vitest run src/features/vod/detailProgress.detalhe-cinema.contract.test.ts src/lib/color/coverColor.detalhe-cinema.contract.test.ts`

### Implementation

- [X] T003 [P] Implementar `primaryProgress` em `tv-web/src/features/vod/detailProgress.ts` (`logic/hero-cinema.md` §3; usar `isResumable`) → contrato: `primaryProgress — …`
- [X] T004 [P] Implementar `dominantColorFromPixels` em `tv-web/src/lib/color/coverColor.ts` (`logic/cor-da-capa.md` §2) → contrato: `dominantColorFromPixels — …`
- [X] T005 Criar `useCoverColor(url)` em `tv-web/src/features/vod/useCoverColor.ts` (`logic/cor-da-capa.md` §1): cache por URL, `crossOrigin='anonymous'`, canvas 16×16, `try/catch`, cancelamento, **nenhum log/erro com a URL**. FR-002, FR-021, FR-024
- [X] T006 [P] Criar `movePanelFocus` em `tv-web/src/features/vod/detailPanelGrid.ts` (`logic/semelhantes-duas-linhas.md` §2). FR-016
- [X] T007 [P] Criar `tv-web/src/features/vod/DetailActions.tsx`: `DetailPrimaryAction` (rótulo como nó de texto direto + bloco de progresso com `role="progressbar"` e "faltam") e `DetailIconAction` (`role="button"`, `span` de ícone `aria-hidden`, rótulo como nó de texto direto, `tv-focus`/`is-soft-disabled`/`aria-disabled` no mesmo elemento) com os 6 SVGs locais; classe `vod-detail-action` em todas (`logic/hero-cinema.md` §3–§4, D-002, D-010). FR-007, FR-008
- [X] T008 [P] Criar `tv-web/src/features/vod/DetailChips.tsx`: `ul[aria-label=detail.chips]` com a categoria em 1º (`--category`) e os gêneros divididos por vírgula; `OriginTag` fora da lista (`logic/hero-cinema.md` §5, D-006). FR-004, FR-005
- [X] T009 Criar `tv-web/src/features/vod/DetailHero.tsx`: `vod-detail-ambient` (sempre presente, `--detail-ambient` só quando há cor) + `DetailBackdrop` + `vod-detail-scrim` + `vod-detail-poster` com `PosterArt` e selo "✓ Assistido" opcional + `vod-detail-info` (eyebrow, `.vod-detail-title`, meta, chips, sinopse, ações). Chama `useCoverColor(posterUrl)`. Nada de estilo no `.screen` (D-005). FR-001, FR-002, FR-003, FR-025
- [X] T010 CSS do hero no bloco da 059 em `tv-web/src/styles/vod.css`: hero sangrando o padding do `.screen` com `--safe-x`/`--safe-y`; altura `--detail-hero-height`; ambiente com `radial-gradient(var(--detail-ambient, <token neutro>))`; vinheta à esquerda e na base; capa `--detail-cover-*` com brilho `var(--detail-ambient, …)`; título em até 2 linhas com elipse; sinopse em 3 linhas; primária clara com barra; ícones redondos (círculo com anel de foco, rótulo transparente fora do foco); chips com a categoria em tom de acento. Só tokens; sem `blur`. FR-001, FR-003, FR-011, FR-022

### Testes da Fase

- [X] T011 [P] `tv-web/src/features/vod/detailPanelGrid.test.ts`: ←/→ param na ponta, ↓/↑ mantêm a coluna limitada, ↑ na 1ª linha dá `exit-up`, ↓ na última dá `stay`, linha única
- [X] T012 [P] `tv-web/src/features/vod/useCoverColor.test.tsx` (precisa de DOM/JSX — `.tsx`): sem URL → `null`; erro/`SecurityError` simulado → `null` e nenhum `console.*` com a URL (spy); cache não relê a mesma URL
- [X] T013 [P] `tv-web/src/features/vod/DetailActions.test.tsx`: `getByText(rótulo)` devolve o próprio elemento focável (com `tv-focus`/`is-soft-disabled`); progresso só com `progress` não nulo; nome acessível presente (`findUnnamedControls`)

**Critério de Conclusão**: `npx vitest run src/features/vod/detailProgress.detalhe-cinema.contract.test.ts src/lib/color/coverColor.detalhe-cinema.contract.test.ts` → 2/2 verdes e `check-contract-tests.ps1 -Slug 059-detalhe-cinema-filme-serie` íntegro; T011–T013 verdes; `npx tsc -b` limpo. Os componentes ainda não estão em nenhuma tela.

**Checkpoint**: fundação pronta.

**Registro da Fase**:

- Status: Concluída (2026-10-05)
- Feito: `primaryProgress` e `dominantColorFromPixels` implementados sobre os stubs; `useCoverColor` (cache por URL, `crossOrigin='anonymous'`, canvas 16×16, falha silenciosa sem expor a URL, `readCoverColor` exportado para teste); `movePanelFocus`; `DetailActions` (primária com barra/`faltam` e ícone com rótulo como texto direto, 8 ícones SVG locais); `DetailChips` (categoria 1º, gêneros sem repetir a categoria, origem fora da lista); `DetailHero` (ambiente → backdrop → vinheta, capa `PosterArt`, `--detail-ambient` só no hero); CSS do hero no bloco da 059 (ambiente com `opacity` porque o piso chrome108 não tem `color-mix`; anel de foco do ícone no círculo). Selo de assistido na capa ficou só com o glifo ✓ (R-009).
- Contrato: `npx vitest run src/features/vod/detailProgress.detalhe-cinema.contract.test.ts src/lib/color/coverColor.detalhe-cinema.contract.test.ts` → 2/2 verdes, trava íntegra.
- Testes executados: os 2 contratos + `detailPanelGrid.test.ts` (4) + `useCoverColor.test.tsx` (5) + `DetailActions.test.tsx` (3) → 14/14 verdes, 1ª iteração; `npx tsc -b` limpo; `oxlint` sem aviso nos arquivos novos.
- Pendências: nenhuma. Os componentes ainda não estão ligados às telas (Fases 3 e 4).

---

## Phase 3: User Story 1 - Hero Cinema no detalhe do filme (Priority: P1) 🎯 MVP

**Objetivo**: o detalhe do filme abre com o hero Cinema, a primária com progresso real e as ações em ícone.

**Independent Test**: abrir filmes com/sem backdrop, com/sem posição salva, com/sem duração; percorrer as ações com o controle.

### Contrato da Fase

- `MovieDetailScreen — contrato da feature 059 (detalhe Cinema) › retomada com duração conhecida: primária focada com barra e "faltam"…` — US1/AC3–AC6, FR-004/006/007/008/009
- Contratos que precisam continuar verdes: 032 (`MovieDetailScreen.metadata-tmdb.contract.test.tsx`), 033 (`MovieDetailScreen.trailers.contract.test.tsx`)
- Comando (de `tv-web/`): `npx vitest run src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx src/features/movies/MovieDetailScreen.trailers.contract.test.tsx` — nesta fase, o caso "Semelhantes em duas linhas" do 1º arquivo continua vermelho (fecha na Fase 5)

### Implementation

- [X] T014 [US1] `tv-web/src/features/movies/MovieDetailScreen.tsx`: trocar o bloco `vod-detail-hero` por `DetailHero`; primária via `DetailPrimaryAction` com `primaryProgress(userState.progressSeconds, metadata?.durationSeconds?.value)`; demais ações via `DetailIconAction` mantendo `buildActions`, `actionLabel`, `trailerActionLabel` e os handlers de `onSelect` intactos; meta = ano · `formatDurationMinutes` · `RatingBadge` · ✓ Assistido (categoria sai da meta e vai para `DetailChips`); selo "✓ Assistido" na capa → contrato: `retomada com duração conhecida…`. FR-004, FR-006, FR-007, FR-008, FR-009, FR-010
- [X] T015 [US1] Mesmo arquivo: efeito que zera o `scrollTop` da raiz `.vod-detail` (ref) quando `row` ∈ {`more`, `actions`, `tabs`} (`logic/hero-cinema.md` §6). FR-017
- [X] T016 [US1] Atualizar testes existentes NÃO travados que dependiam do layout antigo do filme (categoria na meta, estrutura do hero): `tv-web/src/features/movies/MovieDetailScreen.test.tsx`, `MovieDetailScreen.metadata.test.tsx`, `MovieDetailScreen.limpar-historico.test.tsx` — só o necessário, citando a 059 (R-007)

### Testes da Fase

- [X] T017 [P] [US1] `tv-web/src/features/movies/MovieDetailScreen.detalhe-cinema.test.tsx`: sem backdrop o `vod-detail-ambient` existe e a raiz `.screen` não recebe `style` (FR-025); com backdrop quebrado (`onError`) nada some além da imagem; "✓ Assistido" aparece na capa e na meta ao marcar e some ao desmarcar; ↑ das abas volta à última ação focada (não à primária)

**Critério de Conclusão**: o comando do contrato acima → `retomada com duração conhecida…` verde, 032 e 033 verdes, `check-contract-tests.ps1` íntegro para 059/032/033; `npx vitest run src/features/movies` verde (exceto o teste de Semelhantes da 059 e o da 035, que fecham na Fase 5); revisão manual no navegador com um filme real com e sem backdrop.

**Checkpoint**: US1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-05)
- Feito: T014 `MovieDetailScreen` usa `DetailHero` (meta = ano · duração da metadata · nota · assistido; categoria só no chip), primária via `DetailPrimaryAction` com `primaryProgress(progressSeconds, metadata.durationSeconds)` e ícones via `DetailIconAction` (`actionIcon` novo; `buildActions`/`actionLabel`/`trailerActionLabel`/handlers intocados); T015 `rootRef` + efeito que zera `scrollTop` em `more`/`actions`/`tabs`; T016 nenhum teste antigo precisou de ajuste (50/50 seguiram verdes); T017 `MovieDetailScreen.detalhe-cinema.test.tsx` (5 casos).
- Contrato: `npx vitest run src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx src/features/movies/MovieDetailScreen.trailers.contract.test.tsx` → hero 1/1 verde, 032 1/1, 033 1/1; o caso "Semelhantes em duas linhas" segue vermelho (Fase 5, esperado). Travas 059/032/033/035 íntegras.
- Testes executados: `npx vitest run src/features/movies` → 50 verdes + os 2 de Semelhantes vermelhos esperados (059 e 035 emendado); `MovieDetailScreen.detalhe-cinema.test.tsx` 5/5, 1ª iteração; `npx tsc -b` limpo; `oxlint` sem aviso novo (o de `panelRef` na linha do painel é anterior à 059).
- Pendências: a revisão visual no navegador com um filme real ficou para o roteiro E2E com capturas (T030), que monta dados de fixture; nada aberto no código.

---

## Phase 4: User Story 2 - O mesmo hero no detalhe da série (Priority: P2)

**Objetivo**: a série usa o mesmo hero, com a barra do episódio em andamento.

**Independent Test**: abrir séries com e sem episódio em andamento; percorrer as ações.

### Contrato da Fase

- `SeriesDetailScreen — contrato da feature 059 (detalhe Cinema) › episódio em andamento com duração conhecida…` — US2/AC1+AC3, FR-007/008/009
- Comando (de `tv-web/`): `npx vitest run src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx`

### Implementation

- [X] T018 [US2] `tv-web/src/features/series/SeriesDetailScreen.tsx`: trocar o hero por `DetailHero` (capa via `PosterArt`, sem `ContentCard`); primária via `DetailPrimaryAction` com `primaryProgress(primary.resumeSeconds, primary.episode.duration_seconds)` só quando `primary.kind === 'resume'`; ações via `DetailIconAction` mantendo `buildActions`/handlers; meta = ano · `detail.meta.seasons` · progresso x/y ou "em dia" · `RatingBadge`; chips via `DetailChips` → contrato: `episódio em andamento…`. FR-007, FR-008, FR-009, FR-010
- [X] T019 [US2] Mesmo arquivo: efeito de `scrollTop = 0` para `row` ∈ {`more`, `actions`, `tabs`} (sem afetar `season`/`episodes`/`panel`). FR-017
- [X] T020 [US2] Atualizar testes NÃO travados da série que dependiam do hero antigo: `SeriesDetailScreen.test.tsx`, `SeriesDetailScreen.metadata.test.tsx`, `SeriesDetailScreen.limpar-historico.test.tsx` (R-006/R-007)

### Testes da Fase

- [X] T021 [P] [US2] Em `tv-web/src/features/series/SeriesDetailScreen.detalhe-cinema.test.tsx`: série sem nada assistido mostra "▶ Assistir T1:E1" sem barra; episódio em andamento sem `duration_seconds` mostra "Continuar" sem barra; autoplay/contagem e seletor de temporada continuam funcionando (um caso de fumaça)

**Critério de Conclusão**: `npx vitest run src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx` → 1/1 verde e trava íntegra; `npx vitest run src/features/series` verde; revisão no navegador com uma série real.

**Checkpoint**: US1 e US2 funcionando juntas.

**Registro da Fase**:

- Status: Concluída (2026-10-05)
- Feito: T018 `SeriesDetailScreen` usa `DetailHero` (capa via `PosterArt`, sem `ContentCard`; meta = ano · "N temporadas" · progresso x/y ou "em dia" · nota; categoria só no chip), primária com `primaryProgress(primary.resumeSeconds, primary.episode.duration_seconds)` só em `kind === 'resume'`, ícones via `DetailIconAction` (`actionIcon` novo; `buildActions`/handlers intocados); T019 `rootRef` + efeito de `scrollTop = 0` em `more`/`actions`/`tabs`; T020 nenhum teste antigo precisou de ajuste; T021 `SeriesDetailScreen.detalhe-cinema.test.tsx` (3 casos).
- Contrato: `npx vitest run src/features/series/SeriesDetailScreen.detalhe-cinema.contract.test.tsx` → 1/1 verde, trava íntegra.
- Testes executados: `npx vitest run src/features/series` → 105/105 (inclui o contrato); `SeriesDetailScreen.detalhe-cinema.test.tsx` 3/3, 1ª iteração; `npx tsc -b` limpo; `oxlint` sem aviso novo (o de `useVirtualizer` é anterior).
- Pendências: revisão visual com uma série real fica para o roteiro E2E com capturas (T030).

---

## Phase 5: User Story 3 - Abas renovadas e Semelhantes em duas linhas (Priority: P3)

**Objetivo**: Detalhes em cartões, Elenco com foto redonda maior, Semelhantes em duas linhas com navegação 2D.

**Independent Test**: em filme e série, percorrer Detalhes, Elenco e Semelhantes com e sem chave TMDB, com listas cheias e vazias.

### Contrato da Fase

- `MovieDetailScreen — contrato da feature 059 (detalhe Cinema) › Semelhantes em duas linhas tituladas…` — US3/AC4–AC6, FR-014/015/016
- `MovieDetailScreen — contrato da feature 035 › encontrado abre o detalhe com o snapshot…` (emendado, D-009) e `› sem chave: explica e oferece "Configurar TMDB"…`
- Comando (de `tv-web/`): `npx vitest run src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx`

### Implementation

- [X] T022 [US3] `tv-web/src/features/vod/SimilarPanel.tsx`: estado `ready` em duas `section` com `h3` (`person.inList` / `detail.similar.missingRow`); 1ª vazia vira `p` não focável (`detail.similar.noneInList`); 2ª só se houver não encontrados; cartões sem selo visível, com `sr-only` `t(NOT_FOUND_KEY)` nos não encontrados; manter `.similar-row`, `.similar-card`, `data-similar-key`, o `scrollIntoView`, a cobertura e todos os estados (`logic/semelhantes-duas-linhas.md` §1, D-007) → contratos: `Semelhantes em duas linhas…`, 035. FR-014, FR-015, FR-020
- [X] T023 [US3] `tv-web/src/features/movies/MovieDetailScreen.tsx`: `panelRows` + `movePanelFocus` no ramo `row === 'panel'`; `panelKeys = panelRows.flat()` para restauração, `useEnterSimilarPanel` e o ↓ das abas (`logic/semelhantes-duas-linhas.md` §2, D-008) → contratos: `Semelhantes em duas linhas…`, 035. FR-016, FR-018, FR-019
- [X] T024 [US3] `tv-web/src/features/series/SeriesDetailScreen.tsx`: mesma grade no ramo `panel` (Elenco/Semelhantes), sem tocar em `season`/`episodes`. FR-016, FR-018, FR-019
- [X] T025 [US3] Aba Detalhes em cartões, filme e série: origem em cada cartão pela tabela de `logic/hero-cinema.md` §7 ("Dados: TMDB" / "Dados: fonte"; Tipo e Progresso sem selo), via `FactOrigin` ou parâmetro de `MetadataFacts` em `tv-web/src/features/vod/DetailMetadata.tsx`, **sem** mudar o `OriginTag` global; ajustar os fatos fixos em `MovieDetailScreen.tsx` e `SeriesDetailScreen.tsx`; CSS no bloco da 059 em `vod.css`: `.vod-detail-facts` em grade (4 colunas), categoria em tom de acento, origem no canto. FR-012, D-006
- [X] T026 [P] [US3] CSS (bloco da 059): Elenco com foto redonda maior só dentro do detalhe (`.vod-detail .cast-person .person-photo`), sem afetar o cabeçalho da `PersonScreen`; títulos das linhas de Semelhantes e opacidade dos não encontrados até o foco. FR-013, FR-014
- [X] T027 [US3] Atualizar testes NÃO travados de Semelhantes/Elenco: `tv-web/src/features/vod/SimilarPanel.test.tsx`, `SeriesDetailScreen.semelhantes.test.tsx`, `SeriesDetailScreen.elenco.test.tsx`, `MovieDetailScreen.elenco.test.tsx` (selo visível → `sr-only`; navegação → por linha)

### Testes da Fase

- [X] T028 [P] [US3] Em `tv-web/src/features/series/SeriesDetailScreen.semelhantes.test.tsx` (ou arquivo novo `.detalhe-cinema.test.tsx` da série): duas linhas e ↓/↑ na série; restauração por `focusKey` de um cartão da 2ª linha
- [X] T029 [P] [US3] Em `SimilarPanel.test.tsx`: estados `loading`/`no_key`/`no_match`/`unavailable`/`empty` sem mudança de texto; "Configurar TMDB" continua o único focável em `no_key`
- [X] T029a [P] [US3] Em `tv-web/src/features/movies/MovieDetailScreen.detalhe-cinema.test.tsx` (e no equivalente da série): na aba Detalhes, fato do TMDB mostra "Dados: TMDB", fato do provedor e Categoria/Ano mostram "Dados: fonte", Progresso não tem selo; no hero, dado do provedor continua sem selo (regra da 032)

**Critério de Conclusão**: o comando do contrato acima → 4/4 verdes (2 da 059 nesta tela + 2 da 035) e travas da 059 e da 035 íntegras; `npx vitest run src/features/movies src/features/series src/features/vod src/features/person` verde.

**Checkpoint**: as três stories funcionando juntas.

**Registro da Fase**:

- Status: Concluída (2026-10-05)
- Feito: T022 `SimilarPanel` em duas `section` com `h3` ("Na sua lista" / "Não encontrados na sua lista"), 1ª vazia vira frase não focável, 2ª só com não encontrados, cartões sem selo visível (`sr-only` no não encontrado); `splitSimilar` e `detailPanelRows` em `detailPanelGrid.ts` (desenho e foco usam a mesma separação); T023/T024 `panelRows` + `movePanelFocus` nas duas telas (`panelKeys = panelRows.flat()` para restauração/entrada); T025 `FactOrigin` ("Dados: TMDB"/"Dados: fonte") nos cartões via `MetadataFacts` e nos fatos fixos — `OriginTag` global intocado — e CSS de grade; T026 CSS de Elenco maior só dentro do detalhe, títulos das linhas e opacidade dos não encontrados até o foco (`:has`); T027 3 testes antigos ajustados (`MovieDetailScreen.metadata.test.tsx`, `SeriesDetailScreen.metadata.test.tsx`: valor = 1º nó do `<dd>`; `SeriesDetailScreen.semelhantes.test.tsx`: → virou ↓); T028/T029/T029a testes novos.
- Contrato: `npx vitest run src/features/movies/MovieDetailScreen.detalhe-cinema.contract.test.tsx src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx` → 4/4 verdes (2 da 059 + 2 da 035 emendado); travas 059/035/032/033 íntegras.
- Testes executados: `npx vitest run src/features/movies src/features/series src/features/vod src/features/person src/lib/color` → 358/358 (60 arquivos), após uma iteração (3 testes antigos ajustados, citando a 059); `npx tsc -b` limpo; `oxlint` sem aviso novo.
- Pendências: revisão visual das abas fica para o E2E com capturas (T030).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, build, quickstart, TV física e documentação.

- [X] T030 Criar `tv-web/e2e/detalhe-cinema.mjs` (padrão dos roteiros existentes, dados semeados, capturas em `tv-web/test-results/detalhe-cinema/`): filme com backdrop + retomada (barra e "faltam" visíveis); filme sem backdrop (ambiente presente); rótulo do ícone aparece só no foco; fileira de abas inteira acima de y=1080 sem rolar (FR-011); série com episódio em andamento; Semelhantes com duas linhas e ↓/↑; ↑ das abas devolve a página ao topo (FR-017); abrir o player e conferir que nada do hero fica visível (FR-025); **medir SC-007** (resolve A-002): tempo entre o OK no cartão da vitrine e a primária com `tv-focus` ≤ 1000 ms, em dois casos — capa servida com CORS (cor resolvida) e capa servida **sem** CORS via `page.route` (cor falha) — registrando os dois tempos no log do roteiro. Na TV (T036), repetir a medição por cronômetro/captura e anotar em `plan.md`
- [X] T031 Ajustar E2E existentes afetados (R-001, R-006): `filmes-series-ds-v14.mjs`, `catalogo-em-blocos.mjs`, `home-busca-configuracoes.mjs`, `historico-continuar-assistindo.mjs`, `limpar-historico.mjs`, `trailers.mjs`, `semelhantes-elenco-ator.mjs` — igualdade de `textContent` da primária vira `startsWith`/`includes`; seletores de Semelhantes por linha
- [X] T032 Revisão de segredos: nenhuma URL de capa/backdrop em `console.*`, mensagem de erro ou texto visível (grep em `useCoverColor.ts`, `DetailHero.tsx`). FR-024
- [X] T033 Gates locais (de `tv-web/`): `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build` (e `npm run build:tizen` — nenhum arquivo emitido novo é esperado; se a guarda de `tizenFiles.mjs` reclamar, listar o arquivo)
- [X] T034 `npm run test:e2e` completo com `npm run dev` na 5173 (constitution: antes da TV) — 38/39 na rodada completa (280 s, 3 em paralelo); `metadata-tmdb` falhou por D-006 ("Dados: fonte" nos cartões), ajustado e reexecutado isolado: verde. Também ajustado `semelhantes-elenco-ator` (T031).
- [X] T035 Executar `quickstart.md` no navegador — feito por meio do Chromium do E2E com dados fictícios e capturas revisadas (`test-results/detalhe-cinema/`): cenários 1, 2, 3, 4, 5, 6, 7, 11 e 12 em `detalhe-cinema.mjs`; 8, 9 e 10 em `semelhantes-elenco-ator.mjs` + contratos; 13 (idioma) pelas chaves pt/en/es tipadas e `src/lib/i18n` verde. **Com lista real, só na passada da TV (T036).**
- [ ] T036 Passada na TV física com o skill `tizen-tv` (**gate**, D-012): legibilidade com backdrops reais claros e escuros, capas com e sem cor, fluidez de rolagem, foco e rótulos dos ícones, abas na 1ª tela, player sem nada do hero por cima. SC-008
- [ ] T037 Docs: `plan.md` (Estado Atual, Execution Notes, PRÓXIMO, Arquivos Principais), `update-feature-status.ps1 -Slug 059-detalhe-cinema-filme-serie -Status Implementada`; **não** editar `CLAUDE.md`; conferir se a Spec V14/protótipo ainda batem com o que foi feito (ajustar a Spec só se o executor mudou alguma regra, com aviso ao usuário)

### Checklist de Release

- [X] Fase 2 (Fundação) concluída
- [X] Fase 3 (US1 — filme) concluída
- [X] Fase 4 (US2 — série) concluída
- [X] Fase 5 (US3 — abas) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 059, 035, 032 e 033
- [X] `npm run test`, `tsc -b`, `lint`, `build` verdes
- [X] `npm run test:e2e` completo verde (incluindo `detalhe-cinema.mjs`)
- [X] Textos novos em pt/en/es
- [X] Revisão de segredos (T032)
- [X] `quickstart.md` executado com sucesso
- [ ] Passada na TV física aprovada (gate, D-012) — ou decisão explícita do usuário registrada em Riscos e Decisões

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências
- **Fundação (Fase 2)**: depende do Setup — bloqueia as stories
- **US1 (Fase 3)**: depende da Fundação
- **US2 (Fase 4)**: depende da Fundação; pode rodar depois ou em paralelo à US1 (arquivo de tela diferente), mas o CSS do hero (T010) é comum
- **US3 (Fase 5)**: depende da Fundação; T023 depende de T014 (mesmo arquivo), T024 depende de T018
- **Polish (Fase 6)**: depende das três stories

### Parallel Opportunities

- T001 ∥ T002; T003 ∥ T004 ∥ T006 ∥ T007 ∥ T008; T011 ∥ T012 ∥ T013
- T017 ∥ T021 ∥ T028 ∥ T029 (arquivos de teste diferentes)
- T025 ∥ T026 são o mesmo arquivo (`vod.css`) — fazer em sequência apesar do [P] lógico; T002/T010/T025/T026 nunca ao mesmo tempo

---

## Parallel Example: Fundação

```bash
Task: "T003 [P] primaryProgress em tv-web/src/features/vod/detailProgress.ts"
Task: "T004 [P] dominantColorFromPixels em tv-web/src/lib/color/coverColor.ts"
Task: "T006 [P] movePanelFocus em tv-web/src/features/vod/detailPanelGrid.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Fase 1 + Fase 2
2. Fase 3 (filme)
3. **Parar e validar** no navegador com um filme real

### Incremental Delivery

1. Fundação → US1 (filme) → validar
2. US2 (série) → validar
3. US3 (abas) → validar; os contratos de Semelhantes (059 e 035) ficam verdes aqui
4. Polish (E2E → TV física)

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar por task ou grupo coerente; os contratos travados nunca são editados
- O contrato emendado da 035 fica vermelho até a Fase 5 — esperado (R-002)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
