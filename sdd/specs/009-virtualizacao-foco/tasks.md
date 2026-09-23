---
description: "Tasks de implementação — Virtualização de Grades e Foco Direcional (replanejado 23/09/2026)"
---

# Tasks: Virtualização de Grades e Foco Direcional

**Input**: Documentos de design de `sdd/specs/009-virtualizacao-foco/`

**Prerequisites**: plan.md, spec.md, research.md, logic/virtualizacao-foco.md, quickstart.md

**Organization**: Tasks agrupadas por user story (spec.md só formaliza US1 —
Live TV) mais uma fase de extensão de escopo (D-003 do `plan.md`, decisão
do usuário em 23/09/2026) cobrindo Filmes e Séries com o mesmo padrão.

**Nota de replanejamento**: este arquivo substitui o `tasks.md` de
22/09/2026 por inteiro. As Fases 1/2 daquela versão (`@tanstack/react-virtual`
instalado; `virtualFocusHelper.ts` construído) partiam de uma engine de foco
(Norigin) que nunca existiu neste projeto e de uma estrutura de tela que a
feature 010 já substituiu — ver `plan.md` → Riscos e Decisões R-001/R-002.
A dependência instalada continua válida (Fase 1 abaixo só confirma); o
helper de foco é descartado, não adaptado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story a task pertence (US1 = spec.md; sem
  marcação = extensão de escopo D-003)

## Path Conventions

- **Telas**: `tv-web/src/features/live/`, `tv-web/src/features/movies/`, `tv-web/src/features/series/`
- **Camada de dados/consulta**: `tv-web/src/features/catalog/catalogApi.ts`
- **Hooks de foco/virtualização**: `tv-web/src/lib/focus/`
- **Estilos**: `tv-web/src/features/screens.css`
- **Backend `api/`**: NÃO é tocado por esta feature (ADR-008)

---

## Phase 1: Setup

**Goal**: Confirmar a fundação que sobrevive do replanejamento e descartar
o que não sobrevive.

**Implementation**:

- [X] T001 [P] Confirmar `@tanstack/react-virtual` em
      `tv-web/package.json` (já instalado em 22/09/2026) e que
      `npm run build` continua limpo com ele presente — sem reinstalar.
- [X] T002 Remover `tv-web/src/lib/focus/virtualFocusHelper.ts` e
      `tv-web/src/lib/focus/virtualFocusHelper.test.ts` (D-006 do
      `plan.md`) — construídos para foco por chave de DOM, que este
      projeto não usa. Descartar, não adaptar.

**Tests**:

- [X] T003 Nenhum teste novo — confirmação de dependência e remoção de
      arquivo. `npm run test` continua verde depois da remoção (nenhum
      outro arquivo importa `virtualFocusHelper`).

**Critério de Conclusão**: dependência confirmada, helper anterior fora do
repositório, suíte continua verde.

**Registro da Fase**:

- Status: Concluído
- Feito: confirmado `@tanstack/react-virtual` ^3.14.13 em `package.json`
  (sem reinstalar); removidos `virtualFocusHelper.ts` e
  `virtualFocusHelper.test.ts` (eram rastreados pelo git — `git rm`),
  diretório `tv-web/src/lib/focus/` ficou vazio e saiu do working tree.
  Confirmado por busca que nenhum outro arquivo importava o helper.
- Testes executados: `npx vitest run` — 256/256 (28 arquivos, 5 a menos
  que antes — exatamente os do helper removido). `npm run build` limpo
  (`tsc -b && vite build`, 372ms).
- Pendências: nenhuma.

---

## Phase 2: Foundational (Bloqueante)

**Goal**: Construir os dois hooks novos que as telas vão consumir —
`useVirtualFocusSync` e `usePosterColumnWidth` — isolados de qualquer tela,
seguindo `logic/virtualizacao-foco.md` à risca.

**⚠️ CRITICAL**: Bloqueia as Fases 3 e 4.

### Testes da Fase

- [X] T004 [P] Em `tv-web/src/lib/focus/useVirtualFocusSync.test.ts`:
      mudar `focusedIndex` chama `scrollToIndex(novoIndice, { align:
      'auto' })`; `enabled: false` nunca chama `scrollToIndex`
      (`logic/virtualizacao-foco.md` §2).
