---
description: "Lista de tasks da feature 056 — fileira Bem avaliados em Filmes e Séries"
---

# Tasks: Fileira "Bem avaliados" em Filmes e Séries

**Input**: Documentos de design de `sdd/specs/056-bem-avaliados/`

**Prerequisites**: plan.md, spec.md, `logic/bem-avaliados.md`, `contract-tests.lock` (5 contratos travados)

**Organization**: Tasks agrupadas por user story. Os 5 contratos já existem e estão travados: o executor **não** os escreve nem edita.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)

## Path Conventions

- Código do app em `tv-web/src/` (`features/vod/`, `features/catalog/`, `lib/`, `styles/`), testes ao lado do código.
- E2E em `tv-web/e2e/` (Playwright, registrar em `SUITE` de `tv-web/e2e/run.mjs`).
- Documentos em `sdd/specs/056-bem-avaliados/` e `.planning/backlog.md`.
- **Finais de linha**: vários arquivos são CRLF (`catalogApi.ts`, `vodSort.ts`, `VodShowcaseScreen.tsx`, `comingSoon.ts`) e `vodShowcase.ts` é misto;
  edite com a ferramenta Edit ou em binário e confira `git diff --stat` (lição da 055). Nunca regrave o arquivo inteiro com Python.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: linha de base de desempenho antes de mexer na tela (SC-004).

