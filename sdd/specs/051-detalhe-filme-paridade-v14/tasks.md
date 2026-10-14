---
description: "Tasks da feature 051 — paridade visual do detalhe do filme com o V14"
---

# Tasks: Paridade visual do detalhe do filme com o Design System V14

**Input**: `sdd/specs/051-detalhe-filme-paridade-v14/` (spec.md, plan.md, quickstart.md)

**Organization**: por user story; cada uma é testável isoladamente.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Frontend em `tv-web/` (comandos rodam dali).
- Telas em `tv-web/src/features/movies/`, componentes compartilhados em `tv-web/src/features/vod/`, estilos em `tv-web/src/styles/vod.css`.
- Referências V14: Spec §32 "Detalhe de filme", §16 cartões, §19/§45 estados; Component Lab `#cards`, `#rails`, `#feedback`; protótipo `details()` (linha ~811 do HTML — ler com janela estreita).

## Phase 1: Setup

**Purpose**: base verde e referência fixada antes de mexer.

- [ ] T001 Rodar `npx vitest run src/features/movies src/features/vod src/features/series` e anotar a linha de base verde em `plan.md` (Execution Notes)
- [ ] T002 Capturar (Playwright, `npm run dev`) o detalhe de um filme e de uma série **antes** — a série é o controle de regressão (R-002)
- [ ] T003 [P] Ler as seções de referência V14 acima e registrar em `plan.md` os valores adotados (altura do hero, vinheta, raio/tamanho dos cartões) usando só tokens

---

## Phase 2: User Story 1 - Hero com capa grande e marcar como assistido (Priority: P1) 🎯 MVP

**Objetivo**: hero com capa grande sob vinheta, botões V14 e selo "✓ Assistido".

**Independent Test**: abrir o detalhe de um filme com e sem backdrop; marcar e desmarcar como assistido.

### Implementation

- [ ] T004 [US1] Adicionar a classe `vod-detail--movie` à raiz em `tv-web/src/features/movies/MovieDetailScreen.tsx` (D-003); `SeriesDetailScreen.tsx` não muda
- [ ] T005 [US1] Ajustar a estrutura do hero em `MovieDetailScreen.tsx`/`features/vod/DetailMetadata.tsx` (`DetailBackdrop` com prop opcional de variante grande, sem alterar o uso da série): capa cobrindo o hero inteiro, vinheta por camada, pôster/texto por cima (D-004, FR-001)
- [ ] T006 [US1] Fallback sem backdrop ou com imagem quebrada: superfície `--bg-surface` + pôster nítido, sem área vazia (D-005, FR-002)
- [ ] T007 [US1] Bloco CSS **ao fim** de `tv-web/src/styles/vod.css` sob `.vod-detail--movie`: altura do hero, vinheta (gradientes com tokens), tipografia do título, botões primário/secundário/foco/pressionado V14, selo "✓ Assistido" (FR-001, FR-003, FR-004, FR-011, R-001)
- [ ] T008 [US1] Conferir que "Marcar como assistido" mantém o foco no botão após alternar e que desmarcar não apaga o progresso (FR-003/FR-004; só verificar — a lógica não muda, D-002)

### Testes da Fase

- [ ] T009 [P] [US1] `tv-web/src/features/movies/MovieDetailScreen.paridade-v14.test.tsx`: classe `vod-detail--movie` na raiz; hero com backdrop; hero sem backdrop; imagem com `onError` cai no fallback; selo "✓ Assistido" aparece/some ao alternar
- [ ] T010 [P] [US1] Teste em `tv-web/src/features/series/SeriesDetailScreen.test.tsx` (ou arquivo novo ao lado) garantindo que a série **não** recebe `vod-detail--movie`

**Critério de Conclusão**: `npx vitest run src/features/movies src/features/series` verde; capturas com e sem backdrop sem área vazia e com texto legível; série idêntica à captura de T002.

**Checkpoint**: US1 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: n/a (sem contrato; ver plan)
- Testes executados:
- Pendências:

---

## Phase 3: User Story 2 - Elenco com foto e nome (Priority: P2)

**Objetivo**: cartões de elenco V14 com foto, nome e personagem.

**Independent Test**: abrir a aba Elenco, navegar pelos cartões, voltar.

### Implementation

