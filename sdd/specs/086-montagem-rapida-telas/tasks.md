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

- [ ] T010 Em `tv-web/src/lib/catalog/db.ts`: schema **v17** com `showcaseCandidates: 'categoryId, [sourceId+generation+kind]'`
  e `showcaseExternalRows: 'id, [sourceId+generation+kind]'`. Sem `.upgrade()` (tabelas novas), seguindo o padrão das v14–v16.
- [ ] T011 Mover a lógica pura de seleção para `tv-web/src/lib/catalog/showcaseSelection.ts` (D-006): os acumuladores de
  `features/vod/vodShowcase.ts` e `features/vod/ratedSelection.ts`, **sem alterar o algoritmo**; os dois arquivos passam a
  reexportar de lá. Rodar as travas das features 052, 056 e 065 na mesma task → risco R-004.
- [ ] T012 Implementar `selectShowcaseRowsByScan` em `showcaseSelection.ts`: a varredura de hoje (o corpo de
  `loadShowcaseSelections`, `catalogApi.ts:1651`), movida sem mudança de comportamento → contrato: C1 (é a referência).
- [ ] T013 Em `tv-web/src/lib/catalog/sourceDeletion.ts`: incluir as duas tabelas novas na limpeza da lista (FR-009).

**Critério de Conclusão**: `npx vitest run src/lib/catalog src/features/vod` verde, travas de 052/056/065 íntegras, e
`selectShowcaseRowsByScan` devolvendo o mesmo que a vitrine devolvia antes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

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

- [ ] T020 [US1] Implementar `pickCandidates`, `writeCandidates`, `clearCandidates` e `readCandidates` em
  `tv-web/src/lib/catalog/showcaseCandidates.ts`, conforme `logic/selecoes-guardadas.md` §1 e §3. `pickCandidates` é pura e
  reaproveita `projectReadItem` (`readProjection.ts`) → contrato: C5
- [ ] T021 [US1] Implementar `buildShowcaseRowsFromCandidates` em `tv-web/src/lib/catalog/showcaseRows.ts` conforme o §2 do
  logic: filtra por `getCategoryAccess` na leitura, mescla na ordem da fonte com os acumuladores de `showcaseSelection.ts`,
  conta elegíveis distintos na mesclagem (R-002) → contrato: C1, C2, C3
- [ ] T022 [US1] Em `tv-web/src/lib/catalog/repository/categoryItems.ts` (`renewCategoryItems`): gravar os candidatos da
  categoria junto da gravação, com os itens já em mãos, respeitando `makeRoomFor` (082). Nenhuma leitura extra → contrato: C4
- [ ] T023 [US1] Em `tv-web/src/lib/catalog/storageRelease.ts`: liberar uma categoria apaga os candidatos dela (FR-011).
- [ ] T024 [US1] Em `tv-web/src/features/catalog/catalogApi.ts`: `useRecentlyAdded` e `useTopRated` passam a ler
  `buildShowcaseRowsFromCandidates`; `loadShowcaseSelections` sai do caminho da tela (D-007). Manter a chave de consulta e a
  invalidação atuais, para o frescor continuar funcionando (FR-008, FR-012).
- [ ] T025 [US1] Conferir que o aviso de cobertura parcial continua correto com a cobertura guardada (FR-006).

### Testes da Fase

- [ ] T026 [P] [US1] `showcaseCandidates.test.ts`: categoria sem item elegível; item sem data/nota/ano; limite exato
  (`RECENT_CANDIDATES` itens) e um a mais.
- [ ] T027 [P] [US1] `showcaseRows.test.ts`: lista sem candidato nenhum devolve fileiras vazias e cobertura 0; candidatos de
  geração anterior são ignorados (FR-009); item de categoria apagada é descartado (FR-010).
- [ ] T028 [US1] Rodar `npx vitest run src/lib/catalog src/features/catalog src/features/vod` e as travas de 052/056/065/082.

**Critério de Conclusão**: os 5 contratos verdes
(`npx vitest run src/lib/catalog/showcaseRows.montagem-rapida.contract.test.ts src/lib/catalog/showcaseCandidates.montagem-rapida.contract.test.ts` → 5/5),
`check-contract-tests.ps1 -Slug 086-montagem-rapida-telas` íntegro, e nenhum caminho de abertura chamando
`selectShowcaseRowsByScan`, `loadSearchIndex` ou `iterateKindRecordBatches`.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 4: User Story 2 - As telas aparecem cedo e com conteúdo (P2)

**Objetivo**: nenhuma das três telas revela pelo teto, e nada na montagem espera serviço externo.

### Implementation

- [ ] T030 [US2] Implementar `readExternalRow` e `writeExternalRow` em `tv-web/src/lib/catalog/showcaseRows.ts` (logic §4).
- [ ] T031 [US2] Em `tv-web/src/features/catalog/catalogApi.ts` e `becauseApi.ts`: Top 10, Dica e "Porque você assistiu"
  passam a ler o resultado guardado; o casamento com o serviço externo roda fora da abertura e grava (FR-013, FR-014).
  Período vencido mostra o guardado até o novo chegar (FR-015).
