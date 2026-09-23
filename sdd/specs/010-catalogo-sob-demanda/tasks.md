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

- [ ] T001 Escrever uma sonda descartável (fora de `src/`, em
      `tv-web/scripts/probe-category.mjs`) que consulte
      `get_live_streams`, `get_vod_streams` e `get_series` com e sem
      `&category_id=<id>` contra o painel real, e **imprima apenas
      contagens e tamanhos** — nunca a URL, nunca a credencial, nunca um
      trecho da resposta.
- [ ] T002 Rodar a sonda com as credenciais fornecidas pelo usuário via
      variável de ambiente, **nunca** como argumento em linha de comando
      (fica no histórico do shell) nem em arquivo commitado.
- [ ] T003 Registrar o resultado em `research.md` → R0-1, substituindo
      "não resolvido" pela decisão, com os números observados.
- [ ] T004 Apagar a sonda e confirmar `git status` limpo quanto a ela.

**Tests**:

- [ ] T005 Nenhum teste automatizado — é uma medição contra um serviço
      externo. A evidência é o número registrado em `research.md`.

**Critério de Conclusão**: `research.md` R0-1 diz, com números, se o painel
filtra por categoria. Se **não** filtrar: parar, apresentar as alternativas
ao usuário e **não** prosseguir para a Fase 1 sem decisão dele.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 1: Fundação de Dados (Bloqueante)

**Goal**: Criar a coleção `categories` e os repositórios que a servem, sem
ainda mudar nenhuma tela.

**⚠️ CRITICAL**: Bloqueia todas as user stories.

### Testes da Fase

- [ ] T006 [P] Teste de migração v6→v7 em
      `tv-web/src/lib/catalog/db.test.ts`: o banco abre, `categories`
      existe com os dois índices, e dado de v6 não é perdido nem
      convertido por adivinhação.
- [ ] T007 [P] Testes de `catalogRepository` em
      `tv-web/src/lib/catalog/catalogRepository.test.ts`: gravar
      estrutura, listar categorias na ordem declarada, categoria com nome
      vazio preservada, substituição **integral** de itens de uma
      categoria, e contagem real distinta de `declaredCount`.
- [ ] T008 [P] Teste de `markCategoryFetched` em
      `catalogRepository.test.ts`: carimba instante e contagem sem tocar
      nos itens já gravados.

### Implementation

- [ ] T009 Abrir a versão 7 em `tv-web/src/lib/catalog/db.ts`: coleção
      `categories` com `[sourceId+generation+kind+order]` e
      `[sourceId+generation+kind+providerCategoryId]`, campos `fetchMode`
      e `providerCategoryId` opcional, e campo `categoryId` em
      `CatalogRecord`. Sem migração de dados (`data-model.md` §4).
- [ ] T010 Em `tv-web/src/lib/catalog/catalogRepository.ts`, trocar
      `listCategories` de derivação por `uniqueKeys()` para leitura da
      coleção `categories`, devolvendo `fetchMode`, `declaredCount`,
      `itemsFetchedAt` e `itemsCount`. **Caminho de leitura único** — sem
      derivação de reserva (D-004).
- [ ] T011 Em `catalogRepository.ts`, adicionar `storeCategories`
      (devolvendo os ids locais criados, que o caminho integral precisa
      para carimbar `categoryId` nos itens) e `storeCategoryItems`
      (substituição integral em transação — D-006).
- [ ] T012 Em `catalogRepository.ts`, adicionar `markCategoryFetched`
      (instante + contagem), usada tanto pela obtenção sob demanda quanto
      pelo fecho da importação integral.
- [ ] T013 Estender `publishGeneration`/`discardGeneration` em
      `catalogRepository.ts` para alcançar `categories`, e confirmar por
      teste que **nada** toca `userStates` (D-002).

**Critério de Conclusão**: o banco abre na v7, os repositórios gravam e
leem categorias na ordem da fonte, a troca de geração alcança as duas
coleções e deixa `userStates` intacto. Nenhuma tela mudou ainda.

**Checkpoint**: fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

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

- [ ] T014 [P] [US1] Em
      `tv-web/src/lib/catalog/xtreamConnector.test.ts`: as três consultas
      de categoria mapeiam id, nome (inclusive vazio), ordem e contagem
      declarada; contagem ausente vira `undefined`, nunca zero.
- [ ] T015 [P] [US1] Em
      `tv-web/src/lib/catalog/importPipeline.test.ts`: fonte de provedor
      JSON grava categorias `on_demand` e **zero** itens.
- [ ] T016 [US1] **Regressão do achado A1.** Em `importPipeline.test.ts`:
      depois de importar uma fonte por URL M3U, `listCategories` devolve
      os grupos na ordem de aparição, com `fetchMode: 'eager'`,
      `itemsCount` real e `declaredCount` ausente — e os itens continuam
      gravados como hoje. Mesmo teste para `legacy_m3u` (FR-011, FR-012).
