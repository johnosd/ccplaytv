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

- [X] T018 Rodar `quickstart.md` inteiro (5 cenários) na TV física ou no
      navegador de desenvolvimento — pelo menos os cenários A/B/D
      (travamento, foco visível, voltar) precisam da TV para valer como
      evidência de SC-001/SC-002; C/E podem ser conferidos no navegador.
      Registrar cada cenário como aprovado, reprovado ou não executado.
      **Precisa do usuário.**
      Veredito por cenário (23/09/2026, todos na TV física):
      - **A — Aprovado** (na segunda rodada, depois de T019): segurando ▼
        continuamente em Live TV/Filmes/Séries, sem travar, sem atraso
        acumulando.
      - **B — Aprovado** (na segunda rodada, depois de T020): foco visível
        e a trilha rola pra acompanhá-lo, em qualquer ponto da lista.
      - **C — Aprovado**: grade de Filmes/Séries manteve 6 colunas do
        mesmo tamanho do início ao fim da rolagem; última linha parcial
        navegou sem erro.
      - **D — Aprovado**: voltar de um item restaura o foco exatamente
        nele, visível, sem rolar manualmente.
      - **E — Aprovado**: carregando, erro e categoria vazia nas três
        telas continuaram com elemento em destaque navegável, "Tentar de
        novo" respondendo a OK.
- [X] T019 **Ad-hoc, descoberta durante T018 (Cenário A na TV física,
      Filmes/Séries).** O usuário reportou cards de pôster "se fundindo e
      entrelaçados". Dois bugs reais, ambos em código da Fase 4:
      1. **`usePosterColumnWidth` nunca media nada.** Seu `useEffect` tinha
         `[containerRef, cols]` como dependências — mas o `<div
         ref={gridContainerRef} className="poster-grid">` só existe no DOM
         depois que o conteúdo carrega (`items.length > 0`), várias
         renderizações depois da montagem do componente. Nem a identidade
         do objeto `ref` nem `cols` mudam quando o `<div>` passa a existir,
         então o efeito nunca rodava de novo: `columnWidth` ficava travado
         em `0`, `rowHeight` no mínimo (`POSTER_ROW_EXTRA_PX`), e cada
         linha da grade saía pequena demais — sobrepondo a linha debaixo
         com o conteúdo real, muito mais alto. Reescrito para callback ref
         (`setContainerRef`), que o React chama exatamente quando o nó
         monta, não só na montagem do componente.
      2. **`loadCategoryContent` usava `Number.MAX_SAFE_INTEGER` como
         `limit` do Dexie** (D-002 completo, T017) — mas esse `limit`
         chega até `IDBIndex.getAll(query, count)`, e `count` é validado
         pelo navegador como `unsigned long` do WebIDL (máximo
         `2**32 - 1`). Um valor maior lança `TypeError`, confirmado
         reproduzindo no Chrome de desktop (`npm run dev`); a TV
         (Chromium 108) provavelmente cai num caminho de compatibilidade
         que não valida isso — por isso o efeito na TV era visual (bug 1
         sobrepondo cards reais), não um erro. Corrigido para
         `0xffffffff` (`NO_LIMIT`, `catalogApi.ts`), o teto real do
         navegador.
      **Achado relacionado, corrigido junto**: nenhuma das três telas
      distinguia `content.isError` (a consulta lançou) de "categoria
      vazia" — um erro não categorizado por `categoryLoader` cairia
      silenciosamente no estado de lista vazia em vez de um estado de
      erro de verdade. `contentFailed` em `LiveScreen`/`MoviesScreen`/
      `SeriesScreen` passou a checar `content.isError` também.
      Regressão coberta por `usePosterColumnWidth.test.ts` reescrito (5
      testes, incluindo o cenário exato do bug 1: ref que só anexa depois
      da montagem). Suíte: 268/268, `tsc`/`oxlint`/`build` limpos.
      **Segunda rodada (mesmo achado, corrigido no primeiro reteste na TV
      física)**: o fix acima resolveu no navegador de desenvolvimento
      (confirmado com dados sintéticos via Playwright) mas **não** na TV —
      o usuário reportou o mesmo sintoma depois de reinstalar. Causa: o
      `useVirtualizer` mede e **guarda em cache** o tamanho de cada item na
      primeira vez que o vê; se essa primeira medição acontecer antes do
      `ResizeObserver` disparar (`columnWidth` ainda `0`), o `rowHeight`
      mínimo fica preso naquele item pra sempre — passar um `estimateSize`
      novo em renders seguintes **não invalida** o que já foi medido, só
      `virtualizer.measure()` faz isso (confirmado contra a documentação
      oficial do TanStack Virtual, que recomenda exatamente este padrão:
      `useLayoutEffect(() => virtualizer.measure(), [virtualizer, width])`
      para quando a largura vem de medição assíncrona). O bug sobrevivia
      no navegador de desenvolvimento só por sorte de tempo (a corrida
      entre a primeira medição do virtualizador e o primeiro disparo do
      `ResizeObserver` tende a favorecer o `ResizeObserver` num desktop
      rápido; a TV, mais lenta, perdia essa corrida). Corrigido com
      `useEffect(() => virtualizer.measure(), [rowHeight, virtualizer])`
      em `MoviesScreen.tsx`/`SeriesScreen.tsx`. Suíte: 268/268 (mesma
      contagem — nenhum teste novo cobre isto: exigiria simular a corrida
      de tempo real entre medição e `ResizeObserver`, que jsdom não tem
      como reproduzir de forma significativa; a evidência é a TV física).
      `tsc`/`oxlint`/`build` limpos.