- [ ] T032 [US2] Em `tv-web/src/features/vod/useShowcaseAssembly.ts`: os slots externos deixam de segurar a revelação; a
  fileira entra quando o dado existir (FR-017, FR-018).
- [ ] T033 [US2] Em `tv-web/src/features/home/useHomeAssembly.ts` e `HomeContent.tsx`: ordenar as leituras para a revelação
  acontecer com conteúdo — as baratas primeiro, as calculadas já prontas pela US1 (FR-017).
- [ ] T034 [US2] Conforme o resultado de T004: se a invalidação por lote da vitrine ainda pesar, dar à chave da vitrine o
  mesmo limite do índice em `tv-web/src/features/catalog/prefetchApi.ts` (R-005).

### Testes da Fase

- [ ] T035 [P] [US2] `useShowcaseAssembly.test.ts` / `useHomeAssembly.test.ts`: com os slots externos pendentes, a tela revela
  por `ready` e não por `cap`.
- [ ] T036 [P] [US2] `showcaseRows.test.ts`: período vencido devolve o guardado; sem resultado guardado, `undefined` e
  nenhuma chamada de rede.

**Critério de Conclusão**: C1–C5 seguem verdes; nenhuma das três telas revela por `cap` nos testes de montagem; com `fetch`
falhando, a revelação não muda.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - A tela desenha e navega sem engasgo (P3)

**Objetivo**: reduzir o tempo entre ter os dados e estar desenhada, e não piorar os quadros da navegação.

- [ ] T040 [US3] A partir da linha de base (T003), atacar o maior custo medido de desenho. Candidatos conhecidos: as 5
  fileiras da Home desenhadas de uma vez sem virtualização vertical (R-006) e remontagens causadas por invalidação.
- [ ] T041 [US3] Garantir que a entrada de uma fileira depois da revelação não redesenhe as já na tela (FR-018) — memoização
  por fileira, sem mudar a ordem canônica.
- [ ] T042 [US3] Rodar a navegação roteirizada no PC (E2E) para confirmar que nada regrediu antes da TV.

### Testes da Fase

- [ ] T043 [P] [US3] Teste de montagem: uma fileira que chega depois não altera a identidade dos nós das fileiras já
  presentes (chaves estáveis).

**Critério de Conclusão**: `paintMs` medido e registrado; nenhuma regressão nos testes de tela; E2E das três telas verde.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 6: User Story 4 - A primeira tela primeiro, o resto conforme desce (P4)

**Objetivo**: o esforço inicial vai para o que está visível; o que está abaixo da dobra se prepara ao se aproximar.

- [ ] T050 [US4] Em `tv-web/src/components/PosterArt.tsx` e nos usos de `homeFirstScreenImages`/`showcaseFirstScreenImages`:
  dar prioridade explícita às capas da primeira tela (FR-023) — o que está fora dela não disputa com elas.
- [ ] T051 [US4] Garantir que fileiras fora da primeira tela não peçam capas nem preparem conteúdo na abertura (FR-024),
  preservando a virtualização e o carregamento preguiçoso que já existem (FR-025).
- [ ] T052 [US4] Conferir que o card ocupa a posição final antes da capa chegar, sem deslocamento (FR-022).

### Testes da Fase

- [ ] T053 [P] [US4] Teste de tela: na revelação, as URLs pedidas são as da primeira tela; ao rolar, as de baixo entram.

**Critério de Conclusão**: nenhum card muda de posição quando a capa chega; a contagem de capas prontas é emitida pelo canal.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 7: Polish, documentação e gate na TV

- [ ] T060 Gates automatizados (em `tv-web/`): `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build`. Com
  `npm run dev` no ar, `npm run test:e2e` inteiro (inclui `carrosseis-filmes-series`, `home-vitrine-expandida`,
  `bem-avaliados`, `campos-da-listagem`, `vitrine-filmes-series`).
- [ ] T061 TV, validação (**pedir autorização**): build de medição, repetir o roteiro de T003 e comparar com a linha de base.
  Gravar `evidencias/validacao-tv-<data>.md` com SC-001 a SC-011. Reinstalar o pacote normal, avisando.
- [ ] T062 [P] Atualizar a documentação que mudou: `CLAUDE.md` só se virar regra permanente; `docs/` se houver.
- [ ] T063 Atualizar `plan.md` (Estado Atual, Riscos) e rodar
  `.\.planning\scripts\powershell\update-feature-status.ps1 -Slug 086-montagem-rapida-telas`.

### Checklist de Release

- [ ] Fase 1 (linha de base na TV) concluída, ou a falta dela registrada em R-007
- [ ] Fase 2 (base) concluída, com as travas de 052/056/065 íntegras
- [ ] Fase 3 (US1) concluída
- [ ] Fase 4 (US2) concluída
- [ ] Fase 5 (US3) concluída
- [ ] Fase 6 (US4) concluída
- [ ] Contratos 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 086-montagem-rapida-telas` íntegro
- [ ] Travas das features 052, 056, 065, 066, 079, 082 e 085 íntegras
- [ ] `npm run test`, `npx tsc -b`, `npm run lint` e `npm run build` verdes
- [ ] `npm run test:e2e` verde **antes** de qualquer instalação na TV
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
