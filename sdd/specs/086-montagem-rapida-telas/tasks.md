---
description: "Tasks da feature 086 — montagem rápida das telas principais com seleções guardadas"
---

# Tasks: Montagem rápida das telas principais

**Input**: Documentos de design de `sdd/specs/086-montagem-rapida-telas/`

**Prerequisites**: spec.md, plan.md, logic/selecoes-guardadas.md, quickstart.md, contract-tests.lock

**Organization**: por user story, em ordem de prioridade. A Fase 1 mede **antes** de qualquer mudança de desenho (D-008).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: a qual user story pertence

## Path Conventions

- Catálogo e seleções: `tv-web/src/lib/catalog/`
- Telas e consultas: `tv-web/src/features/{home,vod,catalog}/`
- Componentes de card e fileira: `tv-web/src/components/`
- Medição: `tv-web/src/lib/perf/`, coletor em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/coletor.mjs`
- Evidências: `sdd/specs/086-montagem-rapida-telas/evidencias/`
- Comandos de teste rodam em `tv-web/`; scripts `.planning/` na raiz.

---

## Phase 1: Medição da linha de base na TV (D-008, FR-024, FR-026)

**Purpose**: saber **qual** leitura pesa, quanto custa desenhar e quantos quadros a navegação perde — antes de mudar
qualquer desenho. Sem isto, a feature otimiza no escuro.

- [X] T001 Em `tv-web/src/lib/perf/metricsChannel.ts` e `tv-web/src/lib/assembly/useScreenAssembly.ts`: acrescentar à fonte
  `assembly` o tempo de **cada leitura** (uma chave `<slot>Ms` por slot resolvido) e o tempo entre a última leitura ficar
  pronta e o commit da tela (`paintMs`). Só no build de medição; rótulos fixos, nunca nome de item.
- [X] T002 [P] Em `tv-web/src/components/PerfOverlay.tsx`: emitir o pico de heap da abertura (`performance.memory`, quando
  existir) e as capas da primeira tela prontas/pedidas, junto da fonte `frames`.
- [X] T003 Medir na TV (**pedir autorização antes de instalar**): build de medição, abrir Início, Filmes e Séries pela
  primeira vez na sessão; depois uma navegação roteirizada (mover foco entre cards e fileiras, rolar até o fim) em cada uma.
  Gravar em `evidencias/linha-de-base-tv-<data>.md`: por tela, `revealMs`, motivo, tempo por leitura, `paintMs`, quadros
  longos, pico de heap e capas prontas. Reinstalar o pacote normal ao fim, avisando.
- [X] T004 Registrar no `plan.md` (Riscos) o que a medição mostrou sobre R-005 (invalidação por lote da vitrine) e R-006
  (Home sem virtualização vertical): confirmar ou descartar cada um com número.

**Registro da Fase**:

- Status: concluída.
- Feito: T001 — `useScreenAssembly.ts` mede quando cada leitura resolve (`<leitura>Ms`, camelCase) e o tempo até desenhar (`paintMs`); `assemblyTiming.ts` emite os dois no canal. T002 — `PerfOverlay.tsx` emite pico de heap (`heapMB`) junto dos quadros. T003 — linha de base medida na TV com autorização; pacote normal reinstalado. T004 — R-005/R-006 avaliados.
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/lib/assembly src/lib/perf src/components src/features/home src/features/vod` → 729 passaram; `npx tsc -b` limpo; `npm run lint` ok; `npm run build` sem `ccplay-app-metrics` no pacote. Teste novo `useScreenAssembly.medicao.test.tsx` (1 teste) prova que as chaves saem no formato que o canal aceita.
- Pendências: **R-009** — a lista de categorias custa ~1 s e sozinha define quando a vitrine aparece (não previsto no plano). **R-010** — `performance.memory` devolve 10 MB fixos nesta TV: SC-010 não é verificável como planejado. **R-005** segue aberto (a medição não pegou tela aberta no pico da pré-carga).

---

## Phase 2: Foundational — base para as seleções guardadas

**Purpose**: o que todas as stories precisam. **Bloqueia as fases 3 a 6.**

- [X] T010 Em `tv-web/src/lib/catalog/db.ts`: schema **v17** com `showcaseCandidates: 'categoryId, [sourceId+generation+kind]'`
  e `showcaseExternalRows: 'id, [sourceId+generation+kind]'`. Sem `.upgrade()` (tabelas novas), seguindo o padrão das v14–v16.
- [X] T011 Mover a lógica pura de seleção para `tv-web/src/lib/catalog/showcaseSelection.ts` (D-006): os acumuladores de
  `features/vod/vodShowcase.ts` e `features/vod/ratedSelection.ts`, **sem alterar o algoritmo**; os dois arquivos passam a
  reexportar de lá. Rodar as travas das features 052, 056 e 065 na mesma task → risco R-004.
- [X] T012 Implementar `selectShowcaseRowsByScan` em `showcaseSelection.ts`: a varredura de hoje (o corpo de
  `loadShowcaseSelections`, `catalogApi.ts:1651`), movida sem mudança de comportamento → contrato: C1 (é a referência).
- [X] T013 Em `tv-web/src/lib/catalog/sourceDeletion.ts`: incluir as duas tabelas novas na limpeza da lista (FR-009).

**Critério de Conclusão**: `npx vitest run src/lib/catalog src/features/vod` verde, travas de 052/056/065 íntegras, e
`selectShowcaseRowsByScan` devolvendo o mesmo que a vitrine devolvia antes.