- [ ] T017 [US1] Em `importPipeline.test.ts`: todo item gravado pelo
      caminho integral aponta para a categoria do seu grupo
      (`categoryId` preenchido), inclusive os do primeiro lote — que é
      escrito antes de a lista de grupos terminar.
- [ ] T018 [US1] Em `importPipeline.test.ts`: seção que o painel não serve
      continua declarada em `unavailableSections` (FR-016), agora
      detectada na consulta de categorias.

### Implementation

- [ ] T019 [US1] Em `tv-web/src/lib/catalog/xtreamConnector.ts`, extrair a
      contagem declarada por categoria e aceitar `category_id` nas
      consultas de itens (forma confirmada na Fase 0).
- [ ] T020 [US1] Em `tv-web/src/lib/catalog/importPipeline.ts`, bifurcar
      por tipo de fonte: provedor JSON grava estrutura `on_demand` via
      `storeCategories` e nenhum item.
- [ ] T021 [US1] **Resolução do achado A1.** No caminho integral do mesmo
      arquivo, criar a categoria `eager` no ponto onde o pipeline já
      atribui `groupOrder` a um grupo novo, guardar o id local no mapa, e
      carimbar `itemsFetchedAt`/`itemsCount` no fim via
      `markCategoryFetched`. Gravar as categorias só no fim exigiria uma
      segunda passada sobre centenas de milhares de linhas
      (`data-model.md` §3).
- [ ] T022 [US1] Em `tv-web/src/features/import/importApi.ts` e
      `ImportProgressScreen.tsx`, contar **categorias** na fonte de
      provedor, mantendo entradas no caminho integral, sem percentual
      (FR-013).
- [ ] T023 [US1] Em `tv-web/src/features/list-home/ListHomeScreen.tsx` e
      `tv-web/src/features/catalog/catalogApi.ts`, usar a soma de
      `declaredCount`, identificável como declarada pela fonte (FR-014,
      D-005). Inclui `useCatalogCounts`, que hoje conta pelo índice de
      `channels` e passaria a contar só o que foi baixado (achado A7).

**Critério de Conclusão**: sincronizar uma fonte de provedor grava só
categorias e conclui em segundos; o hub mostra contagens da fonte; e uma
fonte por URL M3U continua com o mesmo comportamento observável de antes,
agora com estrutura gravada e categorias listáveis.

**Checkpoint**: US1 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 3: User Story 2 — Entrar numa categoria traz o conteúdo (P1)

**Objetivo**: Os itens de uma categoria são obtidos na entrada e guardados.

**Independent Test**: Cenários B e C do `quickstart.md`.

### Testes da Fase

- [ ] T024 [P] [US2] Em `tv-web/src/lib/catalog/categoryLoader.test.ts`,
      com instante injetado: os quatro estados (`fresh`, `fetched`,
      `stale-served`, `failed`) saem corretos.
- [ ] T025 [P] [US2] Em `categoryLoader.test.ts`: categoria `eager` sai
      `fresh` **sem nenhuma chamada de rede**, qualquer que seja a idade.
      É o que permite às telas chamarem a mesma operação sem saber o tipo
      da fonte (contrato §2).
- [ ] T026 [P] [US2] Em `categoryLoader.test.ts`: duas chamadas
      concorrentes para a mesma categoria compartilham **uma** obtenção e
      **uma** gravação (contrato §2, regra 2).
- [ ] T027 [US2] Em `categoryLoader.test.ts`: falha não remove a categoria
      nem invalida as demais (FR-009); vencida com disco disponível serve
      o disco (FR-007).
- [ ] T028 [P] [US2] Em `tv-web/src/features/live/LiveScreen.test.tsx`:
      mover o foco sobre categorias **não** dispara nenhuma consulta;
      SELECT dispara uma (FR-004, constitution).
- [ ] T029 [US2] Testes de estado focável em carregando e erro, em
      `LiveScreen.test.tsx`, `MoviesScreen` e `SeriesScreen` (FR-008).

### Implementation

- [ ] T030 [US2] Criar `tv-web/src/lib/catalog/categoryLoader.ts` com a
      operação "garantir categoria" e os quatro estados do contrato §2,
      com instante injetado, e o atalho de `fetchMode: 'eager'`.
- [ ] T031 [US2] Em `tv-web/src/lib/catalog/freshness.ts`, acrescentar a
      decisão de validade por categoria reusando `STALE_AFTER_MS`
      (`research.md` R0-2).
- [ ] T032 [US2] Em `tv-web/src/features/catalog/catalogApi.ts`, trocar a
      leitura que percorre todas as categorias por leitura da categoria
      ativa, passando pelo `categoryLoader`. Remover o teto temporário
      `ITEM_BUDGET`, que existia como salvaguarda desta exata lentidão.