- [X] T005 [P] Em `tv-web/src/lib/focus/usePosterColumnWidth.test.ts`:
      largura de contêiner injetada via `ResizeObserver` mockado devolve
      `largura / cols`; sem medição ainda (`ResizeObserver` não disparou),
      devolve `0` sem lançar (`logic/virtualizacao-foco.md` §5,
      `research.md` R0-4).

### Implementation

- [X] T006 [P] Criar `tv-web/src/lib/focus/useVirtualFocusSync.ts`
      (`logic/virtualizacao-foco.md` §2) — um único `useEffect` reagindo a
      `focusedIndex`, sem `requestAnimationFrame`/`setTimeout` (não há
      engine de foco por DOM a esperar, D-001 do `plan.md`).
- [X] T007 [P] Criar `tv-web/src/lib/focus/usePosterColumnWidth.ts`
      (`logic/virtualizacao-foco.md` §5) — `ResizeObserver` no contêiner
      informado, devolve largura de coluna em pixels.
- [X] T008 **Resolvida por caminho diferente do previsto.** Mudar
      `.poster-grid`/`.category-content` para posicionamento absoluto
      agora, sem nenhuma tela consumindo ainda, quebraria a grade das
      telas de Filmes/Séries no intervalo até a Fase 4 (`MoviesScreen.tsx`/
      `SeriesScreen.tsx` continuam usando `display: grid` com `.map()`
      simples até lá). O CSS de cada tela passa a entrar **junto** com a
      task que a virtualiza — `.live-item` (altura fixa) em T011 (Fase 3);
      `.poster-grid` (posicionamento absoluto por `lanes`) em T015/T016
      (Fase 4). Nada de estilo compartilhado sobrou para preparar
      isoladamente aqui.

**Critério de Conclusão**: os dois hooks existem, testados isoladamente;
nenhuma tela ainda os consome.

**Checkpoint**: fundação pronta — Fases 3 e 4 podem começar.

**Registro da Fase**:

- Status: Concluído
- Feito: `useVirtualFocusSync.ts` (um `useEffect` reagindo só a
  `focusedIndex`/`enabled`, com `scrollToIndexRef` para não rearmar por
  mudança de identidade de `scrollToIndex` — mesmo padrão de
  `handlersRef` em `useRemoteNav.ts`) e `usePosterColumnWidth.ts`
  (`ResizeObserver`, largura/`cols`). T008 **resequenciada**: preparar o
  CSS de `.poster-grid`/`.live-item` sem nenhuma tela consumindo ainda
  quebraria Filmes/Séries no intervalo até a Fase 4 (ainda usam
  `display: grid` com `.map()` simples) — o CSS de cada tela passou a
  entrar junto com a task que a virtualiza (T011, T015/T016). Registrado
  em `plan.md` R-006.
- Testes executados: `npx vitest run` — 263/263 (30 arquivos, 7 novos).
  `npx tsc -b` e `npx oxlint` limpos.
- Pendências: nenhuma conhecida.

---

## Phase 3: User Story 1 — Rolagem infinita em lista de Canais sem travamento (P1) 🎯 MVP

**Objetivo**: A tela de Live TV (painel de canais, col 1) renderiza só o
que está na viewport, mesmo numa categoria com milhares de itens — sem o
teto artificial `CHANNELS_PER_GROUP_CAP`.

**Independent Test**: Cenários A, B e D do `quickstart.md`, restritos a
Live TV. Entregável sozinho: mesmo sem a Fase 4, canais deixam de travar a
TV e de truncar em 500.

### Testes da Fase

- [X] T009 [P] [US1] Em `tv-web/src/features/live/LiveScreen.test.tsx`:
      categoria mockada com milhares de canais monta só uma fração deles
      no DOM (não todos).
- [X] T010 [US1] Em `LiveScreen.test.tsx`: mover o foco para um índice fora
      da janela renderizada aciona `scrollToIndex` e o item correspondente
      aparece com a classe `tv-focus` depois do próximo render.

### Implementation

- [X] T011 [US1] Em `LiveScreen.tsx`: painel de canais (col 1) passa a usar
      `useVirtualizer` (lista 1D, sem `lanes`) + `useVirtualFocusSync`
      (`logic/virtualizacao-foco.md` §3), no lugar do `.map` direto sobre
      `items`. Inclui o CSS que a T008 resequenciou: em
      `tv-web/src/features/screens.css`, altura fixa para
      `.live-column-channels .live-item` (escopada só ao painel de
      canais — a trilha de categorias em `.live-column-groups` usa a
      mesma classe `.live-item` e **não pode** ganhar altura fixa, D-004),
      e o contêiner do painel preparado para itens posicionados de forma
      absoluta (`position: relative`, altura igual a `getTotalSize()`).
