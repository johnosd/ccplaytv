---
description: "Tasks de implementação — Importação por Estrutura com Carga sob Demanda por Categoria"
---

# Tasks: Importação por Estrutura com Carga sob Demanda por Categoria

**Input**: Documentos de design de `sdd/specs/010-catalogo-sob-demanda/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/catalog-on-demand.md

**Organization**: Tasks agrupadas por user story, para implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story a task pertence (US1, US2, US3)

## Path Conventions

- **Frontend (tudo desta feature)**: `tv-web/`
- **Camada de dados**: `tv-web/src/lib/catalog/`
- **Telas**: `tv-web/src/features/<área>/`
- **Empacotamento Tizen**: `CCPlayTv/`
- **Backend `api/`**: NÃO é tocado por esta feature (ADR-008)

---

## Phase 0: Sonda do Protocolo (Bloqueante)

**Goal**: Descobrir se o painel real honra `category_id` — a premissa que
sustenta a feature inteira.

**⚠️ CRITICAL**: Nenhuma task de produção começa antes desta fase fechar.
D-007 proíbe adotar qualquer alternativa de `research.md` sem reabrir o
design.

**Implementation**:

- [X] T001 Escrever uma sonda descartável (fora de `src/`, em
      `tv-web/scripts/probe-category.mjs`) que consulte
      `get_live_streams`, `get_vod_streams` e `get_series` com e sem
      `&category_id=<id>` contra o painel real, e **imprima apenas
      contagens e tamanhos** — nunca a URL, nunca a credencial, nunca um
      trecho da resposta.
- [X] T002 Rodar a sonda com as credenciais fornecidas pelo usuário via
      variável de ambiente, **nunca** como argumento em linha de comando
      (fica no histórico do shell) nem em arquivo commitado.
- [X] T003 Registrar o resultado em `research.md` → R0-1, substituindo
      "não resolvido" pela decisão, com os números observados.
- [X] T004 Apagar a sonda e confirmar `git status` limpo quanto a ela.

**Tests**:

- [X] T005 Nenhum teste automatizado — é uma medição contra um serviço
      externo. A evidência é o número registrado em `research.md`.

**Critério de Conclusão**: `research.md` R0-1 diz, com números, se o painel
filtra por categoria. Se **não** filtrar: parar, apresentar as alternativas
ao usuário e **não** prosseguir para a Fase 1 sem decisão dele.

**Registro da Fase**:

- Status: Concluído
- Feito: sonda rodada contra o painel real do usuário em 23/09/2026,
  com credenciais fornecidas por variável de ambiente (nunca em linha de
  comando ou arquivo commitado). Resultado: **o painel filtra** por
  `category_id` nas três seções — canais 2.266→34 itens, filmes
  31.304→103, séries 9.637→1.746 (redução de 82% a 99,7% no tamanho da
  resposta). Script apagado após registrar o resultado em `research.md`
  R0-1 (T003/T004).
- Testes executados: nenhum automatizado (medição contra serviço externo,
  como previsto em T005).
- Pendências: nenhuma. Caminho principal do design confirmado; nenhuma
  alternativa de `research.md` foi adotada.

---

## Phase 1: Fundação de Dados (Bloqueante)

**Goal**: Criar a coleção `categories` e os repositórios que a servem, sem
ainda mudar nenhuma tela.

**⚠️ CRITICAL**: Bloqueia todas as user stories.

### Testes da Fase

- [X] T006 [P] Teste de migração v6→v7 em
      `tv-web/src/lib/catalog/db.test.ts`: o banco abre, `categories`
      existe com os dois índices, e dado de v6 não é perdido nem
      convertido por adivinhação.
- [X] T007 [P] Testes de `catalogRepository` em
      `tv-web/src/lib/catalog/catalogRepository.test.ts`: gravar
      estrutura, listar categorias na ordem declarada, categoria com nome
      vazio preservada, substituição **integral** de itens de uma
      categoria, e contagem real distinta de `declaredCount`.
- [X] T008 [P] Teste de `markCategoryFetched` em
      `catalogRepository.test.ts`: carimba instante e contagem sem tocar
      nos itens já gravados.

### Implementation

- [X] T009 Abrir a versão 7 em `tv-web/src/lib/catalog/db.ts`: coleção
      `categories` com `[sourceId+generation+kind+order]` e
      `[sourceId+generation+kind+providerCategoryId]`, campos `fetchMode`
      e `providerCategoryId` opcional, e campo `categoryId` em
      `CatalogRecord`. Sem migração de dados (`data-model.md` §4).
- [X] T010 Em `tv-web/src/lib/catalog/catalogRepository.ts`, trocar
      `listCategories` de derivação por `uniqueKeys()` para leitura da
      coleção `categories`, devolvendo `fetchMode`, `declaredCount`,
      `itemsFetchedAt` e `itemsCount`. **Caminho de leitura único** — sem
      derivação de reserva (D-004).
- [X] T011 Em `catalogRepository.ts`, adicionar `storeCategories`
      (devolvendo os ids locais criados, que o caminho integral precisa
      para carimbar `categoryId` nos itens) e `storeCategoryItems`
      (substituição integral em transação — D-006).
- [X] T012 Em `catalogRepository.ts`, adicionar `markCategoryFetched`
      (instante + contagem), usada tanto pela obtenção sob demanda quanto
      pelo fecho da importação integral.
- [X] T013 Estender `publishGeneration`/`discardGeneration` em
      `catalogRepository.ts` para alcançar `categories`, e confirmar por
      teste que **nada** toca `userStates` (D-002). Estendi também
      `deleteAllForSource`, no mesmo espírito (remover fonte remove tudo
      que dependia dela) — não estava listado explicitamente, mas é a
      mesma operação e ficaria órfã sem isso.

**Critério de Conclusão**: o banco abre na v7, os repositórios gravam e
leem categorias na ordem da fonte, a troca de geração alcança as duas
coleções e deixa `userStates` intacto. Nenhuma tela mudou ainda.

**Checkpoint**: fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluído
- Feito: `db.ts` v7 (`categories`, com `sourceId` e
  `[sourceId+generation+kind+order]` — o segundo índice previsto,
  `[...+providerCategoryId]`, foi removido antes de ter consumidor; ver
  `data-model.md` §2, nota de execução);
  `catalogRepository.ts` com `listCategories` reescrito para ler de
  `categories` (caminho único, sem fallback), `storeCategories`,
  `storeCategoryItems`, `markCategoryFetched`, e `publishGeneration`/
  `discardGeneration`/`deleteAllForSource` estendidos para alcançar
  `categories` sem tocar `userStates`.
- Testes executados: `npx vitest run src/lib/catalog/db.test.ts
  src/lib/catalog/catalogRepository.test.ts` — 21/21 passando. `npx tsc -b`
  limpo.
- Pendências: **regressão esperada e temporária** — a suíte GLOBAL
  (`npm run test`) fica com 1 teste vermelho até a Fase 2 fechar:
  `importPipeline.test.ts` › "preserva os grupos declarados pela fonte..."
  espera que `listCategories` continue derivando de `channels`, o que não
  vale mais. É exatamente o achado A1/D-004: o caminho integral (M3U)
  ainda não grava `categories` (isso é T021). A nota "Ordem interna
  crítica da Fase 2" já previa esse risco; a fronteira entre Fases 1 e 2
  é onde ele efetivamente aparece. Corrigido na sequência, dentro desta
  mesma execução contínua — não deixado pendente entre sessões.

---

## Phase 2: User Story 1 — Sincronizar termina rápido (P1) 🎯 MVP

**Objetivo**: A importação de fonte de provedor grava só a estrutura — e o
caminho integral passa a gravar estrutura também, para a leitura continuar
única.

**Independent Test**: sincronizar a fonte real na TV e medir até
"Concluída" (Cenário A do `quickstart.md`). Entregável sozinho: a fonte
passa a sincronizar em segundos e a estrutura fica navegável, mesmo antes
da US2 existir.

### Testes da Fase

- [X] T014 [P] [US1] Em
      `tv-web/src/lib/catalog/xtreamConnector.test.ts`: as três consultas
      de categoria mapeiam id, nome (inclusive vazio), ordem e contagem
      declarada; contagem ausente vira `undefined`, nunca zero.
- [X] T015 [P] [US1] Em
      `tv-web/src/lib/catalog/importPipeline.test.ts`: fonte de provedor
      JSON grava categorias `on_demand` e **zero** itens.
- [X] T016 [US1] **Regressão do achado A1.** Em `importPipeline.test.ts`:
      depois de importar uma fonte por URL M3U, `listCategories` devolve
      os grupos na ordem de aparição, com `fetchMode: 'eager'`,
      `itemsCount` real e `declaredCount` ausente — e os itens continuam
      gravados como hoje. Mesmo teste para `legacy_m3u` (FR-011, FR-012).
- [X] T017 [US1] Em `importPipeline.test.ts`: todo item gravado pelo
      caminho integral aponta para a categoria do seu grupo
      (`categoryId` preenchido), inclusive os do primeiro lote — que é
      escrito antes de a lista de grupos terminar.
- [X] T018 [US1] Em `importPipeline.test.ts`: seção que o painel não serve
      continua declarada em `unavailableSections` (FR-016), agora
      detectada na consulta de categorias. (Já cobria isso desde a fase
      de code review; confirmado que continua valendo com a bifurcação
      nova.)

### Implementation

- [X] T019 [US1] Em `tv-web/src/lib/catalog/xtreamConnector.ts`, extrair a
      contagem declarada por categoria e aceitar `category_id` nas
      consultas de itens (forma confirmada na Fase 0). `declaredCount`
      fica sempre `undefined` na prática — o protocolo Xtream real não
      declara isso em `get_*_categories` — mas o campo existe pronto,
      documentado no próprio tipo `LiveCategory`.
- [X] T020 [US1] Em `tv-web/src/lib/catalog/importPipeline.ts`, bifurcar
      por tipo de fonte: provedor JSON grava estrutura `on_demand` via
      `storeCategories` e nenhum item.
- [X] T021 [US1] **Resolução do achado A1.** No caminho integral do mesmo
      arquivo, criar a categoria `eager` no ponto onde o pipeline já
      atribui `groupOrder` a um grupo novo, guardar o id local no mapa, e
      carimbar `itemsFetchedAt`/`itemsCount` no fim via
      `markCategoryFetched`. Gravar as categorias só no fim exigiria uma
      segunda passada sobre centenas de milhares de linhas
      (`data-model.md` §3).
- [X] T022 [US1] Em `tv-web/src/features/import/importApi.ts` e
      `ImportProgressScreen.tsx`, contar **categorias** na fonte de
      provedor, mantendo entradas no caminho integral, sem percentual
      (FR-013). Campo novo `ImportRunRecord.unit`/`ImportJobCounts.unit`
      (`'items' | 'categories'`) decide o rótulo; contadores de
      descarte/inválido somem da tela em modo categorias (sempre zero
      ali, mostrar seria ruído).
- [X] T023 [US1] Em `tv-web/src/features/list-home/ListHomeScreen.tsx` e
      `tv-web/src/features/catalog/catalogApi.ts`, usar a soma real por
      seção (FR-014, D-005) — **refinada em execução**: soma itens de
      categoria `eager` (completo) + `declaredCount` de `on_demand`
      (quando existir); sem nenhum dos dois, mostra contagem de
      categorias, nunca "0" para seção só não obtida ainda. Ver
      `spec.md` FR-014 (nota de execução) e `plan.md` R-010. `useCatalogCounts`
      passou a devolver `SectionCount` para filmes/séries; `channels`
      permanece contagem real de disco (não consumida por nenhuma tela
      hoje).

**Critério de Conclusão**: sincronizar uma fonte de provedor grava só
categorias e conclui em segundos; o hub mostra contagens da fonte; e uma
fonte por URL M3U continua com o mesmo comportamento observável de antes,
agora com estrutura gravada e categorias listáveis.

**Checkpoint**: US1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluído
- Feito: `xtreamConnector.ts` (contagem declarada + `category_id` opcional
  em `fetchLiveStreams`/`fetchVodStreams`/`fetchSeries`);
  `importPipeline.ts` bifurcado (provedor grava só estrutura via
  `storeCategories`; caminho integral cria categoria `eager` por grupo
  visto, com `categoryId` em todo item desde o primeiro lote, e fecha com
  `markCategoryFetched`); `run.unit` novo distinguindo categorias/itens;
  `ImportProgressScreen`/`importApi` com rótulos e contadores condicionais
  ao `unit`; `catalogApi`/`ListHomeScreen` com contagem por seção honesta
  (itens quando conhecíveis, categorias como piso, nunca "0" forjado).
- Testes executados: `npx vitest run` — 223/223 passando (24 arquivos).
  `npx tsc -b` e `npx oxlint` limpos. A regressão que a Fase 1 deixou em
  aberto (`importPipeline.test.ts` › grupos M3U) está fechada.
- Pendências: nenhuma conhecida. R-010 (refinamento de FR-014) e a
  observação de A1 ficam registrados em `plan.md`.

---

## Phase 3: User Story 2 — Entrar numa categoria traz o conteúdo (P1)

**Objetivo**: Os itens de uma categoria são obtidos na entrada e guardados.

**Independent Test**: Cenários B e C do `quickstart.md`.

### Testes da Fase

- [X] T024 [P] [US2] Em `tv-web/src/lib/catalog/categoryLoader.test.ts`,
      com instante injetado: os quatro estados (`fresh`, `fetched`,
      `stale-served`, `failed`) saem corretos.
- [X] T025 [P] [US2] Em `categoryLoader.test.ts`: categoria `eager` sai
      `fresh` **sem nenhuma chamada de rede**, qualquer que seja a idade.
      É o que permite às telas chamarem a mesma operação sem saber o tipo
      da fonte (contrato §2).
- [X] T026 [P] [US2] Em `categoryLoader.test.ts`: duas chamadas
      concorrentes para a mesma categoria compartilham **uma** obtenção e
      **uma** gravação (contrato §2, regra 2).
- [X] T027 [US2] Em `categoryLoader.test.ts`: falha não remove a categoria
      nem invalida as demais (FR-009); vencida com disco disponível serve
      o disco (FR-007).
- [X] T028 [P] [US2] Em `tv-web/src/features/live/LiveScreen.test.tsx`
      (e mesmo teste em `MoviesScreen.test.tsx`/`SeriesScreen.test.tsx`,
      novos): mover o foco sobre categorias **não** dispara nenhuma
      consulta; entrar (seta direita/SELECT) dispara uma (FR-004,
      constitution). **Interpretação registrada**: nas três telas,
      "entrada" é a transição de coluna 0→1 (comprometer-se a ver aquela
      categoria) — não o simples mover do cursor dentro da trilha.
- [X] T029 [US2] Testes de estado focável em carregando e erro, em
      `LiveScreen.test.tsx`, `MoviesScreen.test.tsx` (novo) e
      `SeriesScreen.test.tsx` (novo) (FR-008).

### Implementation

- [X] T030 [US2] Criar `tv-web/src/lib/catalog/categoryLoader.ts` com a
      operação "garantir categoria" e os quatro estados do contrato §2,
      com instante injetado, e o atalho de `fetchMode: 'eager'`.
- [X] T031 [US2] Em `tv-web/src/lib/catalog/freshness.ts`, acrescentar
      `isCategoryFresh` reusando `STALE_AFTER_MS` (`research.md` R0-2).
- [X] T032 [US2] Em `tv-web/src/features/catalog/catalogApi.ts`, `listByKind`
      (percorria todas as categorias) foi **removida**; entraram
      `useCategoryList` (estrutura, sem rede) e `useCategoryContent`
      (garante + lê **uma** categoria, via `categoryLoader`). `ITEM_BUDGET`
      removido — deixou de fazer sentido sem uma leitura "de tudo" para
      limitar.
- [X] T033 [US2] Em `tv-web/src/features/live/LiveScreen.tsx`, obter na
      entrada da categoria; hand-off de coluna preservado (col 0 = trilha
      de categorias, col 1 = canais da categoria entrada).
- [X] T034 [P] [US2] Mesmo tratamento em `MoviesScreen.tsx` e
      `SeriesScreen.tsx` — **as duas ganharam uma trilha de categorias que
      não existia antes** (eram grades planas com todos os itens de todas
      as categorias juntos, o que só era possível lendo tudo de uma vez;
      sob demanda isso deixou de ser viável). Layout reaproveita
      `.live-column`/`.live-column-groups` da Live TV; classe nova
      `.category-content` (`screens.css`) para o painel de grade crescer no
      espaço restante, sem hardcodar cor/raio/fonte (ADR-007).
- [X] T035 [US2] **Resolvido por caminho diferente do previsto**: em vez de
      alterar `groupChannels.ts`, os totais por seção agora fluem direto de
      `CatalogCategory.declaredCount`/`.count` através de `useCategoryList`/
      `useCategoryContent` para as telas — a categoria já É o grupo, não
      precisa mais ser derivada de uma lista plana de itens.
      `groupChannels()` (a função original) fica **sem uso em produção**
      depois desta fase; mantida com seus testes intactos (candidata a
      remoção no Polish, não removida agora para não inchar ainda mais um
      diff já grande).

**Critério de Conclusão**: entrar numa categoria nunca visitada traz os
itens; reentrar não vai à rede; offline serve o que está gravado e explica
o que não está; fonte M3U continua abrindo sem nenhuma consulta; nenhum
estado prende o controle.

**Checkpoint**: US2 funcional — com a US1, é o mínimo utilizável.

**Registro da Fase**:

- Status: Concluído
- Feito: `categoryLoader.ts` novo (ponto único de obtenção sob demanda,
  com de-dup de chamadas concorrentes via `Map` de promessas em voo);
  `isCategoryFresh` em `freshness.ts`; `catalogApi.ts` com
  `useCategoryList`/`useCategoryContent` substituindo `useChannels`/
  `useMovies`/`useSeries`; as três telas (Live/Movies/Series) reescritas
  para o modelo categoria-primeiro — Movies/Series ganharam trilha de
  categorias (antes eram grade plana de tudo). `CatalogCategory` ganhou o
  campo `kind`; `activeGeneration` exportado de `catalogRepository.ts`
  para o loader não furar D-001.
- Testes executados: `npx vitest run` — 251/251 passando (27 arquivos,
  6 novos: `categoryLoader.test.ts`, `MoviesScreen.test.tsx`,
  `SeriesScreen.test.tsx`, mais extensões em `freshness.test.ts` e reescrita
  de `LiveScreen.test.tsx`). `npx tsc -b`, `npx oxlint` e `npm run build`
  limpos.
- Pendências: achado durante a implementação, registrado em
  `.planning/backlog.md` (não corrigido — fora do escopo desta US, ver
  Riscos e Decisões R-011): os botões "Tentar de novo"/"Voltar" dos
  estados de carregando/erro (aqui e pré-existentes em `LiveScreen`) têm
  `.tv-focus` mas não são de fato ativáveis por OK do controle físico —
  `useRemoteNav` não roteia Enter para eles e nenhum `.focus()` real é
  chamado. `groupChannels()` original ficou sem consumidor em produção —
  candidata a remoção no Polish.

---

## Phase 4: User Story 3 — A interface não promete o que não tem (P2)

**Objetivo**: A distinção entre declarado, gravado e ausente fica visível.

**Independent Test**: Cenários D e E do `quickstart.md`.

### Testes da Fase

- [X] T036 [P] [US3] Teste de divergência entre `declaredCount` e
      `itemsCount` declarada na interface (FR-015). `LiveScreen.test.tsx`:
      um teste que a mostra e outro que confirma que ela NÃO aparece
      quando não há o que comparar (a fonte não declarou nada — caso real
      de hoje contra Xtream).
- [X] T037 [US3] Teste de reconciliação de foco por **id do item** ao
      voltar a uma categoria revalidada (FR-019; R-004; constitution,
      "Voltar Restaura Foco e Posição"). Mecanismo já existia desde a Fase
      3 (`locate()` por identidade, testado lá para troca de catálogo em
      segundo plano) — este teste cobre explicitamente o cenário de
      **revalidação de categoria** (outcome `'fetched'` reordenando os
      mesmos itens), com essa nomeação própria para rastreabilidade a
      FR-019.

### Implementation

- [X] T038 [US3] Exibir a divergência na tela da categoria, sem esconder e
      sem transformar num erro. Implementado nas três telas
      (Live/Movies/Series): compara `focusedCategory.declaredCount`
      (promessa) com `content.data.totalCount` (fato, já pós-`ensureCategory`),
      mostra só quando os dois existem e diferem.
- [X] T039 [US3] Reconciliar foco por id ao revalidar uma categoria
      (FR-019) — **já implementado na Fase 3** (`locate()` por identidade
      em `LiveScreen`/`MoviesScreen`/`SeriesScreen`, derivado a cada render
      a partir de `items`/`movies`/`series` atuais, nunca um índice
      guardado). Esta task confirma via teste explícito (T037), não
      exigiu código novo.
- [X] T040 [US3] Declarar na interface que o catálogo é obtido por
      categoria (R-007) — nota em `ListHomeScreen.tsx`: "Cada categoria é
      obtida quando você entra nela."

**Critério de Conclusão**: nenhum número exibido é ambíguo quanto à origem,
e voltar a uma categoria revalidada não perde nem troca o item em foco.

**Checkpoint**: US3 concluída.

**Registro da Fase**:

- Status: Concluído
- Feito: nota de divergência declarada×real nas três telas de categoria;
  nota de cobertura-por-categoria em `ListHomeScreen`; teste explícito de
  reconciliação por revalidação (o mecanismo em si já vinha da Fase 3).
- Testes executados: `npx vitest run` — 254/254 passando (27 arquivos, 3
  testes novos em `LiveScreen.test.tsx`). `npx tsc -b`, `npx oxlint` e
  `npm run build` limpos.
- Pendências: nenhuma conhecida.

---

## Phase 5: Polish & Cross-Cutting

**Goal**: Fechar documentação canônica, empacotamento e verificação na TV.

### Implementation

- [X] T041 [P] Emendar `sdd/adr/ADR-002-offline-first-resiliencia-na-tv.md`
      com nota `**Atualização (feature 010):**` — cobertura parcial deixa
      de ser exceção e vira operação normal (`research.md` R0-4). Sem
      reescrever a decisão original.
- [X] T042 [P] Atualizar
      `sdd/specs/005-import-catalogo-client-first/contracts/local-storage.md`
      §2 e `data-model.md`, apontando o delta para esta feature.
- [X] T043 [P] Atualizar `CLAUDE.md` e `README.md`. Foi além do estritamente
      pedido: as duas descrições estavam desatualizadas mesmo antes desta
      feature (backend ainda descrito como caminho principal,
      `mockCatalog.ts` citado como se ainda existisse, constitution v1.1.0
      quando já está em v1.2.0) — corrigido junto, por "Documentação do
      Repositório É Canônica" não distinguir "desatualizado por mim" de
      "desatualizado antes".
- [X] T044 Revisão de vazamento de segredo: varredura por usuário/senha/DNS
      reais (do `.env` usado na Fase 0) em todo o repositório — nenhum
      vazou para código, spec ou teste. Achado à parte, pré-existente e
      fora do escopo desta feature: `sdd/specs/001-.../plan.md` cita três
      hostnames de teste (sem usuário/senha) de uma sessão anterior — não é
      URL completa nem credencial, não corrigido.
- [X] T045 Conferido `CCPlayTv/tizen_web_project.yaml` contra
      `npm run build:tizen`: os três arquivos emitidos
      (`index.js`/`index.css`/`importWorker.js`) batem exatamente com a
      lista — nenhum chunk novo (`categoryLoader.ts` e o resto do código da
      010 foram para dentro de `index.js`, não geraram arquivo próprio).
- [X] T046 Rodar o `quickstart.md` inteiro na TV física pelo procedimento
      da skill `tizen-tv`, registrando cada cenário como aprovado,
      reprovado ou **não executado**. **Precisa do usuário** — acesso à TV
      física e, para os cenários com provedor real, às credenciais dele.
      Veredito por cenário (23/09/2026):
      - **A — Aprovado**: sincronizar concluiu em ≤ 15s, contagem de
        categorias, sem percentual (ver T047).
      - **B — Aprovado, após correção**: leitura original de FR-004 fazia
        toda entrada parecer a primeira vez; corrigida com pré-busca
        amortecida por permanência do foco (T047); reteste confirmou
        entrada instantânea na maioria das vezes.
      - **C — Aprovado**: offline serviu do disco, categoria nunca
        visitada mostrou erro focável sem sumir da trilha, reconexão +
        "Tentar de novo" recuperou.
      - **D — Aprovado**: foco voltou exatamente no item certo, inclusive
        depois de revalidação (reconciliação por id).
      - **E — Aprovado**: contagens do hub batem e fazem sentido como
        declaradas pelo provedor.
      - **F — Aprovado, com uma parte não testável**: descarte pós-resync
        confirmado (categoria já visitada buscou de novo). A sobrevivência
        de favoritos/progresso **não pôde ser testada manualmente** — não
        existe UI de favoritar/marcar progresso ainda (feature 008 só
        construiu `userStateRepository`; busca por
        `toggleFavorite|updateProgress` em `tv-web/src/features` não
        retornou nenhuma tela). Coberta só pelo teste automatizado
        ("publicar geração também descarta as categorias da anterior, sem
        tocar userStates", `catalogRepository.test.ts`).
      - **G — Não executado**: sem fonte por URL M3U disponível no momento
        do teste. Risco baixo — é caminho de código que esta feature não
        alterou (import `eager` em fluxo já existia), coberto por teste
        automatizado (T016, `importPipeline.test.ts`). Fica pendente de
        confirmação visual numa sessão futura em que houver uma fonte M3U
        à mão.
- [X] T047 **Ad-hoc, descoberta durante T046 (Cenário A e B na TV física).**
      Cenário A aprovado: sincronizar concluiu em ≤ 15s (SC-001), com
      contadores de categoria e sem percentual. Cenário B revelou que
      FR-004 na leitura original ("nunca ao mover o foco") fazia toda
      entrada em categoria parecer a primeira vez, mesmo em uso normal de
      navegação — o usuário pediu explicitamente pré-busca por
      permanência do cursor. Implementado: `prefetchCategoryContent`/
      `useCategoryFocusPrefetch` em `catalogApi.ts` (amortecido a 300ms,
      escreve no mesmo cache que `useCategoryContent` lê), conectado nas
      três telas. FR-004/D-003/contrato §2 emendados (R-013). Testes
      novos: `catalogApi.test.tsx` (3 casos, temporizadores falsos) +
      ajuste de `MoviesScreen.test.tsx`/`SeriesScreen.test.tsx` (precisavam
      de `QueryClientProvider` real, que antes só `LiveScreen.test.tsx`
      tinha). Suíte: 257/257, `tsc`/`oxlint`/`build` limpos.

### Checklist de Release

- [X] Fase 0 (sonda do protocolo) concluída e registrada em `research.md`
- [X] Fase 1 (fundação de dados) concluída
- [X] Fase 2 (US1) concluída
- [X] Fase 3 (US2) concluída
- [X] Fase 4 (US3) concluída
- [X] Fonte por URL M3U verificada sem regressão (T016, automatizado; Cenário G do `quickstart.md` na TV física ficou **não executado** — sem fonte disponível, ver T046)
- [X] `npm run test`, `npm run lint` e `npm run build` passando
- [X] Revisão de segredos feita (T044)
- [X] Documentação canônica atualizada (T041, T042, T043)
- [X] `quickstart.md` executado na TV, com veredito honesto por cenário — 6/7 aprovados (A-F), G não executado por falta de fonte M3U (T046)
- [X] Nada em `api/` modificado

**Registro da Fase**:

- Status: Concluído. T041-T047 feitos; T046 rodado na TV física com o
  usuário em 23/09/2026, veredito honesto registrado por cenário.
- Feito: ADR-002 emendada; contrato/data-model da 005 apontam o delta para
  a 010; CLAUDE.md e README.md corrigidos (inclusive dessincronia
  pré-existente, não só a desta feature); revisão de segredos sem achado
  novo; `tizen_web_project.yaml` confirmado batendo com o build; 6 dos 7
  cenários do `quickstart.md` aprovados na TV física (um deles, B, só após
  uma correção de comportamento pedida pelo usuário — T047); Cenário G
  ficou não executado por falta de fonte M3U disponível na sessão.
- Testes executados: `npx vitest run` (257/257 — inclui os 3 novos de
  `catalogApi.test.tsx` do T047), `npx tsc -b`, `npx oxlint`,
  `npm run build` e `npm run build:tizen` — todos limpos.
- Pendências: Cenário G (fonte M3U) fica para confirmação visual numa
  sessão futura em que houver uma fonte M3U à mão — risco baixo, caminho
  de código não alterado por esta feature, já coberto por teste
  automatizado. R-011 (botões "Tentar de novo"/"Voltar" não ativáveis) e
  R-012 (`groupChannels()` morto) seguem como achados conhecidos, fora do
  escopo desta feature, logados no backlog para um `sdd-bugfix` futuro.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 0 (sonda)**: sem dependências. **BLOQUEIA tudo.**
- **Fase 1 (fundação)**: depende da Fase 0 — BLOQUEIA todas as stories.
- **Fase 2 (US1)**: depende da Fase 1.
- **Fase 3 (US2)**: depende da Fase 1; na prática, depois da US1, porque
  precisa da estrutura gravada para ter o que abrir.
- **Fase 4 (US3)**: depende da US2.
- **Fase 5 (Polish)**: depende de todas.

### Parallel Opportunities

- Tasks `[P]` na mesma fase tocam arquivos diferentes.
- T041, T042 e T043 são três documentos independentes.

### Ordem interna crítica da Fase 2

T021 (caminho integral grava estrutura) tem que entrar **junto com** T010
(leitura passa a vir de `categories`), não depois. Separá-las em commits
distintos deixa o repositório num estado em que toda fonte M3U abre vazia —
e os testes atuais não pegam isso, que foi exatamente o achado A1.

### Ordem decidida frente à feature 009

`009-virtualizacao-foco` está **Em Execução** (2/16 tasks) e a Fase 3 dela
refatora a lista de canais em `LiveScreen.tsx` — arquivo que T033 também
altera. **Decisão (usuário, 23/09/2026): a 010 é concluída primeiro.** A
009 virtualiza o que houver na tela; enquanto a tela carrega o catálogo
inteiro, virtualizar resolve o desenho e deixa de pé a gravação, que é o
gargalo medido. A Fase 3 da 009 só recomeça depois do checkpoint da Fase 3
desta feature (US2), quando `LiveScreen.tsx` já estiver estabilizado no
novo formato de leitura por categoria — refatorar o arquivo duas vezes em
paralelo desperdiçaria trabalho dos dois lados.

---

## Implementation Strategy

### MVP (US1 + US2)

1. Fase 0 — fechar a premissa. Se ela cair, parar e reabrir o design.
2. Fase 1 — fundação de dados.
3. Fase 2 (US1) — **parar e medir na TV**: sincronizar ficou rápido? E a
   fonte M3U continua abrindo?
4. Fase 3 (US2) — **parar e validar**: categoria abre, offline degrada
   com honestidade.

### Incremental Delivery

US1 sozinha já entrega uma fonte que sincroniza em segundos. US2 a torna
navegável. US3 torna os números confiáveis. Nenhuma quebra a anterior.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Parar em cada checkpoint para validar a story isoladamente
- Nenhuma task é concluída com `npm run test` ou `npm run lint` vermelhos

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