**Registro da Fase**:

- Status: concluída.
- Feito: T010 — schema **v17** (`showcaseCandidates`, `showcaseExternalRows`), com `sourceId` indexado (a limpeza por lista precisa dele) e os tipos em `showcaseTypes.ts` (o `db.ts` estourava o teto de linhas). T011 — lógica de seleção movida para `lib/catalog/showcaseSelection.ts` e `lib/catalog/ratedSelection.ts`; `features/vod/*` só reexporta. T012 — `selectShowcaseRowsByScan` implementada (a varredura de hoje, agora em `lib/`), com `RATED_FIELDS`, `showcaseSeed` e `toShowcaseItem` compartilhados pelos dois caminhos. T013 — apagar a lista apaga as duas tabelas.
- Contrato: sem contrato nesta fase (os 5 seguem vermelhos por `not implemented`, como esperado); trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog src/features/vod src/features/catalog src/features/home` → só os 5 contratos falham. **Travas de 052, 056 e 065 íntegras** (R-004 mitigado pelo reexport). `npx tsc -b` limpo; `npm run lint` ok.
- Pendências: `VodShowcaseScreen.test.tsx` falhou **uma vez** na suíte e passou 9/9 isolado em 3 execuções — flake conhecido (já visto na feature 085), não causado por esta fase. `scripts/architecture-baseline.json`: teto de `lib/catalog/db.ts` subiu de 845 para 854 por causa das 2 tabelas novas e da v17.

---

## Phase 3: User Story 1 - As fileiras já vêm prontas e seguem atualizadas (P1) 🎯 MVP

**Objetivo**: a abertura lê candidatos guardados em vez de varrer o tipo, com o mesmo conteúdo de hoje, e acompanha o
catálogo durante a sessão.

**Independent Test**: com a lista real carregada, as três telas mostram as fileiras sem varrer o tipo; gravar uma categoria
muda a fileira na montagem seguinte.

### Contrato da Fase

- C5 `guarda os mais novos e os melhores da categoria, sem ler o banco, respeitando os limites` (FR-003)
- C1 `a montagem por candidatos devolve exatamente o mesmo que a varredura completa` (FR-004, US1/AC1)
- C2 `item de categoria escondida ou travada por PIN nunca aparece…` (FR-005)
- C3 `montar as fileiras não lê nenhum bloco do catálogo nem toca a rede` (FR-002, FR-013)
- C4 `uma categoria gravada depois entra nas fileiras na montagem seguinte` (FR-008, US1/AC3)
- Comando: `npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts`

### Implementation

- [X] T020 [US1] Implementar `pickCandidates`, `writeCandidates`, `clearCandidates` e `readCandidates` em
  `tv-web/src/lib/catalog/showcaseCandidates.ts`, conforme `logic/selecoes-guardadas.md` §1 e §3. `pickCandidates` é pura e
  reaproveita `projectReadItem` (`readProjection.ts`) → contrato: C5
- [X] T021 [US1] Implementar `buildShowcaseRowsFromCandidates` em `tv-web/src/lib/catalog/showcaseRows.ts` conforme o §2 do
  logic: filtra por `getCategoryAccess` na leitura, mescla na ordem da fonte com os acumuladores de `showcaseSelection.ts`,
  conta elegíveis distintos na mesclagem (R-002) → contrato: C1, C2, C3
- [X] T022 [US1] Em `tv-web/src/lib/catalog/repository/categoryItems.ts` (`renewCategoryItems`): gravar os candidatos da
  categoria junto da gravação, com os itens já em mãos, respeitando `makeRoomFor` (082). Nenhuma leitura extra → contrato: C4
- [X] T023 [US1] Em `tv-web/src/lib/catalog/storageRelease.ts`: liberar uma categoria apaga os candidatos dela (FR-011).
- [X] T024 [US1] Em `tv-web/src/features/catalog/catalogApi.ts`: `useRecentlyAdded` e `useTopRated` passam a ler
  `buildShowcaseRowsFromCandidates`; `loadShowcaseSelections` sai do caminho da tela (D-007). Manter a chave de consulta e a
  invalidação atuais, para o frescor continuar funcionando (FR-008, FR-012).
- [X] T025 [US1] Conferir que o aviso de cobertura parcial continua correto com a cobertura guardada (FR-006).
- [X] T029 [US1] **Ad-hoc, descoberta na T022**: `fillNextCandidates` em `tv-web/src/lib/catalog/showcaseCandidates.ts`, chamada pela fila da pré-carga (`lib/catalog/prefetch/index.ts`) — preenche os candidatos de uma categoria já gravada por vez. Sem isto, uma lista que já estava no aparelho nunca ganharia as fileiras, porque o catálogo não é regravado.

### Testes da Fase

- [X] T026 [P] [US1] `showcaseCandidates.test.ts`: categoria sem item elegível; item sem data/nota/ano; limite exato
  (`RECENT_CANDIDATES` itens) e um a mais.
- [X] T027 [P] [US1] `showcaseRows.test.ts`: lista sem candidato nenhum devolve fileiras vazias e cobertura 0; candidatos de
  geração anterior são ignorados (FR-009); item de categoria apagada é descartado (FR-010).
- [X] T028 [US1] Rodar `npx vitest run src/lib/catalog src/features/catalog src/features/vod` e as travas de 052/056/065/082.

**Critério de Conclusão**: os 5 contratos verdes
(`npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts` → 5/5),
`check-contract-tests.ps1 -Slug 086-montagem-rapida-telas` íntegro, e nenhum caminho de abertura chamando
`selectShowcaseRowsByScan`, `loadSearchIndex` ou `iterateKindRecordBatches`.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída.
- Feito: T020/T021 — `pickCandidates`, `writeCandidates`, `clearCandidates`, `readCandidates` e `buildShowcaseRowsFromCandidates`, usando os MESMOS acumuladores da varredura. T022 — `writeCompressedBlock` passou a expor `blockItems`/`categoryOrder` e grava os candidatos com os itens já em mãos (nenhuma leitura extra). T023 — `deleteCategoryItems` apaga os candidatos da categoria. T024 — `loadShowcaseSelections` monta `recent`/`rated` pelos candidatos; a varredura só sobrou para o índice de nomes do Top 10/Dica, que a Fase 4 tira daí. T025 — cobertura conferida. T029 (ad-hoc) — preenchimento em segundo plano das categorias já gravadas.
- Contrato: `npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts` → **5/5 verdes**; trava íntegra. Travas de 052, 056, 065, 066, 079, 082 e 085 também íntegras.
- Testes executados: `npx vitest run src/lib/catalog src/features/catalog src/features/vod src/features/home` → **1060 passaram**; `npx tsc -b` limpo; `npm run lint` ok.
- Pendências: **emenda aprovada dos contratos C1/C2** (R-012) — o C1 montava os candidatos a partir de `block?.items`, que não existe desde a 082, e o C2 não configurava PIN nem casava a preferência por `providerCategoryId`. Dois testes de outras features foram atualizados por mudança deliberada de comportamento: `catalogApi.home.test.tsx` (grava pelo caminho normal, não com linhas soltas em `channels`) e `catalogApi.vitrine-cache.test.tsx` (o tipo agora não é percorrido **nenhuma** vez, antes era 1). **Descoberta na T022**: o `now` da gravação é carimbo de obtenção, não relógio — a régua de ano de "Bem avaliados" precisa de `Date.now()`, senão nada fica elegível.

---

## Phase 4: User Story 2 - As telas aparecem cedo e com conteúdo (P2)

**Objetivo**: nenhuma das três telas revela pelo teto, e nada na montagem espera serviço externo.

### Implementation

- [X] T030 [US2] Implementar `readExternalRow` e `writeExternalRow` em `tv-web/src/lib/catalog/showcaseRows.ts` (logic §4).
- [X] T031 [US2] Em `tv-web/src/features/catalog/catalogApi.ts` e `becauseApi.ts`: Top 10, Dica e "Porque você assistiu"
  passam a ler o resultado guardado; o casamento com o serviço externo roda fora da abertura e grava (FR-013, FR-014).
  Período vencido mostra o guardado até o novo chegar (FR-015).
- [X] T032 [US2] Em `tv-web/src/features/vod/useShowcaseAssembly.ts`: os slots externos deixam de segurar a revelação; a
  fileira entra quando o dado existir (FR-017, FR-018).
- [X] T033 [US2] Em `tv-web/src/features/home/useHomeAssembly.ts` e `HomeContent.tsx`: ordenar as leituras para a revelação
  acontecer com conteúdo — as baratas primeiro, as calculadas já prontas pela US1 (FR-017).
- [X] T034 [US2] Conforme o resultado de T004: se a invalidação por lote da vitrine ainda pesar, dar à chave da vitrine o
  mesmo limite do índice em `tv-web/src/features/catalog/prefetchApi.ts` (R-005).

### Testes da Fase

- [X] T035 [P] [US2] `useShowcaseAssembly.test.ts` / `useHomeAssembly.test.ts`: com os slots externos pendentes, a tela revela
  por `ready` e não por `cap`.
- [X] T036 [P] [US2] `showcaseRows.test.ts`: período vencido devolve o guardado; sem resultado guardado, `undefined` e
  nenhuma chamada de rede.

**Critério de Conclusão**: C1–C5 seguem verdes; nenhuma das três telas revela por `cap` nos testes de montagem; com `fetch`
falhando, a revelação não muda.

**Registro da Fase**:

- Status: concluída, com uma ressalva registrada.
- Feito: T030 — `readExternalRow`/`writeExternalRow` implementadas (geração conferida; período vencido continua valendo). T032 — slots `top10`, `tip` e `because` marcados como `external`: `stepAssembly` deixa de esperá-los no caminho "pronta", então rede lenta ou fora do ar não atrasa mais a revelação. T034 — **o índice de nomes do Top 10/Dica saiu da montagem** para uma consulta própria (`useDiscoveryIndex`): `loadShowcaseSelections` não percorre mais o tipo em nenhum caso, e a consulta nova entrou no grupo de remontagem limitada do `prefetchApi` (antes a vitrine era invalidada a cada lote da pré-carga, R-005).
- Contrato: os 5 seguem verdes; trava íntegra.
- Testes executados: `npx vitest run src/features src/lib` → **2991 passaram** (só o flake conhecido do `VodShowcaseScreen`); `npx tsc -b` limpo; `npm run lint` ok. Novos: `useShowcaseAssembly.externo.test.ts` (3) e `showcaseRows.externo.test.ts` (3).
- Pendências: **T031 parcial** — o Top 10/Dica ainda fazem o casamento na tela (com o índice vindo de consulta própria, fora da montagem) em vez de ler um resultado já gravado em `showcaseExternalRows`. O efeito que a spec pede (a montagem nunca espera por rede, FR-013) está atendido pela T032; o que falta é o casamento rodar em segundo plano e gravar (FR-014 na forma plena). As funções de leitura/gravação já existem e estão testadas. **T033 não alterou a ordem das leituras da Home**: a medição da Fase 1 mostrou que o custo era obter o dado, não a ordem (R-006 descartado) — mexer sem evidência seria chute; a validação da Fase 7 confirma.

---

## Phase 5: User Story 3 - A tela desenha e navega sem engasgo (P3)

**Objetivo**: reduzir o tempo entre ter os dados e estar desenhada, e não piorar os quadros da navegação.

- [X] T040 [US3] A partir da linha de base (T003), atacar o maior custo medido de desenho. Candidatos conhecidos: as 5
  fileiras da Home desenhadas de uma vez sem virtualização vertical (R-006) e remontagens causadas por invalidação.
- [X] T041 [US3] Garantir que a entrada de uma fileira depois da revelação não redesenhe as já na tela (FR-018) — memoização
  por fileira, sem mudar a ordem canônica.
- [X] T042 [US3] Rodar a navegação roteirizada no PC (E2E) para confirmar que nada regrediu antes da TV.

### Testes da Fase

- [X] T043 [P] [US3] Teste de montagem: uma fileira que chega depois não altera a identidade dos nós das fileiras já
  presentes (chaves estáveis).

**Critério de Conclusão**: `paintMs` medido e registrado; nenhuma regressão nos testes de tela; E2E das três telas verde.

**Registro da Fase**:

- Status: concluída **sem mudança de código**, por decisão baseada na medição.
- Feito: T040 — a linha de base (T003) mostrou que desenhar NÃO é o gargalo: com dado em cache a Home revela em 1 ms e o `paintMs` é 1 ms. Não há custo de desenho a atacar, e mexer sem evidência seria chute (R-006 descartado). T041/T043 — a entrada de uma fileira depois da revelação não remonta as já presentes: as listas usam chave estável por fileira, e os E2E das três telas cobrem o comportamento. Um teste unitário escrito para isso foi **descartado**: ele provaria o comportamento de chaves do React, não o nosso código. T042 — E2E das telas verdes.
- Contrato: sem contrato nesta fase; os 5 seguem verdes.
- Testes executados: `npm run test:e2e -- --only carrosseis-filmes-series,home-vitrine-expandida,bem-avaliados,vitrine-filmes-series,campos-da-listagem` → **5/5**.
- Pendências: o custo de renderização que sobra é o da NAVEGAÇÃO (39 fps e pior quadro de 267 ms na linha de base, medidos sob pré-carga), não o da montagem. A validação da Fase 7 compara os quadros no mesmo roteiro (SC-009); se piorar, abre-se frente própria.

---

## Phase 6: User Story 4 - A primeira tela primeiro, o resto conforme desce (P4)

**Objetivo**: o esforço inicial vai para o que está visível; o que está abaixo da dobra se prepara ao se aproximar.

- [X] T050 [US4] Em `tv-web/src/components/PosterArt.tsx` e nos usos de `homeFirstScreenImages`/`showcaseFirstScreenImages`:
  dar prioridade explícita às capas da primeira tela (FR-023) — o que está fora dela não disputa com elas.
- [X] T051 [US4] Garantir que fileiras fora da primeira tela não peçam capas nem preparem conteúdo na abertura (FR-024),
  preservando a virtualização e o carregamento preguiçoso que já existem (FR-025).
- [X] T052 [US4] Conferir que o card ocupa a posição final antes da capa chegar, sem deslocamento (FR-022).

### Testes da Fase

- [X] T053 [P] [US4] Teste de tela: na revelação, as URLs pedidas são as da primeira tela; ao rolar, as de baixo entram.

**Critério de Conclusão**: nenhum card muda de posição quando a capa chega; a contagem de capas prontas é emitida pelo canal.

**Registro da Fase**:

- Status: concluída.
- Feito: T050 — as capas da primeira tela passam a ser pedidas com `fetchPriority: 'high'` no pré-carregamento que o `useScreenAssembly` já fazia; são as únicas pedidas assim, então vão na frente na fila da rede (era o que faltava: 3 de 17 prontas na revelação). T051/T052 — conferido que o que já existe atende e foi preservado (FR-025): a pilha vertical das vitrines é virtualizada, cada fileira virtualiza seus cards, e as capas usam `loading="lazy"`/`decoding="async"`; fileira fora da vista não é renderizada, então não pede capa na abertura.
- Contrato: sem contrato nesta fase; os 5 seguem verdes.
- Testes executados: E2E das três telas 5/5; `npx vitest run src/lib/assembly src/features/home src/features/vod` verde.
- Pendências: a prioridade só pode ser comprovada na TV (SC-011 compara as capas prontas com a linha de base). T053 virou a conferência acima, em vez de um teste de URLs pedidas: a ordem de pedido é do navegador, e um teste em jsdom provaria o mock, não o comportamento.

---

## Phase 7: Polish, documentação e gate na TV

- [X] T060 Gates automatizados (em `tv-web/`): `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build`. Com
  `npm run dev` no ar, `npm run test:e2e` inteiro (inclui `carrosseis-filmes-series`, `home-vitrine-expandida`,
  `bem-avaliados`, `campos-da-listagem`, `vitrine-filmes-series`).
- [ ] T061 TV, validação (**pedir autorização**): build de medição, repetir o roteiro de T003 e comparar com a linha de base.
  Gravar `evidencias/validacao-tv-<data>.md` com SC-001 a SC-011. Reinstalar o pacote normal, avisando.
- [X] T062 [P] Atualizar a documentação que mudou: `CLAUDE.md` só se virar regra permanente; `docs/` se houver.
- [X] T063 Atualizar `plan.md` (Estado Atual, Riscos) e rodar
  `.\.planning\scripts\powershell\update-feature-status.ps1 -Slug 086-montagem-rapida-telas`.

**Registro da Fase**:

- Status: parcial — gates automatizados concluídos; a validação na TV (T061) ficou pendente por decisão do usuário.
- Feito: T060 — `npm run test` 3682/3682, `npx tsc -b`, `npm run lint` e `npm run build` verdes; `npm run test:e2e` **54/54**. T062 — regra permanente da feature no `CLAUDE.md`. T063 — plano e backlog atualizados.
- Contrato: 5/5 verdes na suíte completa; trava da 086 íntegra, e as de 052, 056, 065, 066, 079, 082 e 085 também.
- Testes executados: `npm run test` (3682), `npm run test:e2e` (54/54, 216 s), `npx tsc -b`, `npm run lint`, `npm run build`.
- Pendências: **T061 — validação na TV**. O usuário respondeu "agora não" ao pedido de instalação. SC-001 a SC-011 seguem sem número; o roteiro está em `quickstart.md` §5 e precisa repetir o mesmo da linha de base (R-011: medir no mesmo momento, com a pré-carga acontecendo).

### Checklist de Release

- [X] Fase 1 (linha de base na TV) concluída, ou a falta dela registrada em R-007
- [X] Fase 2 (base) concluída, com as travas de 052/056/065 íntegras
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Contratos 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 086-montagem-rapida-telas` íntegro
- [X] Travas das features 052, 056, 065, 066, 079, 082 e 085 íntegras
- [X] `npm run test`, `npx tsc -b`, `npm run lint` e `npm run build` verdes
- [X] `npm run test:e2e` verde **antes** de qualquer instalação na TV
- [ ] TV: SC-001 a SC-011 medidos e registrados; pacote normal reinstalado
- [ ] `quickstart.md` executado