- [X] T001 Medir a linha de base da abertura da tela hero de Filmes/Séries na lista real: `cd tv-web; node e2e/carga-listas-real.mjs 3 2` (credenciais do `.env`, nunca impressas); anotar os números em `plan.md` → `Execution Notes`.
- [X] T002 Conferir as travas: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 056-bem-avaliados` (íntegra) e rodar os 5 contratos para ver os 5 vermelhos.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a regra pura (seleção, ordenação, descritores de fileira). Bloqueia as stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `topRated: nota decrescente, empate pelo mais recente, …` — US1/AC1-AC2, US3/AC2, FR-002, FR-003
- `buildShowcaseRows: com nota a fileira "rated" é de itens, …` — US3/AC1, FR-001, FR-003, FR-009
- `sortVodItems("rating"): …` — US2/AC1, US2/AC3, FR-007, FR-008
- Comando: `cd tv-web; npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts`

### Implementation

- [X] T003 [US1] Implementar `pickTopRated` (genérica, buffer ordenado de tamanho `limit`, `validCount`) e `topRated` em `tv-web/src/features/vod/vodShowcase.ts`, conforme `logic/bem-avaliados.md` §1 → contrato: `topRated: nota decrescente…`
- [X] T004 [P] [US2] Implementar `sortVodItems(items, 'rating')` em `tv-web/src/features/vod/vodSort.ts` (comparador concordante com `pickTopRated`; `availableSortOptions` intacto), `logic/bem-avaliados.md` §2 → contrato: `sortVodItems("rating")…`
- [X] T005 [P] [US1] `buildShowcaseRows` em `tv-web/src/features/vod/vodShowcaseRows.ts`: usar `hasRated` (linha `rated` de itens entre `added` e `because`, `seeAll: {kind:'all', sort:'rating'}`, `slotId: null`; ausente quando falso/`undefined`; o slot `vod-rated` deixa de ser gerado) → contrato: `buildShowcaseRows: com nota a fileira "rated"…`

### Testes da Fase

- [X] T006 [P] [US1] Testes adicionais em `tv-web/src/features/vod/vodShowcase.bem-avaliados.test.ts` (arquivo novo, fora da trava): `pickTopRated` sobre registros genéricos, `validCount` conta todos os válidos, `limit` 0 → `[]`, empate total estável, entrada vazia, nota `10` e `0.1` válidas, `10.01` inválida.

**Critério de Conclusão**: `cd tv-web; npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts` → 3/3 verdes, `check-contract-tests.ps1 -Slug 056-bem-avaliados` íntegro, `npx tsc -b` limpo.

**Checkpoint**: regra pura pronta e testada.

**Registro da Fase** (Fases 1 e 2 fechadas juntas; a 1 é só medição):

- Status: Concluída (2026-10-03)
- Feito: T001 linha de base na lista real (`node e2e/carga-listas-real.mjs 3 2`, n=6 por seção): filmes firstPaint p50=1408 ms (categoria de 11.187 itens), séries p50=1163 ms, armazenamento 10,16 MB. Ressalva: esse script mede a entrada numa categoria, NÃO a abertura da tela hero com o índice; o custo da seleção será medido direto na T025. T002 trava íntegra e 5/5 vermelhos. T003 `pickTopRated`/`topRated` + helpers `validProviderRating`/`compareByRating`/`finiteAddedAt` em `vodShowcase.ts`. T004 `sortVodItems('rating')` em `vodSort.ts` reaproveitando `compareByRating`. T005 `hasRated` em `buildShowcaseRows` (linha `rated` real ou ausente). T006 testes extras.
- Contrato: `npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts` → 3/3 verdes; trava íntegra. Os 2 contratos de tela seguem vermelhos (Fase 3).
- Testes executados: `vodShowcase.bem-avaliados.test.ts` + `vodSort` → 8/8; `npx tsc -b` limpo; oxlint sem erro novo (só avisos antigos). Efeito colateral esperado: os testes que assumem o slot `rated` (052/053 e `VodShowcaseScreen.carrosseis.test.tsx`) ficam vermelhos até a Fase 3 (T008/T011/T012) — não rodei a suíte inteira nesta fase.
- Pendências: nenhuma na fase.

---

## Phase 3: User Story 1 - Ver os títulos mais bem avaliados da minha lista (Priority: P1) 🎯 MVP

**Objetivo**: a fileira real na tela hero de Filmes e Séries, com selo, aviso de escopo e OK abrindo o item; sem o slot "Em breve".

**Independent Test**: Filmes com ≥ 5 títulos de nota obtidos → fileira entre "Adicionados recentemente" e "Porque você assistiu", ordem decrescente, selo nos cards, "Provedor" no destaque.

### Contrato da Fase

- `mostra os cards na ordem recebida com o selo da nota, avisa a cobertura parcial, …` — US1/AC1-AC5, US2/AC1, FR-004..FR-007, FR-014
- `sem nota suficiente a fileira não existe (nem slot "Em breve") …` — US3/AC1, FR-003, FR-013, Constitution: Foco
- Comando: `cd tv-web; npx vitest run src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx`

### Implementation

- [X] T007 [US1] `useTopRated(sourceId, kind)` em `tv-web/src/features/catalog/catalogApi.ts` (mesma `queryKey`/`queryFn` de `useRecentlyAdded`, `select` estável com `pickTopRated` sobre `entry.record`, `toItemOut` só nos vencedores, cobertura do índice), `logic/bem-avaliados.md` §3 → contrato: ambos os de tela
- [X] T008 [US1] `tv-web/src/features/vod/VodShowcaseScreen.tsx`: `useTopRated`, `hasRated`, `entriesOf` para `'rated'`, `hasAnyItems` inclui a fileira, cabeçalho com `<span className="vod-row-coverage">` quando `coveredCategories < totalCategories` (`t('showcase.ratedCoverage', …)`); atualizar o comentário de cabeçalho (Bem avaliados deixa de ser reservada), §4 → contrato: ambos os de tela
- [X] T009 [P] [US1] `.vod-row-coverage` em `tv-web/src/styles/vod.css` (tokens de cor/fonte/espaçamento; discreto, ao lado do título; sem `tabindex`)
- [X] T010 [P] [US1] Remover `vod-rated` de `tv-web/src/lib/comingSoon.ts`, de `tv-web/src/lib/i18n/messages/comingSoon.ts` (pt/en/es) e da lista em `tv-web/src/lib/comingSoon.test.ts`; `vod-top10-*` e `vod-because` ficam
- [X] T011 [US1] **Emenda dos contratos de 052/053 (aprovada pelo usuário em 2026-10-03, R-001)**: editar SÓ as linhas de "Bem avaliados"/`rated` em `VodShowcaseScreen.vitrine-filmes-series.contract.test.tsx` (052), `vodShowcaseRows.carrosseis-filmes-series.contract.test.ts` e `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (053) — listas esperadas sem `rated` e contagens de `ArrowDown` ajustadas; anexar `R-008` em `plan.md` (arquivos, linhas, motivo, aprovação); regravar as travas: `check-contract-tests.ps1 -Slug 052-vitrine-filmes-series -Write -Paths <todos os arquivos do lock>` e idem `053-carrosseis-filmes-series`
- [X] T012 [US1] Atualizar os testes **não** travados que assumem o slot: `tv-web/src/features/vod/VodShowcaseScreen.carrosseis.test.tsx` (comentários/contagens de `ArrowDown` com "Bem avaliados") e qualquer outro achado por `Grep "Bem avaliados|vod-rated|'rated'"` em `tv-web/src`