- [X] T012 [US1] Em `tv-web/src/features/catalog/catalogApi.ts`,
      `loadCategoryContent`: quando `category.kind === 'channel'`, a
      chamada a `listChannels` deixa de usar `CHANNELS_PER_GROUP_CAP` como
      limite (usar `Number.MAX_SAFE_INTEGER`, mesmo padrão de "sem teto"
      que `catalogRepository.ts` já usa em `KEY_MAX`). Filmes e séries
      **continuam** com o teto até a Fase 4 — ver "Ordem interna crítica"
      abaixo.

**Critério de Conclusão**: abrir uma categoria de canais com milhares de
itens rola sem travar, sem truncar em 500, com foco visível em qualquer
posição.

**Checkpoint**: US1 concluída — entregável isoladamente.

**Registro da Fase**:

- Status: Concluído
- Feito: `LiveScreen.tsx` passa a usar `useVirtualizer` (lista 1D, sem
  `lanes`) para o painel de canais (col 1), sincronizado por
  `useVirtualFocusSync` (Fase 2). CSS que a T008 resequenciou entrou junto
  (`screens.css`): `.live-column-channels .live-item` ganhou altura fixa
  (72px) e posicionamento absoluto — escopado à coluna de canais, sem
  afetar `.live-column-groups .live-item` (D-004); `.live-channel-list`
  (novo, `flex:1; min-height:0; overflow:auto`) e `.live-channel-list-inner`
  (spacer com `height: getTotalSize()`) formam o par padrão de virtualização
  do TanStack Virtual, aninhados dentro de `.live-column-channels` junto do
  título e das mensagens de estado (que continuam em fluxo normal, fora da
  janela virtual). `catalogApi.ts`/`loadCategoryContent`: canais passam a
  ler com `limit = Number.MAX_SAFE_INTEGER` (mesmo padrão de "sem teto" que
  `catalogRepository.ts` já usa em `KEY_MAX`); filmes/séries continuam com
  `CHANNELS_PER_GROUP_CAP` até a Fase 4 (T017).
  **Achado durante a fase, sem task nova (bug inline, corrigido dentro das
  próprias T009/T010)**: `research.md`/`logic/virtualizacao-foco.md`/
  `quickstart.md`, citados como prerequisitos deste `tasks.md` e pelos hooks
  da Fase 2, nunca chegaram a ser commitados neste repositório (confirmado
  por `git log --all` — zero ocorrências) — existiram só como estado não
  commitado de uma sessão anterior e não sobreviveram à troca de container.
  Implementação desta fase seguiu as decisões já registradas em `plan.md`
  (D-001 a D-006) e a descrição detalhada de cada task em vez do
  pseudocódigo normativo perdido. Registrado como R-007 abaixo —
  recomendação: rodar `sdd-plan` de novo só para regenerar esses três
  arquivos antes da Fase 4, já que T015/T016 citam `logic/virtualizacao-foco.md`
  §4 e `research.md` R0-1 explicitamente.
- Testes executados: `npx vitest run` (`tv-web/`) — 265/265 (30 arquivos, 2
  novos: T009/T010 em `LiveScreen.test.tsx`). `npx tsc -b` limpo. `npx oxlint`
  limpo (1 aviso informativo, não bloqueante, sobre `useVirtualizer` retornar
  funções não memoizáveis — esperado para esta API, documentado em R-008).
  `npm run build` limpo (`tsc -b && vite build`, chunks inalterados fora de
  `index.js`/`index.css`).
  T009/T010 exigiram um achado de teste não previsto (corrigido inline, sem
  task nova): jsdom não implementa `Element.scrollTo` nem faz layout real —
  sem mockar `offsetHeight`/`offsetWidth` **e** `clientHeight`/`scrollHeight`
  juntos, o `getMaxScrollOffset()` interno do `@tanstack/virtual-core`
  grampeia todo `scrollToIndex` em 0 (`scrollHeight - clientHeight = 0 - 0`),
  e a janela nunca se move mesmo com o resto mockado certo. Documentado como
  R-008, relevante de novo na Fase 4 (`MoviesScreen.test.tsx`/
  `SeriesScreen.test.tsx`, T013/T014).