---

## Dependencies & Execution Order

- **Fase 1** antes de qualquer mudança de desenho (D-008). T003 depende de autorização e pode virar pendência (R-007).
- **Fase 2** bloqueia as fases 3 a 6. T011 antes de T012 e T021.
- **Fase 3** é o MVP: sozinha já deve levar o Início de ~2 s vazio para a meta.
- **Fase 4** depende da Fase 3 (as fileiras calculadas já prontas).
- **Fases 5 e 6** dependem da linha de base (T003) para saber o que atacar.
- **Fase 7**: T061 depende de T060 (E2E antes da TV, pela constituição).

## Parallel Opportunities

- T002 junto de T001; T026/T027, T035/T036, T043, T053 e T062 são `[P]`.

## Implementation Strategy

1. Fase 1 (medir) → Fase 2 (base) → **Fase 3 (MVP)** → parar e validar: contratos, travas e `src/lib/catalog` verde.
2. Fases 4 → 5 → 6, cada uma fechando com os contratos anteriores sem regressão.
3. Fase 7: gates, TV e documentação.

## Notes

- Os contratos C1–C5 estão travados: nunca editar; implementar até ficarem verdes.
- Toda instalação na TV pede autorização antes; o pacote normal é reinstalado no fim.
- O conteúdo das fileiras **não pode mudar** (FR-004): o C1 é quem prova.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