### Testes da Fase

- [X] T013 [P] [US1] `tv-web/src/features/catalog/catalogApi.bem-avaliados.test.tsx`: `useTopRated` com índice real (Dexie) — notas mistas, `< 5` válidas → `[]`, só os ≤ 12 viram `CatalogItemOut` com `provider_rating`, cobertura `covered/total` vem do índice, `channel`/`sourceId null` desabilitado
- [X] T014 [P] [US1] `tv-web/src/features/vod/VodShowcaseScreen.bem-avaliados.test.tsx`: cobertura completa → sem `.vod-row-coverage`; Séries (`section="series"`) usa `kind` série; rótulo "Provedor" no destaque ao focar um card da fileira; sem requisição de rede (`fetch` não chamado)

**Critério de Conclusão**: `cd tv-web; npx vitest run src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx src/features/vod/vodShowcase.bem-avaliados.contract.test.ts` → 5/5 verdes; `check-contract-tests.ps1` íntegro para 056, 052 e 053; `npx vitest run src/features/vod src/features/catalog src/lib/comingSoon.test.ts` verde.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-10-03)
- Feito: T007 `useTopRated` (mesma queryKey/queryFn de `useRecentlyAdded`, `select` estável, `pickTopRated` sobre os registros, `toItemOut` só nos ≤ 12). T008 `VodShowcaseScreen`: fileira `rated` + aviso `.vod-row-coverage`. T009 CSS com tokens. T010 `vod-rated` fora de `comingSoon`/i18n/teste. T011 emenda dos 3 contratos de 052/053 (R-008) e travas regravadas. T012 `Vod.idioma.test.tsx` e `VodShowcaseScreen.carrosseis.test.tsx` ajustados. T013/T014/T021 testes novos.
- Contrato: `npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx` → 5/5 verdes; trava íntegra (056, 052 e 053). Houve uma asserção inválida no contrato de tela (seletor `.tv-focus .rating-badge`; o selo fica dentro do card focado): parado pelo passo 5b, emenda de UMA linha aprovada pelo usuário (R-009) e trava da 056 regravada.
- Testes executados: `catalogApi.bem-avaliados.test.tsx` 6 testes (inclui invalidação do índice por categoria nova e fonte sem nota); `VodShowcaseScreen.bem-avaliados.test.tsx` 4 testes (cobertura completa/parcial, Séries, rótulo "Provedor" e ausência de IMDb/TMDB na fileira e no destaque, restauração de foco, fileira que some com o foco). Duas iterações nos meus testes: aritmética errada na expectativa dos 12 melhores (o 12º tinha nota 6) e escopo da asserção de IMDb/TMDB (o slot "Top 10" cita TMDB; ficou só fileira e destaque). `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Ver tudo ordenado por nota (Priority: P2)

**Objetivo**: o "Ver tudo" da fileira abre "Todos" ordenado por nota, sem mudar o menu geral de ordenação.

**Independent Test**: "Ver tudo" na fileira → grade ordenada por nota decrescente com selos; o modal de Ordenar não lista "Nota"; voltar restaura o foco.

### Implementation

- [X] T015 [US2] `tv-web/src/features/vod/VodCategoryScreen.tsx`: `effectiveSortOption` aceita `'rating'` só quando `enteredAll`; `sortFocusIdx` inicial 0 quando a opção efetiva não está em `availableOptions`; não gravar a escolha em `setSessionSort`; `logic/bem-avaliados.md` §5 (armadilhas 1–3)
- [X] T016 [P] [US2] Conferir o rótulo do botão de ordenar ("Ordenar | Nota ▾") nos 3 idiomas (chave `vod.sort.rating` já criada) e que `VOD_SORT_LABEL_KEYS` está completo

### Testes da Fase

- [X] T017 [US2] `tv-web/src/features/vod/VodCategoryScreen.bem-avaliados.test.tsx`: abrir com `{kind:'all', sort:'rating'}` → grade em ordem de nota (desempate por mais recente, sem nota no fim); o modal de Ordenar não tem "Nota"; escolher outra opção sai da nota; abrir "Todos" pela lateral continua em "Ordem da fonte"
- [X] T018 [P] [US2] Voltar da grade para a tela hero restaura o foco na fileira "Bem avaliados" (por `rowKey` + id) — estender o teste de retorno existente em arquivo novo `VodShowcaseScreen.bem-avaliados.test.tsx` (T014) ou no de integração do `App`, o que já cobrir o retorno

**Critério de Conclusão**: `cd tv-web; npx vitest run src/features/vod` verde; "Ver tudo" abre ordenado por nota nas duas seções; o menu geral continua sem "Nota".

**Checkpoint**: User Stories 1 e 2 funcionam.

**Registro da Fase**:

- Status: Concluída (2026-10-03)
- Feito: T015 `effectiveSortOption` aceita `'rating'` só em "Todos" (`VodCategoryScreen.tsx`); o índice do foco do modal (`-1 → 0`) já era tratado; a escolha não vai para a memória de sessão. T016 rótulo `vod.sort.rating` nos 3 idiomas (o tipo `Record<VodSortOption, MessageKey>` garante). T017/T018 testes.
- Contrato: coberto pelos 5 contratos da 056 (sort e rows já verdes na Fase 2); trava íntegra.
- Testes executados: `VodCategoryScreen.bem-avaliados.test.tsx` 3/3 (ordem por nota, lê o tipo inteiro, modal sem "Nota", vale só nesta abertura); restauração de foco em `VodShowcaseScreen.bem-avaliados.test.tsx`. `tsc` limpo.
- Pendências: nenhuma.

---

## Phase 5: User Story 3 - Fileira só quando há nota real (Priority: P2)

**Objetivo**: a fileira some sem nota e aparece/atualiza conforme as categorias chegam, sem prender o foco.

**Independent Test**: lista sem notas → fileira ausente; 4 notas → ausente; 5 → presente; categoria nova com notas maiores → a fileira muda sem recarregar.

### Implementation

- [X] T019 [US3] Verificar (e só ajustar se faltar) que a invalidação de `['catalog-search-index', sourceId]` pela pré-carga (`tv-web/src/features/catalog/prefetchApi.ts`) faz a fileira se atualizar; se o `select` estável não recalcular, corrigir em `useTopRated` (D-005)

### Testes da Fase

- [X] T020 [P] [US3] Em `tv-web/src/features/catalog/catalogApi.bem-avaliados.test.tsx` (T013): invalidar o índice com uma categoria nova de notas maiores → a fileira passa a refletir; fonte M3U/sem nota → `[]` sem erro
- [X] T021 [P] [US3] Em `tv-web/src/features/vod/VodShowcaseScreen.bem-avaliados.test.tsx` (T014): o foco está em "Bem avaliados" e a contagem cai abaixo de 5 → o foco vai para uma fileira vizinha válida (um único `.tv-focus`, nenhuma armadilha) (feito no mesmo arquivo da T014)

**Critério de Conclusão**: `cd tv-web; npx vitest run src/features/vod src/features/catalog` verde; nenhum estado das três situações (sem nota, poucas notas, fileira que some com foco) deixa a tela sem elemento focável.

**Checkpoint**: Todas as user stories funcionam.

**Registro da Fase**:

- Status: Concluída (2026-10-03)
- Feito: T019 confirmado que a pré-carga já invalida `['catalog-search-index', sourceId]` (`prefetchApi.ts:53`) e o `select` estável recalcula (sem código novo). T020/T021 testes.
- Contrato: coberto pelos contratos da 056; trava íntegra.
- Testes executados: invalidação por categoria nova muda fileira e cobertura (`catalogApi.bem-avaliados`); fonte sem nota → `[]`; fileira que some com o foco → um só `.tv-focus` em fileira vizinha.
- Pendências: nenhuma.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, docs e gates.

- [X] T022 [US1] E2E `tv-web/e2e/bem-avaliados.mjs` (painel Xtream fictício, porta 0, Chromium próprio, esperas condicionais; modelo: `e2e/campos-da-listagem.mjs`): ≥ 5 filmes com nota → fileira "Bem avaliados" ordenada, selo, "Provedor" no destaque, "Ver tudo" abre ordenado por nota, voltar restaura o foco; lista sem notas → fileira ausente e navegação íntegra; nenhuma requisição externa; registrar em `SUITE` de `tv-web/e2e/run.mjs`
- [X] T023 [P] Atualizar os E2E existentes que assumem o slot: `tv-web/e2e/lib/vod.mjs` (~l.130) e `tv-web/e2e/carrosseis-filmes-series.mjs` (~l.165), mais `vitrine-filmes-series` se citar a fileira
- [X] T024 [P] Documentos: `.planning/backlog.md` (item 68 entregue / tabela de entregues e `Remove mocks`), `README.md` (bullet da fileira, se couber) e confirmar que nenhum doc cita `vod-rated` como pendente (`Grep`)
- [X] T025 Medir de novo com `node e2e/carga-listas-real.mjs 3 2` e comparar com T001 (SC-004); registrar em `plan.md`; se piorar de forma perceptível, otimizar `useTopRated` antes de fechar — **medido**: seleção em 43.161 registros = 1,9 ms (mediana) contra 0,6 ms de "Adicionados recentemente"; lista real (`carga-listas-real.mjs 3 2`) antes 1408 / 1163 ms (filmes/séries, p50) e depois 1481 / 1143 ms, com o `HEAD` limpo medido na mesma hora dando 1463 / 1140 ms — diferença dentro do ruído (R-003 resolvido).
- [X] T026 Gates: `cd tv-web; npx tsc -b; npm run lint; npm run test` (suíte completa) e `npm run test:e2e` (com `npm run dev` no ar); `check-contract-tests.ps1` íntegro para 056, 052 e 053 — `tsc -b` limpo, `oxlint` sem erro, `npm run test` 390 arquivos / 2585 testes, `npm run test:e2e` 35/35 (depois do ajuste de R-010).
- [X] T027 Rodar `quickstart.md`; instalar na TV com `tizen-tv` e conferir os cenários da seção "TV física" (recomendação, não gate) — **TV física não executada** (recomendação); o roteiro de navegador do quickstart está coberto pelo E2E `bem-avaliados`.

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [X] Fase 4 (User Story 2) concluída
- [X] Fase 5 (User Story 3) concluída
- [X] Fase 7 (Refinamento pós-TV: recente, variada, sem duplicatas) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (056, 052 e 053)
- [X] `npx tsc -b`, `npm run lint`, `npm run test` e `npm run test:e2e` verdes
- [X] Medição de SC-004 registrada (antes/depois, lista real)
- [X] Backlog e README atualizados; nenhuma menção a `vod-rated` como pendente
- [X] `quickstart.md` executado com sucesso (roteiro de navegador coberto pelo E2E `bem-avaliados`; a passada na TV física NÃO foi executada — é recomendação, não gate)

---

## Phase 7: Refinamento pós-TV — seleção recente, variada e sem duplicatas (2026-10-04)

**Objetivo**: a fileira deixa de repetir sempre os mesmos filmes e de trazer filmes antigos, 10,0 de poucos votos e versões duplicadas (FR-015..FR-018, D-009).

**Origem**: pedido do usuário após a passada na TV ("pega filmes muito antigos"; "não mostrar sempre os mesmos filmes; mostrar filmes mais novos; mostrar filmes diferentes"). Regras em `logic/bem-avaliados.md` §7.

**Independent Test**: com um catálogo de teste que tenha 10,0, nota < 6, sem ano, filmes antigos e versões `[L]`/4K, a fileira só traz títulos de 6,0–9,9, com ano, recentes, uma versão por título; no mesmo dia repete a seleção e em outro dia muda.

### Contrato da Fase

- Sem contrato novo (orçamento de 5 casos já usado). O 1º caso foi **emendado com aprovação do usuário (R-011)** para cobrir `selectFeaturedRated`; as telas dos contratos mockam `useTopRated`.

### Implementation

- [X] T028 [US1] Criar `tv-web/src/features/vod/ratedSelection.ts` com `selectFeaturedRated`, `titleKey`, `fnv1a32` e as constantes (`RATED_MIN_RATING`, `RATED_MAX_RATING`, `RECENT_YEARS`, `RATED_POOL`) conforme `logic/bem-avaliados.md` §7; puro (`now` e `seed` por parâmetro). Reusa `validProviderRating`, `compareByRating`, `finiteAddedAt`, `SHOWCASE_LIMIT`, `RATED_MIN` de `vodShowcase.ts`.
- [X] T029 [US1] `useTopRated` em `tv-web/src/features/catalog/catalogApi.ts`: o `select` estável passa a chamar `selectFeaturedRated` sobre `entry.record` (`id`, `name`, `providerRating`, `year`, `addedAt`), com `now = Date.now()` e `seed = ${dia local}|${kind}|${sourceId}`; `toItemOut` só nos escolhidos; `sourceId` entra nas dependências do `useCallback`.

### Testes da Fase

- [X] T030 [P] [US1] `tv-web/src/features/vod/ratedSelection.test.ts` (novo): exclui 10,0, nota < 6 e sem ano; recentes antes dos antigos; plano B completa com os mais novos; versões `[L]`/`4K`/`(Dublado)` viram um título só (fica a de maior nota) e filmes de anos diferentes com o mesmo nome NÃO se fundem; mesma semente ⇒ mesma escolha; semente de outro dia ⇒ escolha diferente (pool > 12); adicionar um candidato troca no máximo 1 título; abaixo de `RATED_MIN` ⇒ vazio; ordem final nota ↓/ano ↓/adicionado ↓; nunca muta a entrada.
- [X] T031 [P] [US1] Atualizar `tv-web/src/features/catalog/catalogApi.bem-avaliados.test.tsx` à regra nova (registros com `year`; 10,0 e < 6 fora; mínimo conta só elegíveis; mesmo resultado em duas leituras no mesmo dia).
- [X] T032 [P] [US1] Atualizar `tv-web/e2e/bem-avaliados.mjs`: o painel fictício ganha `year` recente, um filme de nota 10, um de nota 5, um antigo e uma versão `[L]` duplicada; a fileira só mostra os elegíveis, uma vez cada, e o "Ver tudo" segue com a seção inteira.

**Critério de Conclusão**: `cd tv-web; npx vitest run src/features/vod src/features/catalog` verde (inclui os 5 contratos, sem editá-los), `npx tsc -b` limpo, `node e2e/run.mjs --only bem-avaliados,carrosseis-filmes-series` verde, `check-contract-tests.ps1` íntegro (056, 052, 053).

**Checkpoint**: a fileira atende os 3 pedidos (variada, recente, sem duplicatas) e os contratos seguem intactos.

**Registro da Fase**:

- Status: Concluída (2026-10-04)
- Feito: T028 `tv-web/src/features/vod/ratedSelection.ts` (`selectFeaturedRated`, `titleKey`, `fnv1a32`, `dayKey`, constantes): elegível = nota 6,0–9,9 + ano conhecido; uma versão por título+ano; pool dos 36 melhores recentes (últimos 10 anos) com plano B pelos mais novos; 12 sorteados por hash com semente do dia; exibição por nota ↓. T029 `useTopRated` passou a usar só essa seleção (`select` estável, semente `dia|tipo|lista`). T030/T031/T032 testes e E2E.
- Contrato: `npx vitest run src/features/vod/vodShowcase.bem-avaliados.contract.test.ts src/features/vod/VodShowcaseScreen.bem-avaliados.contract.test.tsx` → 5/5 verdes SEM editar contrato (`topRated`/`pickTopRated` ficaram intactos, D-010); travas íntegras (056, 052, 053).
- Testes executados: `ratedSelection.test.ts` 14/14; `catalogApi.bem-avaliados.test.tsx` 6/6 reescrito à regra nova; área `src/features/vod src/features/catalog src/lib` 210 arquivos / 1317 testes; `npm run test` 391 arquivos / 2599 testes; `npx tsc -b` limpo; oxlint sem erro; E2E `bem-avaliados`, `carrosseis-filmes-series`, `campos-da-listagem`, `vitrine-filmes-series`, `carga-listas` 5/5. Duas iterações no E2E `bem-avaliados`: a versão `[L]` venceu o desempate por ser mais recente (conforme a spec; a asserção presumia o contrário) e o carrossel só renderiza ~10 cards (virtualização horizontal). Verificação com a lista REAL (teste temporário, apagado): 8.889 títulos elegíveis distintos de 43.161; os 12 de cada dia são de 2017–2026, sem nota 10; 3 dias seguidos repetem 4–6 dos 12.
- Pendências: nenhuma. R-011 resolvido depois, com aprovação do usuário: contrato 1 emendado para `selectFeaturedRated`, `topRated`/`pickTopRated` removidos e trava da 056 regravada (ver `plan.md`, R-011).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA as user stories
- **US1 (Phase 3)**: depende da Fase 2; T011 (emenda) deve vir junto de T008/T005 (assim que a fileira some do slot, os contratos antigos quebram)
- **US2 (Phase 4)**: depende da Fase 2 (T004) e de T008 (o "Ver tudo" existe)
- **US3 (Phase 5)**: depende da Fase 3
- **Polish**: depende de todas as stories

### Parallel Opportunities

- Fase 2: T004 e T005 em paralelo com T003 (arquivos diferentes)
- Fase 3: T009 e T010 em paralelo com T007/T008; T013 e T014 em paralelo

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Setup → Foundational → US1 (fileira + selo + aviso + amenda dos contratos)
2. **PARAR E VALIDAR**: abrir Filmes/Séries com notas e sem notas
3. US2 ("Ver tudo" ordenado) e US3 (ausência/atualização/foco) em seguida

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar por fase ou grupo coerente, só quando o usuário pedir
- Contratos travados não se editam; a **única** emenda autorizada é a de T011 (052/053)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

**Origem**: `sdd-converge` de 2026-10-04 (achados LOW, sem CRITICAL/HIGH). Cada task cita sua origem.

- [X] T033 [P] Corrigir o comentário de `buildShowcaseRows` em `tv-web/src/features/vod/vodShowcaseRows.ts` (~l.54): "os 3 slots" → os 2 slots que restam (Top 10 e "Porque você assistiu"); "Bem avaliados" é fileira de itens, só com nota suficiente. — origem: `plan: D-009/D-010`, Constitution *Documentação do Repositório É Canônica* (C-1)
- [X] T034 [P] Em `sdd/specs/056-bem-avaliados/logic/bem-avaliados.md`, marcar §1 (`pickTopRated`/`topRated`) e a menção a eles no §3 como superados pelo §7 e pela remoção da R-011; a regra vigente é `selectFeaturedRated`. — origem: `plan: D-009/D-010`, Constitution *Documentação do Repositório É Canônica* (C-2)