- Pendências: nenhuma conhecida para o escopo de US1. Verificação na TV
  física (rolagem/latência reais, SC-001/SC-002) fica para a Fase 5
  (T018), que cobre as três telas de uma vez.

---

## Phase 4: Extensão de escopo — Filmes e Séries (D-003)

**Goal**: Aplicar o mesmo padrão da Fase 3 às grades de pôsteres de Filmes
e Séries, que a feature 010 deu a mesma estrutura de trilha + conteúdo que
a Live TV. **Fora da letra original de `spec.md`** ("Fora de Escopo": só
Live TV) — decisão explícita do usuário em 23/09/2026, registrada em
`plan.md` D-003.

**Independent Test**: Cenários A, C e D do `quickstart.md`, em Filmes e
Séries.

### Testes da Fase

- [X] T013 [P] Em `tv-web/src/features/movies/MoviesScreen.test.tsx`:
      categoria mockada com milhares de filmes monta só uma fração deles
      no DOM, distribuída em `GRID_COLS` colunas.
- [X] T014 [P] Em `tv-web/src/features/series/SeriesScreen.test.tsx`:
      mesmo teste para séries.

### Implementation

- [X] T015 [P] Em `MoviesScreen.tsx`: grade de pôsteres (col 1) passa a
      usar `useVirtualizer` com `lanes: GRID_COLS` + `usePosterColumnWidth`
      + `useVirtualFocusSync` (`logic/virtualizacao-foco.md` §4), no lugar
      da `<div className="poster-grid">` com `.map` direto. Inclui o CSS
      que a T008 resequenciou: `.poster-grid` troca `display: grid` por
      `position: relative` (a distribuição em colunas passa a vir de
      `left`/`width` em porcentagem por item, não mais de
      `grid-template-columns` — `research.md` R0-1), com altura igual a
      `getTotalSize()`.
- [X] T016 [P] Em `SeriesScreen.tsx`: mesmo tratamento (a mudança de CSS de
      `.poster-grid` em T015 já vale para as duas telas, por ser a mesma
      classe — nada novo a mudar em `screens.css` aqui).
- [X] T017 Em `catalogApi.ts`, `loadCategoryContent`: remover
      `CHANNELS_PER_GROUP_CAP` também para `movie`/`series` — as três
      seções passam a buscar a categoria inteira (D-002 completo). Depois
      desta task, `CHANNELS_PER_GROUP_CAP` fica sem nenhum consumidor em
      `catalogApi.ts` (a função `groupChannels()` que o declara já estava
      sem uso em produção desde a feature 010, R-012 — não é escopo desta
      feature remover o arquivo).

**Critério de Conclusão**: Filmes e Séries rolam sem travar em categorias
grandes, mantendo a grade de 6 colunas fluida.

**Checkpoint**: as três telas de categoria virtualizadas.

**Registro da Fase**:

- Status: Concluído
- Feito: `MoviesScreen.tsx`/`SeriesScreen.tsx` passam a usar `useVirtualizer`
  com `lanes: GRID_COLS` (6) + `usePosterColumnWidth` (mede a largura real
  do contêiner, feature 009 R0-2) + `useVirtualFocusSync`, seguindo
  `logic/virtualizacao-foco.md` §4 à risca — inclusive a constante
  `POSTER_ROW_EXTRA_PX` (68px: título + metadado + espaçamento entre
  linhas que a posição absoluta deixou de herdar do `gap` do CSS Grid).
  `screens.css`: `.poster-grid` troca `display: grid` por
  `position: relative; overflow: auto; flex: 1; min-height: 0`;
  `.poster-grid-inner` (spacer com `height: getTotalSize()`) e
  `.poster-cell` (posicionamento absoluto, `left`/`width` em porcentagem
  por `lane`) são novos — a mesma mudança de CSS vale para as duas telas,
  por usarem a mesma classe (T016 não precisou de nenhuma mudança própria
  em `screens.css`). `catalogApi.ts`: `loadCategoryContent` não aplica mais
  `CHANNELS_PER_GROUP_CAP` para nenhuma seção (D-002 completo) — o import
  do símbolo foi removido de `catalogApi.ts` (sem mais consumidor ali;
  `groupChannels()`/`CHANNELS_PER_GROUP_CAP` continuam existindo em
  `groupChannels.ts`, já sem uso em produção desde a feature 010, R-012 —
  não é escopo desta feature remover o arquivo).