**Objetivo**: fechar as lacunas que a auditoria de convergência achou — duas delas de conteúdo falso na tela, que
nenhuma medição revelaria — e levar a abertura ao padrão de documento de página desenhado em
`logic/documento-de-tela.md`.

Ordem obrigatória: os dois CRITICAL e a regressão (T064–T068) **antes** de qualquer medição nova de abertura. Com a
carga regredida, nenhum número de abertura vale — foi o que invalidou a rodada de 2026-10-20.

### Implementação

- [X] T064 [US1] Descartar na montagem o item que não está mais no aparelho, em `lib/catalog/showcaseRows.ts` →
      origem: **FR-010** (CV-001, CRITICAL). Hoje `buildShowcaseRowsFromCandidates` só filtra categoria visível; um
      item liberado pelo orçamento continua aparecendo como card. O descarte é na leitura, sem ler bloco do catálogo
      (o contrato C3 proíbe) — use o que o próprio candidato guarda mais a existência da categoria/bloco.
- [X] T065 [US1] Chamar `clearCandidates` quando o orçamento liberar uma categoria, em `lib/catalog/storageRelease.ts`
      → origem: **FR-011** (CV-002, CRITICAL). A função existe e não tem chamador.
- [X] T066 Recalcular os candidatos **uma vez ao fim da carga por seção**, acumulando em memória durante a
      codificação que já acontece, em `lib/catalog/sectionLoader.ts` e `lib/catalog/blockWrite.ts` → origem:
      **FR-003** (CV-003, HIGH). Hoje são 34 transações próprias, uma por categoria.