- [X] T020 **Ad-hoc, descoberta durante T018 (Cenário B na TV física, Live
      TV).** O usuário reportou que o foco "desce e some" navegando pela
      **trilha de categorias** (não o painel de canais, já virtualizado e
      corrigido em T019). Achado **fora do escopo de virtualização desta
      feature** (D-004 exclui a trilha de propósito) — pré-existente desde
      a feature 010, exposto só agora por uma fonte real com dezenas de
      categorias. Confirmado com o usuário antes de corrigir (desvio
      pequeno registrado, não silencioso).

      Causa: `.live-column-groups`/`.category-content`'s trilha
      (`.live-column`) tem `overflow: auto` — pode rolar — mas nada no
      código chamava rolagem alguma quando o índice focado mudava. O foco
      é comunicado por uma classe CSS (`tv-focus`), não foco real de DOM,
      então o comportamento nativo do navegador de rolar um elemento
      focado pra dentro da tela nunca se aplicava aqui.

      Corrigido com `tv-web/src/lib/focus/useScrollFocusedIntoView.ts`
      (novo): um `useRef` anexado ao botão da categoria focada, com um
      `useEffect` chamando `scrollIntoView({ block: 'nearest', inline:
      'nearest' })` quando o índice muda. Conectado nas três telas
      (`LiveScreen`/`MoviesScreen`/`SeriesScreen` — as três compartilham a
      mesma trilha). jsdom não implementa `Element.scrollIntoView`
      (achado ao rodar a suíte após a mudança) — polyfill de no-op
      acrescentado a `src/setupTests.ts`, já que os testes verificam
      índice/identidade do foco, nunca a posição real de rolagem (isso só
      a TV confirma). Testes novos:
      `useScrollFocusedIntoView.test.ts` (2 casos). Suíte: 270/270,
      `tsc`/`oxlint`/`build` limpos.

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1 — Live TV) concluída
- [X] Fase 4 (Filmes/Séries, extensão D-003) concluída
- [X] `npm run test`, `npm run lint` e `npm run build` passando
- [X] `quickstart.md` executado, com veredito honesto por cenário
- [X] Nenhum valor de layout hardcoded fora dos tokens de `index.css` (ADR-007)
- [X] Nada em `api/` modificado

**Registro da Fase**:

- Status: Concluído
- Feito: `quickstart.md` rodado na TV física com o usuário — 5/5 cenários
  aprovados (A e B só na segunda rodada, depois de T019/T020). Três bugs
  reais encontrados e corrigidos ao longo da verificação: (1)
  `usePosterColumnWidth` nunca media a largura real (ref nunca anexava);
  (2) `Number.MAX_SAFE_INTEGER` como `limit` do Dexie lançava `TypeError`
  no `IDBIndex.getAll` nativo; (3) o virtualizador cacheava a medição
  errada de antes do `ResizeObserver` disparar, exigindo
  `virtualizer.measure()` explícito (T019); (4) a trilha de categorias —
  fora do escopo de virtualização desta feature, mas corrigida com
  autorização do usuário — não rolava sozinha pra acompanhar o foco
  (T020, `useScrollFocusedIntoView` novo).
- Testes executados: `npx vitest run` — 270/270 (31 arquivos). `npx tsc -b`
  e `npx oxlint` limpos (só os 3 avisos informativos de sempre sobre
  `useVirtualizer`). `npm run build`/`npm run build:tizen` limpos, com 4
  reinstalações sucessivas na TV física (QN50Q60DAGXZD) ao longo da
  verificação.
- Pendências: nenhuma conhecida.

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