- Testes executados: `npx vitest run` (`tv-web/`) — 267/267 (30 arquivos, +2
  novos: T013/T014). `npx tsc -b`, `npx oxlint` (3 avisos informativos, não
  bloqueantes, sobre `useVirtualizer` retornar funções não memoizáveis — um
  por tela virtualizada agora, mesmo aviso de R-008) e `npm run build`
  limpos.
  Achado inline durante T013/T014 (corrigido na própria task, sem task
  nova): `class FakeResizeObserver { constructor(private callback...) {} }`
  nos dois novos blocos de mock falha o build com
  `TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled`
  (vitest tolera, `tsc -b` não) — corrigido trocando a propriedade de
  parâmetro do construtor por um campo de classe normal atribuído no corpo
  do construtor, mesmo padrão que `usePosterColumnWidth.test.ts` já usava
  (lá com uma variável de closure em vez de campo de classe).
- Pendências: nenhuma conhecida para o escopo de D-003. Verificação visual
  da grade de 6 colunas fluidas (Cenário C do `quickstart.md`) e a
  verificação completa na TV física (Cenários A/B/D, SC-001/SC-002) ficam
  para a Fase 5 (T018).

---

## Phase 5: Polish & Cross-Cutting

**Goal**: Fechar verificação manual e documentação.

### Implementation

- [ ] T018 Rodar `quickstart.md` inteiro (5 cenários) na TV física ou no
      navegador de desenvolvimento — pelo menos os cenários A/B/D
      (travamento, foco visível, voltar) precisam da TV para valer como
      evidência de SC-001/SC-002; C/E podem ser conferidos no navegador.
      Registrar cada cenário como aprovado, reprovado ou não executado.
      **Precisa do usuário.**

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1 — Live TV) concluída
- [X] Fase 4 (Filmes/Séries, extensão D-003) concluída
- [ ] `npm run test`, `npm run lint` e `npm run build` passando
- [ ] `quickstart.md` executado, com veredito honesto por cenário
- [ ] Nenhum valor de layout hardcoded fora dos tokens de `index.css` (ADR-007)
- [ ] Nada em `api/` modificado

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1 (Setup)**: sem dependências.
- **Fase 2 (Foundational)**: depende da Fase 1 — BLOQUEIA Fases 3 e 4.
- **Fase 3 (US1)**: depende da Fase 2.
- **Fase 4 (extensão D-003)**: depende da Fase 2; pode rodar em paralelo à
  Fase 3 (arquivos diferentes — `MoviesScreen.tsx`/`SeriesScreen.tsx` vs.
  `LiveScreen.tsx`), **exceto** pela task compartilhada em `catalogApi.ts`
  (T012 antes de T017, nunca ao contrário — ver abaixo).
- **Fase 5 (Polish)**: depende de Fases 3 e 4.

### Ordem interna crítica — teto de `catalogApi.ts`

T012 (remove o teto só para canais) e T017 (remove o teto para
filmes/séries) tocam a **mesma função** (`loadCategoryContent`) em
momentos diferentes de propósito: T017 só pode rodar **depois** de T015/
T016 (Filmes/Séries já virtualizados). Se o teto for removido para
filmes/séries antes de as telas saberem renderizar sob demanda, a mesma
trava que esta feature existe pra resolver volta — agora nessas duas
telas. T012 (só canais, Fase 3) é seguro mais cedo porque T011 já
virtualiza Live TV na mesma fase.

### Parallel Opportunities

- T001/T002 (Fase 1), T004/T005 e T006/T007 (Fase 2) tocam arquivos
  diferentes.
- Fase 3 e Fase 4 podem ser trabalhadas em paralelo depois da Fase 2,
  respeitando a ordem interna crítica acima para `catalogApi.ts`.
- T013/T014 e T015/T016 tocam arquivos diferentes (movies vs. series).

---

## Implementation Strategy

### MVP (US1 — Fases 1+2+3)

1. Fase 1 — confirmar dependência, descartar o helper anterior.
2. Fase 2 — hooks de sincronização e medição, testados isolados.
3. Fase 3 — Live TV virtualizada. **Parar e medir na TV**: rolagem numa
   categoria de milhares de canais não trava?

### Incremental Delivery

US1 (Live TV) sozinha já resolve o bloqueio original medido. A Fase 4
estende o mesmo padrão a Filmes/Séries por decisão de escopo (D-003), sem
quebrar a Fase 3.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Parar em cada checkpoint para validar a story isoladamente
- Nenhuma task é concluída com `npm run test` ou `npm run lint` vermelhos

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