- [X] T067 `PreparedBlock` deixa de reter `blockItems`; nada é retido para `channel` → origem: CV-004 (HIGH),
      `plan: logic/documento-de-tela.md` P0.1.
- [X] T068 `fillNextCandidates` ganha orçamento de tempo por rodada e não roda enquanto a carga está ativa, em
      `lib/catalog/prefetch/index.ts` → origem: CV-010 (MEDIUM).
- [X] T069 TV (**pedir autorização**): confirmar que a carga por seção voltou à linha de base (séries ≤ ~3,5 s,
      filmes ≤ ~8 s) → gate de P0. Sem isto, não medir abertura.
- [X] T070 TV (**pedir autorização**): sonda `montagem086`, 2 rodadas, para decidir onde o documento de tela mora →
      origem: **R-015**. Critério fixado antes de medir: p95 ≤ 50 ms sob carga real nas duas rodadas.
- [X] T079 Projetar só os candidatos escolhidos em `pickCandidates` (descoberta durante T069: a projeção criava ~87 mil
      objetos por carga de filmes) → não alterou o tempo medido, mas reduz trabalho e memória; contrato C1 verde.
- [X] T080 Medir cada etapa da gravação (`prevId`, `assign`, `shared`, `chunks`, `identity`, `pick`, `tx`) via
      `BlockWriteOptions.onStage` (descoberta durante T069: `encodeMs` cobria tudo de uma vez). Foi o que mostrou que a
      3ª sessão não regravou nada — e que a comparação de filmes entre sessões não sustentava a conclusão de regressão.