- [ ] T011 [US2] `CastPeoplePanel`/`PersonPhoto` em `tv-web/src/features/vod/DetailMetadata.tsx`: manter a estrutura (`data-person-key`, `personFocusKey`, `onSelectPerson`) e ajustar só o markup necessário ao cartão V14 (FR-005, FR-009, FR-010)
- [ ] T012 [US2] CSS em `vod.css` (bloco `.vod-detail--movie`): cartão com foto em proporção V14, nome em `--text-primary`, personagem em `--text-secondary`, foco com a receita V14, iniciais como fallback (SC-003)
- [ ] T013 [US2] Estado sem elenco/carregando: mensagem V14 e foco permanece nas abas (FR-008) — conferir `CastPanel`

### Testes da Fase

- [ ] T014 [P] [US2] Estender `tv-web/src/features/movies/MovieDetailScreen.elenco.test.tsx` **sem remover asserções** (ou arquivo novo): foto com falha mostra iniciais; personagem só quando informado

**Critério de Conclusão**: `npx vitest run src/features/movies/MovieDetailScreen.elenco.test.tsx src/features/vod` verde; captura da aba Elenco com foto e com iniciais.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: n/a
- Testes executados:
- Pendências:

---

## Phase 4: User Story 3 - Semelhantes com "Na sua lista" (Priority: P2)

**Objetivo**: cartões de Semelhantes V14 com selo "Na sua lista" evidente.

**Independent Test**: abrir Semelhantes com TMDB configurado; só os presentes no catálogo têm o selo.

### Implementation

- [ ] T015 [US3] `SimilarPanel.tsx`: manter `FOUND_LABEL`, `NOT_FOUND_LABEL` e `STATE_TEXT` (D-006); ajustar só classes necessárias
- [ ] T016 [US3] CSS em `vod.css` sob `.vod-detail--movie`: `.similar-chip--found` com fundo `--accent` / `--accent-ink` (legível sobre o pôster), `.similar-chip` neutro; fileira com rolagem do foco visível (FR-006, FR-007)
- [ ] T017 [US3] Estados `loading`/`no_key`/`no_match`/`empty`/`unavailable` com visual V14 e `Configurar TMDB` focável em `no_key` (FR-008)

### Testes da Fase

- [ ] T018 [P] [US3] Rodar `SimilarPanel.test.tsx` e `MovieDetailScreen.semelhantes.contract.test.tsx` (devem seguir verdes sem edição); acrescentar teste de que apenas `localItemId` definido mostra `FOUND_LABEL`, em arquivo novo

**Critério de Conclusão**: testes existentes de Semelhantes verdes sem edição; captura mostra selo só nos presentes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: n/a
- Testes executados:
- Pendências:

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T019 E2E: roteiro em `tv-web/e2e/` do detalhe do filme (hero, marcar assistido, abas Elenco e Semelhantes, aba/1º cartão dentro da viewport — R-005); registrar no runner `e2e/run.mjs` se necessário
- [ ] T020 Comparar capturas antes/depois: filme (novo), série (idêntica), Filmes/Séries/Live/Início (inalterados)
- [ ] T021 Consultar `docs/guia-praticas-app-tv/` (foco, mídia) e registrar no `plan.md`
- [ ] T022 Rodar `quickstart.md`
- [ ] T023 `update-feature-status.ps1 -Slug 051-detalhe-filme-paridade-v14 -Status Implementada`; atualizar `plan.md` (Estado Atual, Execution Notes, PRÓXIMO); **não** editar `CLAUDE.md`

### Checklist de Release

- [ ] Fase 2 (US1) concluída
- [ ] Fase 3 (US2) concluída
- [ ] Fase 4 (US3) concluída
- [ ] `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build` verdes
- [ ] Travas de contrato de outras features íntegras (`check-contract-tests.ps1` de 035, 050, 049, 046, 025)
- [ ] `npm run test:e2e` completo verde
- [ ] `quickstart.md` executado
- [ ] Passada na TV física (recomendação)

---

## Dependencies & Execution Order

- Setup → US1 → US2/US3 (independentes entre si, mas todos editam `vod.css`: **sequenciais**, um bloco de cada vez, para não conflitar) → Polish.
- T007, T012 e T016 tocam o mesmo arquivo: não paralelizar.

## Implementation Strategy

MVP = US1. Parar e validar com captura antes de seguir para US2/US3.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Commitar por fase; cuidado com o diff da 050 ainda não commitado em `vod.css` (R-001).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
