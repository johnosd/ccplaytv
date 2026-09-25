---
description: "Tasks da feature 015-capa-real-filmes-series"
---

# Tasks: Capa Real de Filmes e Séries

**Input**: Documentos de design de `sdd/specs/015-capa-real-filmes-series/`

**Prerequisites**: plan.md, spec.md, data-model.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/`; lógica de catálogo em `tv-web/src/lib/catalog/`
  (telas nunca falam com Dexie direto); componente compartilhado em
  `tv-web/src/components/`; telas em `tv-web/src/features/`.
- Testes Vitest ao lado do arquivo testado (`*.test.ts`/`*.test.tsx`), com
  `fake-indexeddb` para Dexie.
- E2E em `tv-web/e2e/*.mjs`, dados fictícios em `tv-web/e2e/fixtures/`,
  servidor HTTP local criado pelo próprio script (padrão de
  `e2e/m3u-sob-demanda.mjs`).
- Backend `api/` não é tocado (ADR-008).

---

## Phase 1: Setup

**Purpose**: fixtures fictícias reaproveitadas por US1, US2 e Polish.

- [X] T001 [P] Criar `tv-web/e2e/fixtures/capa-real/`: duas imagens PNG
  pequenas e válidas (`capa-filme.png`, `capa-serie.png`) e `lista.m3u` com:
  um filme com `tvg-logo` apontando pra `capa-filme.png`; um filme **sem**
  `tvg-logo`; dois episódios `SxxEyy` de uma série com o mesmo `tvg-logo`
  apontando pra `capa-serie.png`; um canal com `tvg-logo` preenchido
  (prova que Live TV ignora, FR-009); um filme com `tvg-logo` apontando
  pra um caminho que o servidor fictício do E2E vai responder 404 (capa
  quebrada, US2); uma categoria própria só de filmes com capa (dezenas de
  itens, mesmo `tvg-logo` reaproveitado), para o cenário da janela
  virtualizada (D-007/US2).

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: `tv-web/e2e/fixtures/capa-real/capa-filme.png` e `capa-serie.png`
  (PNGs 1×1 fictícios válidos, gerados de base64 conhecido). **Ajuste em
  relação ao plano original**: `lista.m3u` **não** virou arquivo estático
  — as URLs de `tvg-logo` precisam ser de fato buscáveis pelo navegador
  (diferente de `directUrl`, nunca buscado nos E2E anteriores), e a porta
  do servidor HTTP local só existe em tempo de execução
  (`server.listen(0, ...)`). O conteúdo do M3U é montado inline em
  `tv-web/e2e/capa-real.mjs` (T019), com um template literal que
  interpola a porta nas URLs de `tvg-logo` que apontam pros PNGs desta
  pasta — mesma razão estrutural por que os servidores fictícios de
  `e2e/m3u-sob-demanda.mjs` constroem JSON inline em vez de ler de
  arquivo estático para os endpoints do painel. Registrado aqui em vez de
  fingir que o plano previu exatamente isso.
- Testes executados: nenhum ainda (fixtures puras, consumidas pela T019).
- Pendências: nenhuma.

---

## Phase 2: Foundational

**Purpose**: schema, DTO de fronteira e o componente compartilhado que as
duas user stories consomem.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T002 [P] `tv-web/src/components/PosterArt.test.tsx` (novo): com `url`
  presente, renderiza `<img src={url} loading="lazy" decoding="async">`;
  sem `url` (`undefined`), nunca monta `<img>`; ao disparar `onError` na
  `<img>`, ela some e o placeholder (textura + título) fica visível, sem
  nova tentativa automática; o placeholder está sempre presente no DOM
  (por baixo), em qualquer um dos três estados.

### Implementation

- [X] T003 [P] `tv-web/src/lib/catalog/db.ts`: `CatalogRecord.iconUrl?: string`
  (data-model.md §1). Comentário curto explicando por que **não** há bump
  de versão (D-009 do plan.md) — campo de valor, sem índice.
- [X] T004 [P] `tv-web/src/features/catalog/catalogApi.ts`:
  `CatalogItemOut.icon_url?: string | null`; `toItemOut` inclui
  `icon_url: record.iconUrl ?? null`.
- [X] T005 `tv-web/src/components/PosterArt.tsx` (novo) +
  `tv-web/src/features/screens.css` (classes novas, reaproveitando
  `.poster-box`/`.poster-box-noise`/`.poster-box-label` como camada de
  placeholder sempre presente): componente com as props `url?: string`,
  `title: string`, `focused?: boolean` — ver `plan.md` D-005/D-006/D-007
  para o comportamento exato (fallback, `onError` definitivo, `lazy`/
  `async`, nunca bloqueia foco).

**Critério de Conclusão**: `PosterArt` testado isoladamente cobre exibição,
fallback por ausência e fallback por falha de carregamento, sem
re-tentativa; schema e DTO prontos para receber o campo (ainda não
populado por nenhum caminho de importação — isso é a US1).

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: `PosterArt.tsx` (props `url?`, `title`, `focused?`, `children?` —
  o `children` foi um acréscimo em relação ao plano original, pra
  `MoviesScreen`/`SeriesScreen` continuarem sobrepondo o `.fav-star` como
  hoje, já que `PosterArt` passou a ser dona do `.poster-box` inteiro, não
  só da parte de imagem). `failedUrl` (string, não boolean) como estado —
  compara com a `url` atual em vez de um booleano simples, pra uma URL
  nova depois de uma falha tentar carregar de novo automaticamente sem
  precisar de `useEffect`/reset explícito. `db.ts`: `CatalogRecord.iconUrl`.
  `catalogApi.ts`: `CatalogItemOut.icon_url`, `toItemOut`. `screens.css`:
  `.poster-box-art` (absolute, `object-fit: cover`, cobre `.poster-box`).
  **Achado nos meus próprios testes iniciais (corrigido antes de prosseguir,
  não é bug do componente)**: `getByText('Um Filme')` falhava por causa do
  `<br />` dentro do label (texto quebrado em nós) — trocado para regex
  `/Um Filme/`; `getByRole('img')` não achava a `<img>` porque `alt=""`
  (decorativo, de propósito — o label já anuncia o título, evitando
  duplicar pra leitor de tela) faz o navegador computar `role="presentation"`,
  não `role="img"` — trocado para `container.querySelector('img')`.
- Testes executados: `npm run test -- src/components/PosterArt.test.tsx
  src/features/catalog/catalogApi.test.tsx src/lib/catalog/db.test.ts`
  (38/38); `npm run lint` (só warnings pré-existentes); `npm run build`
  (limpo).
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Ver a capa real de um filme ou série (Priority: P1) 🎯 MVP

**Objetivo**: capturar a capa que a fonte já declara (Xtream ou M3U, nos
dois caminhos de importação — `on_demand` e `stored`) e mostrá-la nas
grades de Filmes e Séries no lugar do placeholder.

**Independent Test**: importar uma fonte cujo M3U (ou painel Xtream
simulado) declara capa para um filme e uma série; abrir Filmes e Séries;
a capa real aparece nos cards correspondentes; um item sem capa
declarada continua no placeholder.

### Testes da Fase

- [X] T006 [P] [US1] `tv-web/src/lib/catalog/classifier.test.ts`:
  `normalizeIconUrl` (D-001b) direto — string válida passa, vazia/só
  espaço/`new URL(...)` inválida vira `undefined`; e via `classifyEntry`:
  `tvg-logo` vira `iconUrl`, atributo ausente vira `iconUrl: undefined`
  (FR-008 — validação de forma acontece aqui, fonte única, `data-model.md` §3).
- [X] T007 [P] [US1] `tv-web/src/lib/catalog/xtreamConnector.test.ts`:
  `mapVodEntry` lê `raw.stream_icon`; `mapSeriesEntry` lê `raw.cover`;
  ambos tratam ausente/vazio/inválido como `undefined` (mesma regra de
  forma da T006); `mapLiveEntry` nunca ganha `iconUrl`, mesmo que `raw`
  tenha `stream_icon` preenchido (FR-009).
- [X] T008 [P] [US1] `tv-web/src/lib/catalog/m3uSeriesGrouping.test.ts`:
  o registro `series` sintético (primeira vez que a chave aparece) herda
  `iconUrl` do episódio que o originou; uma segunda entrada da mesma
  chave (que não recria a série) não altera nada.
- [X] T009 [P] [US1] `tv-web/src/lib/catalog/categoryLoader.test.ts`:
  `toItemRecord` propaga `iconUrl` do `MappedChannel` para o
  `CatalogRecord` gravado no caminho `on_demand`.
- [X] T010 [P] [US1] `tv-web/src/lib/catalog/importPipeline.test.ts`:
  `toStoredRecord` propaga `iconUrl` no caminho `stored` (varredura M3U),
  para item comum e para o registro `series` sintético (herdado na T008).
- [X] T011 [P] [US1] `tv-web/src/features/catalog/catalogApi.test.tsx`:
  `toItemOut` expõe `icon_url` certo a partir de `record.iconUrl`
  (presente e ausente).
- [X] T012 [P] [US1] `tv-web/src/features/movies/MoviesScreen.test.tsx` e
  `tv-web/src/features/series/SeriesScreen.test.tsx`: item com `icon_url`
  renderiza `PosterArt` com a URL certa; item sem `icon_url` continua no
  placeholder puro; suíte existente de foco/seleção/favorito permanece
  verde (sem regressão).

### Implementation

- [X] T013 [US1] `tv-web/src/lib/catalog/classifier.ts`: função nova
  `normalizeIconUrl(raw: unknown): string | undefined` (D-001b — trim,
  vazio/`new URL(...)` inválida vira `undefined`); `ClassifiedEntry.iconUrl?: string`;
  `classifyEntry` chama `normalizeIconUrl(entry.attributes['tvg-logo'])`
  (D-001, FR-002, FR-008).
- [X] T014 [P] [US1] `tv-web/src/lib/catalog/xtreamConnector.ts`
  (já importa de `classifier.ts` — sem import novo): `mapVodEntry` chama
  `normalizeIconUrl(raw.stream_icon)`; `mapSeriesEntry` chama
  `normalizeIconUrl(raw.cover)` (D-001/D-001b, FR-001, FR-008);
  `mapLiveEntry` explicitamente **não** tocado (FR-009).
- [X] T015 [US1] `tv-web/src/lib/catalog/m3uSeriesGrouping.ts`: o
  registro `series` sintético copia `entry.iconUrl` do episódio que
  origina a série (D-003).
- [X] T016 [P] [US1] `tv-web/src/lib/catalog/categoryLoader.ts`:
  `toItemRecord` inclui `iconUrl: channel.iconUrl`.
- [X] T017 [P] [US1] `tv-web/src/lib/catalog/importPipeline.ts`:
  `toStoredRecord` inclui `iconUrl: channel.iconUrl`.
- [X] T018 [US1] `tv-web/src/features/movies/MoviesScreen.tsx` e
  `tv-web/src/features/series/SeriesScreen.tsx`: substituir o bloco
  inline `.poster-box-noise` + `.poster-box-label` por `<PosterArt
  url={movie.icon_url ?? undefined} title={movie.name} focused={col === 1
  && movieIdx === virtualRow.index} />` (mesma expressão de foco que já
  monta a classe `tv-focus` hoje; `seriesIdx` no lugar de `movieIdx` em
  `SeriesScreen.tsx`) — manter o `fav-star` sobreposto como já é hoje.
- [X] T019 [US1] `tv-web/e2e/capa-real.mjs` (novo, usa as fixtures da
  T001) + `tv-web/package.json` (`test:e2e` ganha o script novo): cenário
  1 — importar a fonte fictícia, entrar em Filmes e em Séries, confirmar
  `<img>` com a URL certa nos itens que têm `tvg-logo`, placeholder nos
  que não têm.

**Critério de Conclusão**: capa real aparece nas duas grades pelos dois
caminhos de importação (`on_demand` via Xtream simulado e `stored` via
M3U); série sintética herda a capa do primeiro episódio; Live TV
comprovadamente intocado; cenário 1 do E2E passa.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (2026-09-24)
- Feito: `normalizeIconUrl` + `classifyEntry` (M3U, nunca pra canal — FR-009
  garantido no ramo `byGroup === 'channel'`, episódio sempre captura pra a
  série sintética herdar); `mapVodEntry`/`mapSeriesEntry` (Xtream,
  `stream_icon`/`cover`); série sintética (`m3uSeriesGrouping.ts`) herda o
  `iconUrl` do primeiro episódio; `categoryLoader.ts`/`importPipeline.ts`
  propagam `iconUrl` nos dois caminhos (`on_demand`/`stored`);
  `MoviesScreen.tsx`/`SeriesScreen.tsx` usam `<PosterArt>` no lugar do
  bloco inline; `e2e/capa-real.mjs` novo + `package.json`.
  **Achado corrigido durante a execução do E2E, não previsto no plano**:
  a primeira versão do script esperava `.poster-grid, .live-state` logo
  depois de entrar numa tela de categoria, antes de pressionar `ArrowRight`
  pra entrar de fato — mas esse seletor também casa com o `.live-state` de
  nível superior (`categoriesQuery.isLoading`), que aparece **antes** das
  categorias carregarem. Isso deixava o próximo `ArrowRight` correr o risco
  de entrar em "★ Favoritos" (vazia, primeira posição da trilha) em vez da
  categoria real, se disparado antes de `useCategoryList` resolver —
  intermitente o bastante pra passar em Filmes e falhar em Séries na mesma
  rodada. Corrigido esperando explicitamente `.live-item:not(.live-item-favorites)`
  (uma categoria real na trilha) antes de cada `ArrowRight` que entra numa
  categoria — aplicado nos três blocos (Live TV, Filmes, Séries); a
  asserção de Live TV também ganhou uma checagem de conteúdo real (nome do
  canal), porque a antiga (`count() === 0`) passaria do mesmo jeito mesmo
  se tivesse entrado em Favoritos por engano. Estável em 3 rodadas
  seguidas depois do ajuste.
- Testes executados: `npm run test -- src/lib/catalog/classifier.test.ts
  src/lib/catalog/xtreamConnector.test.ts src/lib/catalog/m3uSeriesGrouping.test.ts
  src/lib/catalog/categoryLoader.test.ts src/lib/catalog/importPipeline.test.ts
  src/features/catalog/catalogApi.test.tsx src/features/movies/MoviesScreen.test.tsx
  src/features/series/SeriesScreen.test.tsx` (todos verdes, arquivo por
  arquivo, ao longo da fase); `node e2e/capa-real.mjs` rodado 3x seguidas
  contra `npm run dev` depois do ajuste de navegação — 8/8 verificações nas
  três rodadas; `npm run test` completo — 663/666, as 3 falhas
  (`LiveScreen.favorites`/`MoviesScreen.favorites`/`SeriesScreen.favorites`)
  são o mesmo padrão de timer real sob carga já documentado nas features
  009/013/014, confirmadas 43/43 isoladas (junto com `LiveScreen.test.tsx`);
  `npm run lint` (só warnings pré-existentes); `npm run build` (limpo).
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Nunca ver uma imagem quebrada (Priority: P2)

**Objetivo**: provar, com teste automatizado, os dois comportamentos que
`PosterArt` e a virtualização já garantem por construção (Foundational):
falha de carregamento nunca vira ícone quebrado, e a capa só é requisitada
para o que está na janela virtualizada — nunca a categoria inteira de
uma vez (D-007, pedido explícito do usuário).

**Independent Test**: apontar a capa de um item para uma URL inválida ou
inacessível — o card mostra o placeholder, sem ícone de imagem quebrada
visível; numa categoria grande, contar requisições de imagem confirma que
só os itens visíveis (+ overscan) foram pedidos.

### Testes da Fase

- [ ] T020 [P] [US2] `tv-web/e2e/capa-real.mjs`, cenário 2: o item cujo
  `tvg-logo` aponta pra um caminho que o servidor fictício responde 404
  (fixture da T001) — a grade mostra o placeholder, sem nenhum elemento
  de imagem quebrada no DOM (checagem por seletor/atributo, não captura
  visual), e sem repetição de requisição em loop.
- [ ] T021 [US2] Mesmo arquivo, cenário 3 (D-007): entrar na categoria de
  dezenas de itens com capa (fixture da T001) sem rolar — o contador de
  requisições do servidor fictício fica preso ao tamanho da janela
  virtual (bem menor que o total da categoria); rolar a grade até o fim
  faz o contador crescer conforme novos itens entram na tela, nunca todas
  de uma vez no início.

### Implementation

Nenhuma implementação nova esperada — `PosterArt` (Foundational, T005) e a
janela de virtualização (feature 009, já existente em `MoviesScreen.tsx`/
`SeriesScreen.tsx`) já cobrem os dois cenários por construção. Se os
testes desta fase encontrarem uma lacuna real (ex.: contador maior que o
esperado, ícone quebrado aparecendo), a correção acontece **dentro desta
fase**, registrada em prosa no Registro da Fase (protocolo de bug do
`sdd-execute`) — não uma task nova pré-definida aqui.

**Critério de Conclusão**: nenhum ícone de imagem quebrada aparece em
nenhum cenário testado; o número de requisições de imagem observado no
E2E comprova a janela virtualizada, não a categoria inteira.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: regressão, documentação canônica, gates e verificação.

- [ ] T022 [P] Regressão: `npm run test -- src/features/live/LiveScreen.test.tsx`
  e `node e2e/m3u-sob-demanda.mjs` — confirmar que Live TV (FR-009) e o
  caminho `stored` da feature 014 continuam intocados.
- [ ] T023 [P] `CLAUDE.md`: avaliar, proporcionalmente, se o "Project
  status" precisa de nota sobre esta feature (provável que não — é uma
  mudança visual contida, sem novo caminho arquitetural; decidir na
  hora, não reescrever a seção à toa).
- [ ] T024 Revisão de segredos (constitution, Fluxo de Desenvolvimento):
  conferir no diff que nenhuma URL de capa aparece em log, mensagem de
  erro, texto de tela ou `console.*` (D-008 do plan.md).
- [ ] T025 Gates: `npm run test`, `npm run lint`, `npm run build`, e
  `npm run test:e2e` com `npm run dev` rodando. **Ciente de antemão**: o
  achado R-009 da feature 014 (`e2e.mjs` desatualizado, diálogo de saída
  que `AddSourceScreen` não tem mais) segue sem correção por decisão do
  usuário — vai continuar travando a cadeia combinada; rodar
  `node e2e/capa-real.mjs` isolado para validar esta feature
  especificamente, mesmo padrão já estabelecido na 014.
- [ ] T026 Rodar `quickstart.md` inteiro no navegador (cenários 1–7 e
  itens da constitution).

### Checklist de Release

- [ ] Fase 2 (Foundational) concluída
- [ ] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Nenhum vazamento de URL de capa (T024)
- [ ] Janela virtualizada comprovada por teste (T021)
- [ ] E2E `capa-real.mjs` verde (cenários 1–3)
- [ ] Live TV e feature 014 sem regressão (T022)
- [ ] `quickstart.md` executado com sucesso

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup só porque as fixtures
  existem para todas as fases seguintes usarem — `PosterArt`/schema/DTO em
  si não dependem delas. Bloqueia as duas user stories.
- **US1 (Phase 3)**: depende do Foundational.
- **US2 (Phase 4)**: depende do Foundational **e** da US1 (T018 — precisa
  que `PosterArt` já esteja de fato ligado às telas para o E2E ter o que
  testar).
- **Polish (Phase 5)**: depois das duas stories.

### Parallel Opportunities

- Foundational: T003/T004 juntos; T002 em paralelo com os dois.
- US1 — Testes: T006–T012 todos em paralelo (arquivos diferentes).
- US1 — Implementation: T014/T016/T017 em paralelo entre si; T013 e T015
  têm ordem própria (T015 depende do campo que T013 adiciona a
  `ClassifiedEntry`, herdado por `MappedChannel`).
- Polish: T022/T023 juntos.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Setup (fixtures)
2. Foundational (`PosterArt`, schema, DTO)
3. US1 → validar com o cenário 1 do E2E e no navegador
4. **PARAR E VALIDAR**

### Incremental Delivery

1. US1 → capa real aparecendo já entrega o valor pedido
2. US2 → prova formal do que já foi construído junto (fallback + janela
   virtualizada), reforça sem exigir implementação nova na maioria dos casos

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Nenhum campo de capa é inventado — só o que Xtream (`stream_icon`/
  `cover`) ou M3U (`tvg-logo`) já declaram (FR-011)

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