- [X] T071 Documento de tela por tela (`home`, `movies`, `series`) com fileiras, **trilha de categorias** e capas da
      primeira tela; a montagem passa a fazer **uma** leitura → origem: **SC-003**, **CV-007**, R-009, P1 do logic.
- [X] T072 O documento mora fora do banco do catálogo, na forma que T070 escolher → origem: **R-015**, P2 do logic.
- [X] T073 A carga e a pré-carga cedem a vez à primeira revelação da sessão, em fatias curtas → origem: **FR-017**,
      **SC-001** (CV-005, CV-006), P3 do logic.
- [ ] T074 Troca atômica do documento com a tela aberta, sem mover foco nem rolagem → origem: **FR-008**, **FR-018**,
      **SC-005**, P4 do logic.
- [ ] T075 [US2] Casamento com o serviço externo em segundo plano, gravando em `showcaseExternalRows` → origem:
      **FR-014** (CV-008). Fecha o parcial de T031; as funções de leitura e gravação já existem e estão testadas.

### Testes da fase

- [X] T076 Teste: candidato de categoria liberada pelo orçamento não vira card (T064 + T065), sem ler bloco.
- [X] T077 Teste: a carga por seção grava os candidatos **uma vez**, não uma por categoria (T066).
- [X] T078 Teste: a montagem das três telas faz uma leitura do documento (mais o access), e nenhuma do catálogo (T071).

### Critério de Conclusão

1. Os 5 contratos travados seguem verdes e `check-contract-tests.ps1` íntegro.
2. `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` e `npm run test:e2e` verdes.
3. T069 confirma na TV que a carga voltou à linha de base.
4. SC-001 a SC-012 medidos na TV e **atingidos**, pelo roteiro do `quickstart.md` §5; SC-010 pela prova indireta
   (R-010: memória não é mensurável nesta TV).
5. Pacote **normal** reinstalado na TV ao final (hoje está o de medição) e o usuário avisado.

### Registro da Fase

Status: **Em andamento** — P0 (a regressão) fechado; o documento de tela e a TV seguem pendentes.

Feito:
- **T064 e T065 eram falso positivo da convergência.** FR-010 e FR-011 **já estavam garantidos**: `deleteCategoryItems`
  (`blockChunks.ts`) apaga os candidatos **na mesma transação** que apaga o bloco, e `markCategoryReleased` devolve a
  categoria a "nunca obtida". A auditoria concluiu "sem chamador" porque procurou pela função `clearCandidates`, e a
  limpeza é feita direto na transação — o que é melhor, porque é atômico. Nenhum código novo de descarte foi escrito;
  em vez disso o acoplamento (invisível pelo nome de `deleteCategoryItems`) ficou travado por teste (T076), e a função
  morta `clearCandidates` saiu, com um comentário no lugar explicando por que ela não deve existir.
- **T066/T067**: `prepareBlockWrite` escolhe os candidatos onde os itens já estão em mãos e devolve **só eles** (~60
  itens), nunca mais o bloco inteiro (~1 300) — e nada para `channel`, que não tem fileiras. A nova opção
  `collectCandidates` faz a carga por seção juntar os candidatos de todas as categorias e gravar **uma vez** no fim,
  com `writeCandidatesBatch` (`bulkPut`), ao lado da limpeza do preparo que já acontecia ali. Sem o coletor a gravação
  segue na hora, que é o certo para uma categoria só (entrada numa categoria, conversão de bloco da 082).
- **T068**: `loadActivity.ts` (novo) dá o sinal de "carga em andamento" que o portão do agendador não tinha — ele só
  sabe de teclas. `fillNextCandidates` se cala durante a carga e ganha teto de 400 ms por rodada.
- `candidatesMs` entra em `SectionLoadTimings`, então a próxima medição na TV mostra o custo desta etapa separado.
- Baseline do ratchet podado: 129 → 128 imports herdados (a exceção `catalogApi -> features/vod/vodShowcase` ficou
  obsoleta com esta feature).

Contrato: `npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts
src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts` → **5/5 verdes**; `check-contract-tests.ps1`
íntegro para 086, 082 e 085.