- [ ] T033 [US2] Em `tv-web/src/features/live/LiveScreen.tsx`, obter na
      entrada da categoria; manter o hand-off de coluna atual.
- [ ] T034 [P] [US2] Mesmo tratamento em
      `tv-web/src/features/movies/MoviesScreen.tsx` e
      `tv-web/src/features/series/SeriesScreen.tsx`.
- [ ] T035 [US2] Em `tv-web/src/features/live/groupChannels.ts`, alimentar
      os totais por grupo a partir de `declaredCount`/`itemsCount` em vez
      de contar os itens recebidos.

**Critério de Conclusão**: entrar numa categoria nunca visitada traz os
itens; reentrar não vai à rede; offline serve o que está gravado e explica
o que não está; fonte M3U continua abrindo sem nenhuma consulta; nenhum
estado prende o controle.

**Checkpoint**: US2 funcional — com a US1, é o mínimo utilizável.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 3 — A interface não promete o que não tem (P2)

**Objetivo**: A distinção entre declarado, gravado e ausente fica visível.

**Independent Test**: Cenários D e E do `quickstart.md`.

### Testes da Fase

- [ ] T036 [P] [US3] Teste de divergência entre `declaredCount` e
      `itemsCount` declarada na interface (FR-015).
- [ ] T037 [US3] Teste de reconciliação de foco por **id do item** ao
      voltar a uma categoria revalidada (R-004; constitution, "Voltar
      Restaura Foco e Posição").

### Implementation

- [ ] T038 [US3] Exibir a divergência na tela da categoria, sem esconder e
      sem transformar num erro.
- [ ] T039 [US3] Reconciliar foco por id ao revalidar uma categoria, no
      padrão `FocusIdentity` que `LiveScreen.tsx` já usa.
- [ ] T040 [US3] Declarar na interface, onde couber, que o catálogo é
      obtido por categoria — a cobertura parcial passa a ser o normal
      (R-007).

**Critério de Conclusão**: nenhum número exibido é ambíguo quanto à origem,
e voltar a uma categoria revalidada não perde nem troca o item em foco.

**Checkpoint**: US3 concluída.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: Polish & Cross-Cutting

**Goal**: Fechar documentação canônica, empacotamento e verificação na TV.

### Implementation

- [ ] T041 [P] Emendar `sdd/adr/ADR-002-offline-first-resiliencia-na-tv.md`
      com nota `**Atualização (feature 010):**` — cobertura parcial deixa
      de ser exceção e vira operação normal (`research.md` R0-4). Sem
      reescrever a decisão original.
- [ ] T042 [P] Atualizar
      `sdd/specs/005-import-catalogo-client-first/contracts/local-storage.md`
      §2 e `data-model.md`, apontando o delta para esta feature.
- [ ] T043 [P] Atualizar `CLAUDE.md` e `README.md` no que descrevem a
      importação, sem apresentar como entregue o que não está.
- [ ] T044 Revisão de vazamento de segredo antes de integrar: nenhuma URL
      de painel ou credencial em log, erro, `categories` ou `channels`
      (constitution, "Fluxo de Desenvolvimento").
- [ ] T045 Conferir `CCPlayTv/tizen_web_project.yaml`: se o build emitir
      arquivo novo em `assets/`, ele precisa estar na lista — ausência
      falha **só na TV** (R-002 da feature 005).
- [ ] T046 Rodar o `quickstart.md` inteiro na TV física pelo procedimento
      da skill `tizen-tv`, registrando cada cenário como aprovado,
      reprovado ou **não executado**.

### Checklist de Release

- [ ] Fase 0 (sonda do protocolo) concluída e registrada em `research.md`
- [ ] Fase 1 (fundação de dados) concluída
- [ ] Fase 2 (US1) concluída
- [ ] Fase 3 (US2) concluída
- [ ] Fase 4 (US3) concluída
- [ ] Fonte por URL M3U verificada sem regressão (T016, Cenário G)
- [ ] `npm run test`, `npm run lint` e `npm run build` passando
- [ ] Revisão de segredos feita (T044)
- [ ] Documentação canônica atualizada (T041, T042, T043)
- [ ] `quickstart.md` executado na TV, com veredito honesto por cenário
- [ ] Nada em `api/` modificado

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

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

### Conflito conhecido com a feature 009

`009-virtualizacao-foco` está **Em Execução** (2/16 tasks) e a Fase 3 dela
refatora a lista de canais em `LiveScreen.tsx` — arquivo que T033 também
altera. **Decidir a ordem antes de começar a Fase 3 desta feature.**
Recomendação: terminar a 010 primeiro. A 009 virtualiza o que houver na
tela; enquanto a tela carrega o catálogo inteiro, virtualizar resolve o
desenho e deixa de pé a gravação, que é o gargalo medido.

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
