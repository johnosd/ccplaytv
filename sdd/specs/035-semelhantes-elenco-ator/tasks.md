---
description: "Tasks da feature 035 — Semelhantes, fotos do elenco e página de ator"
---

# Tasks: Semelhantes, fotos do elenco e página de ator

**Input**: Documentos de design de `sdd/specs/035-semelhantes-elenco-ator/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/*.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/` (client-first, ADR-008); comandos rodam de `tv-web/`.
- Lógica TMDB/cruzamento: `tv-web/src/lib/metadata/`; dados: `tv-web/src/lib/catalog/db.ts`.
- Hooks de tela: `tv-web/src/features/catalog/catalogApi.ts`.
- Telas/componentes: `tv-web/src/features/{movies,series,vod,person}/`; navegação: `tv-web/src/navigation/appNav.ts` + `tv-web/src/App.tsx`.
- Estilos: `tv-web/src/styles/vod.css` (só tokens V14).
- E2E: `tv-web/e2e/*.mjs`; scripts SDD: `.planning/scripts/powershell/` (rodar da raiz).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dois ajustes pequenos que as fases seguintes usam.

- [X] T001 [P] Exportar `isCovered` de `tv-web/src/lib/catalog/catalogSearch.ts` (sem mudar a regra) — D-007
- [X] T002 [P] `tmdbImageUrl(path, size = 'w1280')` em `tv-web/src/lib/metadata/tmdbConnector.ts` (tamanhos `w185`/`w342`/`w1280`; nunca chave) — `logic/semelhantes-e-elenco-tmdb.md` §2

**Registro da Fase**:

- Status: Concluída (2026-09-30)
- Feito: T001 `isCovered` exportada; T002 `tmdbImageUrl(path, size)` com `w185`/`w342`/`w1280`.
- Contrato: sem contrato nesta fase
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/lib/metadata` verde
- Pendências: nenhuma

---

## Phase 2: Foundational — Semelhantes e elenco na consulta do detalhe

**Purpose**: O dado que US1–US3 exibem, na MESMA chamada que o detalhe já faz.

**⚠️ CRITICAL**: US1, US2 e US3 dependem desta fase.

### Contrato da Fase

- `ensureTitleMetadata — com chave, mesmo com o provedor completo: uma consulta TMDB traz Semelhantes … registro TMDB anterior à 035 é consultado de novo uma vez` — FR-002/FR-003/FR-004/FR-013, SC-005
- Comando: `npx vitest run src/lib/metadata/titleMetadata.semelhantes.contract.test.ts`

### Implementation

- [X] T003 [US1] `detailParams` por tipo em `tv-web/src/lib/metadata/tmdbLookup.ts` (filme `credits,videos,recommendations,similar`; série `aggregate_credits,videos,recommendations,similar`; fallback de idioma sem `append_to_response`) — D-001 → contrato: `ensureTitleMetadata … Semelhantes`
- [X] T004 [US1] `mapTmdbDetail` em `tv-web/src/lib/metadata/tmdbMapping.ts`: `similar` (dedup, sem o próprio id, até 20, tipo do detalhe, pôster w342), `castPeople` (até 20 por `order`, foto w185; série por `aggregate_credits` com o papel de mais episódios) e `cast` texto da série via `aggregate_credits` — `logic/semelhantes-e-elenco-tmdb.md` §2 → contrato: `ensureTitleMetadata … Semelhantes`
- [X] T005 [US1] Em `tv-web/src/lib/metadata/titleMetadata.ts`: retirar a trava `providerLeavesGaps` (D-002), acrescentar `tmdbLacks035` (D-003), dica = `providerTmdbId ?? tmdbId já casado`, e `mergeTitleMetadata` expondo `tmdbMatch`/`similar`/`castPeople` — `logic/semelhantes-e-elenco-tmdb.md` §3/§4 → contrato: `ensureTitleMetadata … Semelhantes`

### Testes da Fase

- [X] T006 [P] [US1] Atualizar os testes não travados que assumiam "provedor completo → sem TMDB" e `credits` na série (`tv-web/src/lib/metadata/titleMetadata.tmdb.test.ts`, `tmdbConnector.test.ts`, `titleMetadata.test.ts` onde aplicável) — R-005
- [X] T007 [P] [US1] Casos novos em `tv-web/src/lib/metadata/titleMetadata.tmdb.test.ts`: série com `aggregate_credits` (personagem do papel com mais episódios, `cast` texto dos 10 primeiros), `similar: []` quando as duas listas vêm vazias, `no_match` anterior não é repetido

**Critério de Conclusão**: `npx vitest run src/lib/metadata/titleMetadata.semelhantes.contract.test.ts` → 1/1 verde; contratos da 032/033 (`check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes` e `-Slug 033-trailers-filmes-series`) íntegros e verdes; `npx vitest run src/lib/metadata` verde; `npx tsc -b` limpo.

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída (2026-09-30)
- Feito: T003 `append_to_response` por tipo; T004 `similar`/`castPeople`/`cast` texto da série via `aggregate_credits` (`tmdbMapping.ts`); T005 sem `providerLeavesGaps`, `tmdbLacks035`, dica = `tmdbId` já casado, `mergeTitleMetadata` com `tmdbMatch`/`similar`/`castPeople`. T006/T007: 3 testes da 032/033 atualizados (R-005) e `tmdbMapping.test.ts` novo.
- Contrato: `npx vitest run src/lib/metadata/titleMetadata.semelhantes.contract.test.ts` 1/1 verde; trava 035 íntegra; travas 032 e 033 íntegras e verdes
- Testes executados: `npx vitest run src/lib/metadata` (só os contratos das Fases 3/6 vermelhos na época); `npx tsc -b` limpo
- Pendências: R-009: `similar` é sempre `[]` (nunca ausente) no mapeamento, para o contrato travado da 033 não repetir a consulta

---

## Phase 3: User Story 1 - Descobrir títulos parecidos (Priority: P1) 🎯 MVP

**Objetivo**: A aba Semelhantes real no detalhe de filme e série, cruzada com o catálogo local, com resumo do não encontrado e pilha de RETURN.

**Independent Test**: com a chave TMDB e algumas categorias abertas, abrir um filme casado, entrar em Semelhantes, conferir ordem/chip/cobertura, OK em cada tipo de cartão e RETURN.

### Contrato da Fase

- `resolveTmdbTitles — encontrados primeiro na ordem do TMDB; cópias … cobertura X de Y` — US1/AC1+AC2, FR-005–FR-008
- `MovieDetailScreen — encontrado abre o detalhe com o snapshot; não encontrado abre o resumo … o snapshot restaura aba e cartão por identidade` — US1/AC2–AC5, FR-008–FR-010/FR-019
- Comando: `npx vitest run src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx`

### Implementation

- [X] T008 [US1] `resolveTmdbTitles` em `tv-web/src/lib/metadata/localTitleMatch.ts` (stub existente) — `logic/cruzamento-local.md` → contrato: `resolveTmdbTitles …`
- [X] T009 [P] [US1] `similarTabStatus` (puro) em `tv-web/src/lib/metadata/similarTab.ts` — `logic/aba-semelhantes.md` §1
- [X] T010 [US1] `useSimilarTitles(itemId, enabled)` em `tv-web/src/features/catalog/catalogApi.ts` (stub existente): reusa `useTitleMetadata`/`useTmdbStatus`/`useCatalogItem`, resolução só com a aba ativa, `['similar-titles', itemId]`, `staleTime: 0`, nenhuma requisição externa — `logic/aba-semelhantes.md` §1
- [X] T011 [P] [US1] `TitleSummaryModal` em `tv-web/src/features/vod/TitleSummaryModal.tsx` (`Modal`, pôster, título, ano uma vez, sinopse ou "Sinopse não informada pelo TMDB.", frase de não estar nas categorias abertas, botão "Fechar" focado, sem assistir) — D-011, `logic/aba-semelhantes.md` §4 → contrato: `MovieDetailScreen — encontrado …`
- [X] T012 [US1] `SimilarPanel` em `tv-web/src/features/vod/SimilarPanel.tsx`: cobertura, `Rail` de `ContentCard` retrato, chip "Não encontrado na sua lista" (texto visível uma vez), `OriginTag` TMDB, foco por `focusKey` — `logic/aba-semelhantes.md` §2/§3
- [X] T013 [US1] `MovieDetailScreen.tsx`: aba Semelhantes real (sem `softDisabled`), fileira `panel` derivada por chave, `restore` (aba + chave), `onOpenTitle`, resumo do não encontrado — `logic/aba-semelhantes.md` §3, `logic/navegacao-detalhe.md` §2 → contrato: `MovieDetailScreen — encontrado …`
- [X] T014 [US1] Mesmo comportamento em `tv-web/src/features/series/SeriesDetailScreen.tsx` (props opcionais `restore`/`onOpenTitle`/`onOpenPerson`/`onOpenTmdbSettings`, fileira `panel` convivendo com `season`/`episodes`, aba inicial `episodes` sem `restore`)
- [X] T015 [US1] `restore?: DetailSnapshot` em `movie-detail`/`series-detail` (`tv-web/src/navigation/appNav.ts`) e em `tv-web/src/App.tsx`: passar `restore`, e `onOpenTitle` → `open` com `from: { ...screen, restore }` — `logic/navegacao-detalhe.md` §1
- [X] T016 [P] [US1] Remover `similar` de `tv-web/src/lib/comingSoon.ts` e ajustar `tv-web/src/lib/comingSoon.test.ts` (passa a esperar `getComingSoon('similar')` lançar) — FR-001
- [X] T017 [P] [US1] Estilos do painel, cartões com chip e resumo em `tv-web/src/styles/vod.css` (tokens V14; `.no-scrollbar` onde rolar)

### Testes da Fase

- [X] T018 [P] [US1] `tv-web/src/lib/metadata/localTitleMatch.test.ts`: série×série, fonte sem geração ativa (cobertura 0 de 0), ref repetida entra uma vez, registro sem ano casando só por identidade, `storedEntries` nunca lido
- [X] T019 [P] [US1] `tv-web/src/lib/metadata/similarTab.test.ts`: tabela de estados de `logic/aba-semelhantes.md` §1 (inclusive `matched` em cache com TMDB offline → `ready`)
- [X] T020 [P] [US1] `tv-web/src/navigation/appNav.test.ts`: detalhe → detalhe → `back` devolve o `restore` certo; A → B → A mantém dois snapshots
- [X] T021 [US1] Atualizar `tv-web/src/features/movies/MovieDetailScreen.test.tsx` (caso "Semelhantes segue Em breve" deixa de valer) e cobrir série em `tv-web/src/features/series/SeriesDetailScreen.test.tsx` (aba Semelhantes, `restore` com aba `similar`) — R-005

**Critério de Conclusão**: `npx vitest run src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx` → o teste do `resolveTmdbTitles` e o 1º teste da tela verdes (o 2º da tela é da Fase 4) e `check-contract-tests.ps1 -Slug 035-semelhantes-elenco-ator` íntegro; `useSimilarTitles` não faz requisição externa; `npx tsc -b`, `npm run lint` limpos; suítes de `src/features/movies`, `src/features/series`, `src/navigation`, `src/lib` verdes (flakes conhecidos de `*.favorites.test.tsx` confirmados isolados).

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-30)
- Feito: T008 `resolveTmdbTitles`; T009 `similarTabStatus`; T010 `useSimilarTitles`; T011 `TitleSummaryModal`; T012 `SimilarPanel` (fileira simples, não `Rail` — R-010); T013/T014 aba real nos dois detalhes (fileira `panel`, `restore`, resumo); T015 `restore?` em `appNav.ts` + `App.tsx` (`openDetail`/`openTmdbSettings`, `key` por posição na pilha); T016 mock `similar` removido; T017 estilos. Testes T018–T021.
- Contrato: `npx vitest run src/lib/metadata/localTitleMatch.semelhantes.contract.test.ts src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx` 3/3 verdes; trava íntegra
- Testes executados: `npx vitest run src/features/movies src/features/series src/navigation src/features/vod src/lib` verde; `tsc -b` limpo; lint só com avisos pré-existentes
- Pendências: nenhuma

---

## Phase 4: User Story 2 - Aba Semelhantes sem dado (Priority: P1)

**Objetivo**: Cada estado sem dado explica o porquê e tem um elemento focável; sem chave, "Configurar TMDB" leva a Integrações & BYOK.

**Independent Test**: sem chave; com chave e título sem casamento; com chave e TMDB sem semelhantes; com o TMDB fora do ar.

### Contrato da Fase

- `MovieDetailScreen — sem chave: explica e oferece "Configurar TMDB" focável … título sem casamento: mensagem própria e o foco nunca fica sem elemento` — US2/AC1+AC2, FR-011/FR-012, SC-004
- Comando: `npx vitest run src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx`

### Implementation

- [X] T022 [US2] Estados `loading`/`no_key`/`no_match`/`empty`/`unavailable` em `tv-web/src/features/vod/SimilarPanel.tsx` com os textos exatos de `logic/aba-semelhantes.md` §2; botão "Configurar TMDB" focável na fileira `panel` → contrato: `MovieDetailScreen — sem chave …`
- [X] T023 [US2] `onOpenTmdbSettings({ tab: 'similar' })` nos dois detalhes e, em `tv-web/src/App.tsx`, `open` de `{ name: 'settings', restore: { zone: 'panel', tab: 'integrations' } }` com `from: { ...screen, restore }` — `logic/navegacao-detalhe.md` §1

### Testes da Fase

- [X] T024 [P] [US2] `tv-web/src/features/vod/SimilarPanel.test.tsx`: `empty` e `unavailable` com mensagem própria e foco na aba; nenhum toast por falha; `findUnnamedControls` (`tv-web/src/testing/accessibleNames.ts`) sem achados em todos os estados
- [X] T025 [P] [US2] Série: estado `no_key` e `unavailable` em `tv-web/src/features/series/SeriesDetailScreen.test.tsx`

**Critério de Conclusão**: `npx vitest run src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx` → 2/2 verdes e trava íntegra; 5 estados sem dado com focável (SC-004 parcial — o 5º é o erro da página de ator, Fase 6); `tsc`/lint limpos.

**Checkpoint**: P1 completo (US1 + US2) — entregável.

**Registro da Fase**:

- Status: Concluída (2026-09-30)
- Feito: T022 estados `loading`/`no_key`/`no_match`/`empty`/`unavailable` com os textos exatos e "Configurar TMDB" (feitos junto do T012); T023 `onOpenTmdbSettings({ tab: "similar" })` → Configurações › Integrações; T024/T025 testes.
- Contrato: `npx vitest run src/features/movies/MovieDetailScreen.semelhantes.contract.test.tsx` 2/2 verdes; trava íntegra
- Testes executados: `SimilarPanel.test.tsx` e `SeriesDetailScreen.semelhantes.test.tsx` verdes (com `findUnnamedControls`)
- Pendências: nenhuma

---

## Phase 5: User Story 3 - Rosto de quem atua (Priority: P2)

**Objetivo**: A aba Elenco mostra foto, nome e personagem quando o título casou no TMDB; senão, o texto da 032.

**Independent Test**: abrir um título casado e outro só com elenco do provedor; conferir fotos, marcador neutro e fallback em texto.

### Implementation

- [X] T026 [US3] Painel de pessoas em `tv-web/src/features/vod/DetailMetadata.tsx` (novo `CastPeoplePanel`, `Rail` com foto/marcador neutro, nome, personagem opcional, `OriginTag` TMDB); `CastPanel` da 032 intacto para o caso sem `castPeople` — D-006, `logic/pagina-de-ator.md` §1
- [X] T027 [US3] Fileira `panel` na aba Elenco dos dois detalhes (`MovieDetailScreen.tsx`, `SeriesDetailScreen.tsx`): foco por `person:<id>`, `restore` com aba `cast`; OK chama `onOpenPerson` quando a prop existir (a rota vem na Fase 6)
- [X] T028 [P] [US3] Estilos das pessoas (foto circular ou retrato, marcador neutro) em `tv-web/src/styles/vod.css`

### Testes da Fase

- [X] T029 [P] [US3] `tv-web/src/features/movies/MovieDetailScreen.metadata.test.tsx`: com `castPeople` mostra pessoas (foto, personagem só quando há), foto que falha → marcador (sem `<img>` quebrada), sem `castPeople` continua o texto da 032 sem foco no painel
- [X] T030 [P] [US3] Série em `tv-web/src/features/series/SeriesDetailScreen.metadata.test.tsx` (mesmos casos)

**Critério de Conclusão**: testes da fase verdes; contratos da 032 (`MovieDetailScreen.metadata-tmdb.contract.test.tsx`) e da 035 continuam verdes; `findUnnamedControls` sem achados no painel de pessoas; `tsc`/lint limpos.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-30)
- Feito: T026 `CastPeoplePanel`/`PersonPhoto` em `DetailMetadata.tsx` (fileira simples, marcador neutro em falha de foto, `CastPanel` da 032 intacto sem `castPeople`); T027 fileira `panel` na aba Elenco dos dois detalhes (chave `person:<id>`, `onOpenPerson`); T028 estilos; T029/T030 testes em `MovieDetailScreen.elenco.test.tsx` e `SeriesDetailScreen.elenco.test.tsx`.
- Contrato: sem contrato nesta fase; trava 035 íntegra; contratos 032/035 da tela verdes
- Testes executados: `npx vitest run src/features/movies src/features/series src/features/vod` — 226 verdes; `tsc -b` limpo
- Pendências: falhas restantes só de `MoviesScreen.favorites.test.tsx` (flake conhecido) e do contrato da feature 036 (ainda não implementada, fora do escopo)

---

## Phase 6: User Story 4 - Página de ator (Priority: P2)

**Objetivo**: OK numa pessoa abre a página com foto, nome e filmografia cruzada, com estados e pilha de RETURN.

**Independent Test**: da aba Elenco de um título casado, OK numa pessoa, abrir um título encontrado, voltar duas vezes.

### Contrato da Fase

- `loadPersonCredits — falha não é guardada nem carrega a chave; sucesso … remover a chave corta tudo sem requisição e descarta o cache` — US4/AC1+AC5, FR-016/FR-018/FR-021/FR-022
- Comando: `npx vitest run src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts`

### Implementation

- [X] T031 [US4] Dexie v13 `tmdbPeople: 'personId'` + `TmdbPersonRecord` em `tv-web/src/lib/catalog/db.ts` (conferir antes se a 034 já usou a v13 — R-004) — `data-model.md` §3
- [X] T032 [US4] `loadPersonCredits` em `tv-web/src/lib/metadata/tmdbPeople.ts` (stub existente): credencial/pausa, cache 6 meses, em voo por pessoa, mapeamento/filtro/ordem, erro só por categoria — `logic/pagina-de-ator.md` §2/§3 → contrato: `loadPersonCredits …`
- [X] T033 [US4] `removeTmdbKey` limpa `tmdbPeople` na mesma transação (`tv-web/src/lib/metadata/tmdbKeyRepository.ts`) e `useRemoveTmdbKey` remove `['person-credits']`/`['person-titles']` (`tv-web/src/features/catalog/catalogApi.ts`) — FR-021 → contrato: `loadPersonCredits …`
- [X] T034 [US4] `usePersonCredits(personId)` e `usePersonTitles(personId, sourceId, credits)` em `tv-web/src/features/catalog/catalogApi.ts` (corte em `FILMOGRAPHY_SHOWN_MAX` depois de ordenar)
- [X] T035 [US4] `PersonSnapshot` em `tv-web/src/features/person/personSnapshot.ts` e `PersonScreen` em `tv-web/src/features/person/PersonScreen.tsx` (cabeçalho, cobertura de filmes e séries, dois `Rail`s, chip, resumo, estados com focável, RETURN) — `logic/pagina-de-ator.md` §5, D-012
- [X] T036 [US4] Tela `person` em `tv-web/src/navigation/appNav.ts`; em `tv-web/src/App.tsx` a rota e `onOpenPerson` nos dois detalhes + `onOpenTitle` da página de ator — `logic/navegacao-detalhe.md` §1
- [X] T037 [P] [US4] Estilos da página de ator em `tv-web/src/styles/vod.css` (raiz `.screen`, sem topbar, `.no-scrollbar`)

### Testes da Fase

- [X] T038 [P] [US4] `tv-web/src/lib/metadata/tmdbPeople.test.ts`: `refused` e pausa ativa sem requisição, `not_found` não gravado, "Self"/News/Reality fora, em voo compartilhado, cache vencido pede de novo
- [X] T039 [P] [US4] `tv-web/src/features/person/PersonScreen.test.tsx`: estados (carregando, erro com "Tentar de novo"/"Voltar", `no_key`, vazio) com focável; rails na ordem; `restore` por chave; OK encontrado/não encontrado; `findUnnamedControls` sem achados
- [X] T040 [P] [US4] `tv-web/src/navigation/appNav.test.ts`: detalhe → ator → detalhe → `back` ×2 restaura `person` e depois `{ tab: 'cast', focusKey: 'person:<id>' }`

**Critério de Conclusão**: `npx vitest run src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts` → 1/1 verde e trava íntegra; os 5 contratos da 035 verdes juntos; testes da fase verdes; `tsc`/lint limpos.

**Checkpoint**: todas as stories funcionais.

**Registro da Fase**:

- Status: Concluída (2026-09-30)
- Feito: T031 Dexie v13 `tmdbPeople` + `TmdbPersonRecord` (v12 era a última; a 034 ainda não subiu versão); T032 `loadPersonCredits`; T033 `removeTmdbKey` limpa `tmdbPeople` na mesma transação e `useRemoveTmdbKey` remove `person-credits`/`person-titles`/`similar-titles`; T034 `usePersonCredits`/`usePersonTitles`; T035 `PersonSnapshot` + `PersonScreen`; T036 tela `person` em `appNav.ts` e rota/`onOpenPerson`/`onOpenTitle` em `App.tsx`; T037 estilos; T038–T040 testes.
- Contrato: `npx vitest run src/lib/metadata/tmdbPeople.semelhantes.contract.test.ts` 1/1 verde; 5/5 contratos da 035 verdes juntos; trava íntegra
- Testes executados: `npx vitest run src/features/person src/lib/metadata src/navigation` 149/149; `tsc -b` limpo
- Pendências: nenhuma

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Prova em navegador real, medição com a lista real e documentação canônica.

- [X] T041 `tv-web/e2e/semelhantes-elenco-ator.mjs` (TMDB e painel falsos servidos pelo script, contando requisições): cenários 1–9 do `quickstart.md`, incluindo SC-001/SC-005 (zero requisição por foco/aba) e SC-003 (10 sequências); incluir em `test:e2e` (`tv-web/package.json`). Mesmo `executablePath` dos outros `e2e/*.mjs` (override local no Windows, como os demais)
- [X] T042 `tv-web/e2e/semelhantes-real.mjs` (fora do `test:e2e`; lê o `.env` da raiz, imprime só contagens/ms): SC-002 com ≥ 50 títulos e p50/p95 da resolução local (R-003); sem `CCPLAY_PROBE_TMDB_KEY` registrar "não medido" (R-008)
- [X] T043 Revisão de segredos: nenhum `console.*` nos arquivos novos, nenhuma chave em `aria-*`/erro/query key (FR-022)
- [X] T044 Documentação (a nota na FR-018 da 032 já foi feita no plan, pendência A1): parágrafo da 035 em `CLAUDE.md`; comentário de `TitleMetadataView.cast` em `tv-web/src/lib/metadata/types.ts` e de `CastPanel` em `tv-web/src/features/vod/DetailMetadata.tsx` (deixam de citar "item 45" como futuro); `.planning/backlog.md` via `update-feature-status.ps1`
- [X] T045 Rodar a validação de `quickstart.md` e gates finais: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen`, `npm run test:e2e` (com `npm run dev` recém-iniciado)

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Testes de contrato da 035 todos verdes na suíte completa e `check-contract-tests.ps1 -Slug 035-semelhantes-elenco-ator` íntegro
- [X] Travas das features 022, 023, 024, 025, 032 e 033 íntegras e verdes
- [X] `npm run test:e2e` verde (inclui `e2e/semelhantes-elenco-ator.mjs`)
- [X] `npm run build:tizen` limpo (nenhum arquivo emitido fora de `tizen_web_project.yaml`)
- [X] SC-002 medido com a lista real — atendido com ressalva: ~1 homônimo do mesmo ano em ~250 (R-011/R-012, ano exato aprovado)
- [X] `quickstart.md` executado com sucesso
- [ ] TV física: recomendada, não é gate (imagens TMDB no WebView, fluidez dos rails)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup (T002) — BLOQUEIA US1/US2/US3
- **US1 (Phase 3)**: depende da Fase 2
- **US2 (Phase 4)**: depende da Fase 3 (mesmo painel e mesma tela)
- **US3 (Phase 5)**: depende da Fase 2; pode correr em paralelo com 3/4, mas toca os mesmos arquivos de tela — preferir em sequência
- **US4 (Phase 6)**: depende da Fase 5 (ponto de entrada = pessoa do elenco)
- **Polish (Phase 7)**: depende de todas

### Parallel Opportunities

- T001 ∥ T002; T006 ∥ T007; T009 ∥ T011 ∥ T016 ∥ T017; testes marcados `[P]` de cada fase.

---

## Implementation Strategy

### MVP First (P1)

1. Fases 1 e 2 → dado pronto
2. Fase 3 (US1) → Fase 4 (US2) → **parar e validar**: aba Semelhantes completa é entregável sozinha

### Incremental Delivery

1. P1 (US1 + US2) → validar
2. US3 (fotos) → validar
3. US4 (página de ator) → validar
4. Polish

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Os contratos da 035 são travados: só fazê-los passar, nunca editá-los
- Commitar após cada task ou grupo lógico coerente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

**Purpose**: Lacunas achadas pelo `sdd-converge` em 2026-09-30 (código correto; a documentação e a cobertura ficaram atrás da emenda R-012).

- [X] T046 [MEDIUM] Emendar a FR-005 em `sdd/specs/035-semelhantes-elenco-ator/spec.md` (nota `**Atualização (R-012):**`): o cruzamento por título exige ano exato, não "tolerância de 1 ano" — origem: FR-005, plan R-012
- [X] T047 [MEDIUM] Registrar na SC-002 da spec a ressalva aprovada (homônimos de obras diferentes com mesmo título e ano; ~1 em ~250 medido em `e2e/semelhantes-real.mjs`), ou revisar a meta — origem: SC-002, plan R-011
- [X] T048 [LOW] Estender `tv-web/e2e/semelhantes-elenco-ator.mjs` para 10 cadeias completas detalhe → semelhante → detalhe → ator → detalhe com 4 RETURN e conferência de aba/foco — origem: SC-003
## Phase 9: Ajuste pós-TV física

**Purpose**: Pedido do usuário após o teste na TV (2026-09-30): a aba Semelhantes ficava abaixo da dobra e passava despercebida — ganha uma ação própria no hero, junto de Trailer e Minha Lista.

- [X] T049 Ação "☰ Semelhantes" no hero de `MovieDetailScreen` (entre Trailer e "Marcar como assistido", que segue sempre a última) e de `SeriesDetailScreen` (depois de Trailer). OK ativa a aba, rola até o painel e foca o 1º cartão (ou "Configurar TMDB") via novo hook `features/vod/useEnterSimilarPanel.ts`; qualquer direção cancela o pedido pendente. A aba continua existindo. Nenhuma requisição nova (SC-005 intacto)
- [X] T050 Testes: `MovieDetailScreen.test.tsx` (índice de "Marcar assistido" 3→4; novo teste da ação) e `e2e/historico-continuar-assistindo.mjs` (6× ArrowRight até a última ação)

**Registro da Fase**:
- Status: concluída
- Feito: T049, T050
- Contrato: `check-contract-tests.ps1 -Slug 035-semelhantes-elenco-ator` — 5/5 travados, trava íntegra
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/features/movies/MovieDetailScreen src/features/series/SeriesDetailScreen` 108/108
- Pendências: `VodCatalogScreen.limpar-historico.contract.test.tsx` (feature 036, arquivo não commitado, não tocado aqui) falha também isolado; `MoviesScreen.favorites` é o flake conhecido de paralelismo (passou isolado). E2E de `historico-continuar-assistindo.mjs` e da própria 035 não foram reexecutados nesta sessão. Lint: 2 avisos novos (`react(refs)` no `ref=` do painel e `set-state-in-effect` no hook), só warnings