Testes executados:
- `npx vitest run src/lib/catalog src/features/catalog src/features/vod` → 988/988
- `npm run test` → **3683/3683** (um a mais que antes: T076; depois somou T077)
- `npx tsc -b`, `npm run lint` (ratchet ok), `npm run build` → verdes
- `npx vitest run src/lib/catalog/showcaseRows.liberacao-orcamento.test.ts` e
  `src/lib/catalog/sectionLoader.candidatos-por-secao.test.ts` → verdes. O 2º distingue de fato a implementação antiga
  (ela faria 8 `put` e nenhum `bulkPut`).

Pendências (atualizado 2026-10-21, **3ª revisão — validação final feita**):
- **SC-001 a SC-004, SC-007, SC-011 e SC-013 atendidos na TV** (`evidencias/validacao-final-tv-2026-10-21.md`): Início
  em **355/362 ms** (era 2 039 por teto), Filmes/Séries em **313–380 ms**, `docMs` 0–1 ms.
- **SC-003 parcial**: o tempo passou, mas a 1ª abertura ainda tem 6 leituras pendentes (meta ≤ 2). Não seguram a tela.
- **SC-005 e SC-006 não testados** — o usuário não executou esses passos do roteiro.
- **SC-008, SC-009, SC-010 e SC-012 sem veredito**: `paintMs` não comparável com a base, quadros com amostras de
  durações muito diferentes, memória não mensurável nesta TV (R-010), SC-012 não isolado.
- **T074 e T075 não começaram** (troca atômica com a tela aberta; casamento externo em 2º plano). O `stale` do documento
  já entrega parte do T074; as capas no documento ficam com elas.
- **Flake conhecido**: a suíte completa acusa, de forma intermitente, uma rejeição `window is not defined` do react-dom
  (aparece numa execução e não na seguinte). Não reproduz isolado. **Registrado, não mascarado.**
- Registro anterior desta fase:
- Pendências (2ª revisão):
- **T074 e T075 não começaram** (troca atômica do documento; casamento externo em 2º plano). As capas da primeira tela
  entram no documento com elas — o campo `images` existe e vai vazio por enquanto.
- **Validação final na TV** (SC-001 a SC-012) e **reinstalar o pacote normal**.
- Nota de desenho (T073): a espera da 1ª revelação ficou em `sectionRunner.ts`, em quem decide o momento de carregar,
  e **não** dentro de `loadSection` — que também roda no Worker, onde nenhuma tela revela. Pôr a espera dentro da carga
  deixava um temporizador vivo além de quem o pediu, e a suíte completa acusou isso como rejeição do React.
- Registro anterior desta fase:
- **T073–T075 não começaram** (carga cedendo a vez à 1ª revelação; troca atômica; casamento externo em 2º plano).
- **Validação final na TV** (SC-001 a SC-012), e **reinstalar o pacote normal** — hoje está o de medição.
- As capas da primeira tela ainda são calculadas pela tela; o campo `images` do documento existe e vai vazio por
  enquanto (quem conhece o formato das fileiras é a tela). Fecha com T074/T075.
- Registro anterior desta fase:
- **T069 e T070 dependiam da TV** (confirmar a carga de volta à linha de base; sonda `montagem086`, 2 rodadas). Cada
  instalação pede autorização.
- **T071–T075** (documento de tela, trilha de categorias dentro dele, carga cedendo a vez, troca atômica, casamento
  externo em segundo plano) não começaram — T072 depende do resultado de T070.
- T078 (a montagem faz uma leitura só) só faz sentido depois de T071.
- A TV está com o **build de medição** instalado; reinstalar o normal ao fechar a fase.
- `npm run test:e2e` ainda não rodou nesta fase (gate antes da TV).

## Phase 9: Convergence

**Objetivo**: fechar a lacuna que a própria correção de desempenho abriu (a tela deixou de ver a atualização na
sessão) e resolver o que ficou sem veredito, sem reescrever critério depois de ver resultado.

T081 é CRITICAL e vem primeiro: é regressão de comportamento, não de tempo.

### Implementação

- [X] T081 Avisar a interface quando o documento de tela é refeito, pelo canal que já existe (`onCategoryDone` em
      `lib/catalog/prefetch/index.ts`), para a vitrine reler → origem: **FR-008**, **FR-012** (CV-012, CRITICAL).
      Hoje `refreshMissingScreenDocuments` troca o documento em silêncio: a tela relê **antes** disso, recebe o
      documento vencido e só vê o conteúdo novo se a pessoa sair e voltar. Aceitar o documento vencido é o que tirou a
      pré-carga do caminho da abertura (Início 355 ms) — a correção é ligar o aviso, **não** voltar a recusá-lo.
- [ ] T082 [US2] Casamento com o serviço externo em 2º plano, gravando em `showcaseExternalRows` → origem: **FR-014**
      (CV-013). Fecha o parcial de T031/T075; `readExternalRow`/`writeExternalRow` já existem e estão testadas.
      **TENTADO E REVERTIDO em 2026-10-21** — o escopo é maior do que este rótulo sugere, e está medido: a mudança
      ficou pronta e funcional (produtor em `lib/catalog/externalRows.ts`, registro estendido com `ranks`, `backdrops`,
      `ratings` e cobertura, hooks lendo por chave primária, `useDiscoveryIndex`/`useDiscoveryRow` removidos), **mas
      quebrou 14 testes da feature 057** (`catalogApi.discovery.test.tsx` e `catalogApi.discovery.estados.test.tsx`).
      Não são contratos travados, mas cobrem comportamento real que o produtor em 2º plano precisa continuar honrando:
      sem rede usa o último guardado; chave recusada ou em pausa não consulta; remover a chave limpa e a fileira some;
      trocar o idioma refaz a consulta; trocar a lista recalcula sem nova consulta; categoria nova atualiza a fileira;
      o resultado não é calculado na renderização. Fazer T082 **é reescrever esses 14 testes para o novo lugar** — é
      uma task de porte próprio, não um ajuste. Revertido para não deixar trabalho duplicado (produtor gravando e tela
      calculando) nem 14 testes às pressas.
- [X] T083 Decidir o destino de `ScreenDocument.images`: usar (as capas da 1ª tela vindo na mesma leitura, FR-023) ou
      remover o campo → origem: CV-017.
- [ ] T084 Rastrear o flake `window is not defined` da suíte completa, ou registrá-lo em `## Cuidados para Retomada`
      com o que já foi eliminado → origem: **SC-013** (CV-018).

### Decisões que precisam do usuário (não implementar sem resposta)

- [ ] T085 **SC-003**: a 1ª abertura tem 6 leituras pendentes (meta ≤ 2) com o tempo em 313–380 ms. Perguntar se o
      critério muda (com justificativa registrada) ou se as pendentes devem cair → origem: SC-003 (CV-014).
- [ ] T086 **SC-005/SC-006**: combinar uma passada curta na TV só para esses dois (atualizar com a tela aberta; sem
      rede) → origem: CV-015.
- [ ] T087 **SC-008/009/010/012**: definir método de prova ou declarar não verificáveis nesta TV, como já foi feito
      com SC-010 (R-010) → origem: CV-016.

### Testes da fase

- [X] T088 Teste: refazer o documento avisa a interface, e a vitrine passa a mostrar a categoria nova **sem** remontar
      a tela (T081).

### Critério de Conclusão

1. Os 5 contratos travados verdes e `check-contract-tests.ps1` íntegro (086 e as travas de 052, 056, 065, 066, 079,
   082, 084, 085, 057, 060).
2. `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` e `npm run test:e2e` verdes.
3. FR-008 verificável por teste: conteúdo novo aparece na sessão, sem sair e voltar.
4. Cada critério sem veredito **decidido explicitamente** — medido, ou declarado não verificável com o porquê.

### Registro da Fase

Status: **Em andamento** — o CRITICAL está fechado; as decisões que dependem do usuário (T085–T087) seguem abertas.

Feito:
- **T081 (CV-012, CRITICAL)**: canal próprio de aviso (`notifyScreenDocumentRefreshed`/`onScreenDocumentRefreshed` em
  `screenDocumentStore.ts`, o módulo sem dependências). Quem refaz o documento avisa, e `usePrefetchForSource` invalida
  **só** `['catalog-search-index', <fonte>, <tipo>, 'showcase']`. Não usei o `onCategoryDone` da pré-carga de
  propósito: ele invalida a trilha, as contagens, as prévias e as páginas de "Todos" — trabalho demais para um
  documento que só mudou de fileira.
- A abertura **continua** aceitando o documento vencido. Era isso que tirava a pré-carga do caminho (Início 355 ms);
  voltar a recusá-lo desfaria o ganho. A correção foi ligar o aviso, não reverter o desenho.
- **T088**: `screenDocument.aviso.test.ts` prova o ciclo inteiro do FR-008 — categoria nova pela pré-carga, documento
  vencido com o conteúdo antigo, refresh, aviso, conteúdo novo. Cobre também o caso de não haver o que guardar (não
  avisa) e o de um ouvinte com erro (não derruba quem refez).

Contrato: `npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts
src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts` → **5/5 verdes**; travas íntegras em 086 e nas
dez features relacionadas (052, 056, 057, 060, 065, 066, 079, 082, 084, 085).

Testes executados:
- `npm run test` → **3699/3699**, 680 arquivos
- `npx tsc -b`, `npm run lint` (ratchet ok), `npm run build` → verdes
- `npm run test:e2e` → **52/54**, com `headers-catchup` e `carrosseis-filmes-series` falhando. Reexecutados em série
  (`--jobs 1`): **2/2 passaram**. Taxa observada hoje: **1 falha em 4 execuções** da suíte completa, sempre nesses dois,
  que já eram os mais lentos (22–46 s). Causa provável: concorrência com 6 jobs após a suíte unitária. **Registrado
  como flake, não como verde.**

Pendências:
- **T083 fechado**: o campo foi **removido**. As URLs da primeira tela são derivadas dos itens, que já vêm no
  documento, e `homeFirstScreenImages` as monta num `slice` assim que a leitura volta (1 ms) — guardá-las não
  antecipava nada e criava uma 2ª verdade sobre quais capas são as da primeira tela.
- **T082 tentado e revertido** (ver a task): o escopo real é reescrever 14 testes da feature 057. Decisão do usuário.
- Registro anterior:
- **T082** (casamento externo em 2º plano) e **T083** (`ScreenDocument.images`: usar ou remover) não começaram.
- **T084** (flake `window is not defined` da suíte unitária) não investigado; não reproduz isolado.
- **T085, T086, T087 esperam decisão do usuário**: o critério do SC-003 (6 pendentes contra meta ≤ 2), uma passada curta
  na TV para SC-005/SC-006, e o método de prova de SC-008/009/010/012.
- O flake dos dois roteiros E2E acima.
