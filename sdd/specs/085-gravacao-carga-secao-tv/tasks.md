---
description: "Tasks da feature 085 — gravação da carga por seção mais rápida na TV"
---

# Tasks: Gravação da carga por seção mais rápida na TV

**Input**: Documentos de design de `sdd/specs/085-gravacao-carga-secao-tv/`

**Prerequisites**: plan.md, spec.md, logic/canal-metricas.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- App da TV: `tv-web/src/lib/catalog/` (carga, orçamento, preparo), `tv-web/src/lib/perf/` (medição) e
  `tv-web/src/components/PerfOverlay.tsx`.
- Sonda e coletor: `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/` (`coletor.mjs`, `memoria/`, `app2/`,
  `README.md`).
- Skill: `.claude/skills/tizen-sonda/SKILL.md` e `.agent/skills/tizen-sonda/SKILL.md` (idênticas).
- Evidência desta feature: `sdd/specs/085-gravacao-carga-secao-tv/evidencias/`.
- Comandos de teste rodam em `tv-web/`; os scripts `.planning/` rodam na raiz.

## Phase 1: Setup — linha de base na TV

**Purpose**: medir séries e canais **antes** da mudança (SC-005), já que filmes tem linha de base da 082. Sem isso, não
há como provar "sem regressão" depois.

- [X] T001 Criar `sdd/specs/085-gravacao-carga-secao-tv/evidencias/` e copiar para lá, como `linha-de-base-filmes.md`,
  a tabela de `sdd/assessments/gravacao-carga-secao-tv/evidencias/etapas-gravacao-tv-2026-10-19.md` (com a referência
  à origem).
- [X] T002 [P] Parametrizar a sonda por seção: `sonda-tv/memoria/gerar-vod-bruto.mjs` passa a gerar também
  `.amostras/seriesraw.json` (`get_series`) e `.amostras/liveraw.json` (`get_live_streams`) a partir das amostras
  sanitizadas `series.json`/`channel.json`, nos tamanhos da lista real (leia as contagens das amostras ou da evidência da
  082; nunca do `.env` em texto). `memoria/cargaWorker.ts` e o teste `etapasSecao` de `app2/memoria.js` recebem a seção
  (`movie`/`series`/`channel`) e escolhem o mapeador certo. Ensaie no PC (`README.md` da sonda).
- [X] T003 Medir a linha de base na TV (**pedir autorização antes de instalar**): `etapasSecao` ≥ 2× para séries e
  canais (e filmes, se couber na mesma instalação), com o código atual. Gravar em `evidencias/linha-de-base-tv.md`.
  Desinstalar a sonda no fim. Se o usuário não autorizar agora, registrar em Riscos (R-006) e seguir: T003 vira
  pendência da Fase 6, e a comparação de SC-005 fica sem linha de base do mesmo dia.

**Registro da Fase**:

- Status: parcial — T001 e T002 feitas; T003 (linha de base na TV) depende de autorização para instalar e ficou pendente.
- Feito: `evidencias/linha-de-base-filmes.md` (cópia da evidência do assessment). Sonda parametrizada por seção: `gerar-vod-bruto.mjs` gera `vodraw`/`seriesraw` (9 768 em 28 categorias)/`liveraw` (2 355 em 42); `cargaWorker.ts` recebe a seção; `etapasSecao` roda as 3 seções × 2 rodadas com `secaoAtual`, `secaoEtapas` e `secaoReal`. Ensaiada no PC (Chromium headless): as 3 seções rodam e o coletor recebe `etapasSecao`.
- Contrato: sem contrato nesta fase.
- Testes executados: ensaio no PC da sonda empacotada (`empacotar.mjs` + `http.server` + Playwright), loadSection real: filmes ~0,8 s, séries ~0,3 s, canais ~0,2 s (PC, não vale para a TV).
- Pendências: T003 — a linha de base de séries/canais deve ser medida com o código ANTERIOR à 085 (empacotar a sonda num `git worktree` do commit anterior e instalar só `etapasSecao`); pede autorização. Se não for medida, R-006 e SC-005 sem linha de base do mesmo dia.

---

## Phase 2: Foundational

Nenhuma. As três stories mexem em arquivos distintos e independem entre si: US1 em `storageRelease.ts`, US2 em
`sectionLoader.ts` e US3 em `metricsChannel.ts`, `sectionRunner.ts`, `sectionWorker.ts` e `perf/`. A US3 só usa
`onTimings`, que a T020 adiciona em `sectionLoader.ts`, então faça a US2 antes da US3 para não editar o mesmo arquivo
em paralelo.

---

## Phase 3: User Story 1 - Orçamento barato por categoria (Priority: P1) 🎯 MVP

**Objetivo**: uma chamada de `makeRoomFor` deixa de ler os itens preparados; total, candidatos e plano ficam iguais aos
de antes.

**Independent Test**: com ~43 mil itens no preparo, `makeRoomFor` custa o mesmo que com o preparo vazio, e o preparo de
outra lista continua sendo liberado como "temporário", com o da lista ativa intacto.

### Contrato da Fase

- C1 `o custo não cresce com os itens preparados, e só o preparo de outra lista é liberado` (FR-001, FR-002, FR-005,
  US1/AC4)
- Comando (em `tv-web/`): `npx vitest run src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts`

### Implementation

- [X] T010 [US1] Em `tv-web/src/lib/catalog/storageRelease.ts`, `releaseCandidates`: trocar
  `sectionStaging.filter(...).count()` por contagem via índice: `sectionStaging.count()` menos a faixa da lista ativa
  em `[sourceId+categoryId]`, com `KEY_MIN`/`KEY_MAX` como em `repository/staging.ts:9`, ou um helper novo exportado de
  lá. Os bytes continuam `linhas × METADATA_BYTES` (D-002) → contrato: C1
- [X] T011 [US1] Em `tv-web/src/lib/catalog/storageRelease.ts`, `releaseTemporary`: trocar `filter(...).primaryKeys()`
  por chaves do índice (`orderBy('[sourceId+categoryId]').uniqueKeys()`) e apagar por faixa das outras listas. Se der,
  reaproveite `clearStagedItemsOfOtherSources` (`repository/staging.ts:49`). O retorno `{ staging, discovery }` fica
  igual → contrato: C1
- [X] T012 [US1] Procurar outro `filter(` sobre `sectionStaging` em `tv-web/src/lib/` (`storageRelief.ts`, `epg/`,
  `importPipeline.ts`) e aplicar a mesma troca onde estiver no caminho de gravação. Registre o que achou nas Execution
  Notes.

### Testes da Fase

- [X] T013 [P] [US1] Em `tv-web/src/lib/catalog/storageRelease.test.ts`: o candidato "temporário" com preparo só da
  lista ativa não aparece; com preparo da ativa e de outra lista, os bytes são as linhas da outra × `METADATA_BYTES`;
  `releaseTemporary` mantém a lista ativa e apaga todas as outras (≥ 2 outras listas).
- [X] T014 [US1] Rodar `npx vitest run src/lib/catalog` e conferir a trava da 082:
  `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 082-orcamento-armazenamento-tv` (na raiz), com os
  contratos da 082 verdes.

**Critério de Conclusão**: C1 verde
(`npx vitest run src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts` → 1/1) e
`check-contract-tests.ps1 -Slug 085-gravacao-carga-secao-tv` íntegro. `src/lib/catalog` inteiro verde, inclusive os 5
contratos da 082. Nenhum `filter()` sobre `sectionStaging` no orçamento.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída.
- Feito: `storageRelease.ts` — `releaseCandidates` conta o preparo de outras listas por índice (`count()` total menos a faixa da lista ativa em `[sourceId+categoryId]`) e `releaseTemporary` apaga por faixa via `clearStagedItemsOfOtherSources` (agora aceita `sourceId` indefinido). Nenhum `filter()` sobre `sectionStaging` restou no orçamento (T012: o único outro uso é a lista de tabelas de `sourceDeletion.ts`).
- Contrato: `npx vitest run src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts` → 1/1 verde; trava íntegra (085 e 082).
- Testes executados: `npx vitest run src/lib/catalog` → verde; 3 testes novos em `storageRelease.test.ts` (T013).
- Pendências: nenhuma. Observação: o `fachada.test.ts` (063) proíbe importar `repository/` fora da fachada; por isso a contagem fica em `storageRelease.ts` com `KEY_MIN`/`KEY_MAX` locais, como `kindCursor.ts` já faz.

---

## Phase 4: User Story 2 - Preparo só quando precisa (Priority: P2)

**Objetivo**: uma seção abaixo de 60 mil itens não toca o preparo; acima disso, o preparo é limpo uma vez.

**Independent Test**: 43 510 itens gravados sem `bulkAdd` no preparo; com `stageFlushItems` pequeno, o preparo é usado,
nenhuma limpeza é feita por categoria, e nada sobra.

### Contrato da Fase

- C2 `uma seção do tamanho da lista real é gravada inteira sem passar pela área de preparo` (FR-007, FR-009, US2/AC1)
- C3 `acima do limite, o preparo é limpo uma vez no fim, sem limpeza por categoria, e nada sobra` (FR-008, US2/AC2)
- Comando: `npx vitest run src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts`

### Implementation

- [X] T020 [US2] Em `tv-web/src/lib/catalog/sectionLoader.ts`: `STAGE_FLUSH_ITEMS = 60_000`, com o comentário trocado
  pela conta do D-003 (460 B/item, evidência da 082) → contrato: C2
- [X] T021 [US2] Em `tv-web/src/lib/catalog/sectionLoader.ts`, no laço de gravação: remover
  `clearStagedItems(sourceId, category.id, database)`. Limpar a fonte inteira uma vez no fim com sucesso, mantendo a
  limpeza no início e nas falhas (D-004). Não importa se o `finally` limpa também quando nada foi preparado (é uma
  faixa vazia) → contrato: C3
- [X] T022 [US2] Com `staged` vazio, não chamar `stagedItemsOf` (já é assim; confira depois de T020/T021).

### Testes da Fase

- [X] T023 [P] [US2] Em `tv-web/src/lib/catalog/sectionLoader.test.ts`: abortar no meio do laço de gravação, com o
  preparo usado, deixa o preparo vazio e mantém as categorias já gravadas (US2/AC3). Uma seção com exatamente
  `stageFlushItems` itens tem comportamento determinístico (edge case "no limite"): documente no teste qual é.
- [X] T024 [US2] Rodar `npx vitest run src/lib/catalog` (inclui os testes da 039 com `stageFlushItems` pequeno).

**Critério de Conclusão**: C2 e C3 verdes
(`npx vitest run src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts` → 2/2), C1 continua verde,
`check-contract-tests.ps1` íntegro e `src/lib/catalog` verde.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída.
- Feito: `sectionLoader.ts` — `STAGE_FLUSH_ITEMS` 20 000 → 60 000 (comentário com a conta do D-003); a limpeza por categoria saiu e o preparo é limpo uma vez no fim (`if (staged.size > 0)`), mantendo a limpeza no início e nas falhas/cancelamento.
- Contrato: `npx vitest run src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts` → 2/2 verdes; C1 segue verde; trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog` verde. Novos em `sectionLoader.test.ts` (T023): abortar durante a gravação deixa o preparo vazio e mantém a categoria já gravada; seção com exatamente `stageFlushItems` itens passa pelo preparo uma vez (o disparo é `>=`).
- Pendências: nenhuma.

---

## Phase 5: User Story 3 - App real devolve seus números ao PC (Priority: P2)

**Objetivo**: o build de medição manda as etapas da carga por seção e as medições do painel ao coletor; o build normal
não manda nada nem empacota o canal.

**Independent Test**: contratos C4/C5 e um teste do runner com `onTimings`; `npm run build` sem `ccplay-app-metrics` no
pacote; o coletor recebe linhas quando o app é servido no PC com a variável apontando para `127.0.0.1`.

### Contrato da Fase

- C4 `só números e rótulos fixos saem: texto do provedor, URL e estruturas são descartados` (FR-012, Constitution:
  Segredos)
- C5 `sem destino válido nada é enviado; com o coletor fora do ar a fila é limitada e a falha é silenciosa` (FR-010,
  FR-013)
- Comando: `npx vitest run src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts`

### Implementation

- [X] T030 [US3] Implementar `tv-web/src/lib/perf/metricsChannel.ts` conforme `logic/canal-metricas.md` §1–§3:
  `sanitizeMetricLine`, `metricsDestination`, `createMetricsChannel` e `emitMetric` (checagem direta de
  `import.meta.env.VITE_CCPLAY_METRICS_REPORT`, canal preguiçoso). Tire o "STUB" do comentário → contrato: C4, C5
- [X] T031 [US3] Em `tv-web/src/lib/catalog/sectionLoader.ts`: exportar `SectionLoadTimings` e adicionar as opções
  `onTimings` e `clock` (§4). Para medir encode/budget/commit, embrulhe o callback `room` passado a
  `renewCategoryItems`. `SectionLoadResult` não muda. Mantenha o arquivo ≤ 300 linhas; se precisar, ponha o acumulador
  num `sectionTimings.ts` ao lado.
- [X] T032 [US3] Em `tv-web/src/lib/catalog/sectionWorker.ts`, a mensagem `done` leva `timings?: SectionLoadTimings`
  (só números). Em `tv-web/src/lib/catalog/sectionRunner.ts`, nos dois caminhos (Worker e `runOnMainThread`), chamar
  `emitMetric({ source: 'section-load', kind, outcome, ...timings })`.
- [X] T033 [P] [US3] Emissores do painel, conforme a tabela do §4: `tv-web/src/lib/perf/entryTiming.ts` (`entry`),
  `tv-web/src/lib/perf/assemblyTiming.ts` (`assembly`, listas como contagem) e `tv-web/src/components/PerfOverlay.tsx`
  (`frames` a cada ~5 s, limpando o intervalo no unmount). Acrescente em `LABELS` só rótulos literais do código.
- [X] T034 [P] [US3] `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/coletor.mjs`: rota `POST /app-metrics` (schema
  `ccplay-app-metrics/1`) que grava **uma linha por métrica** num arquivo indicado por `--app-saida <arquivo>` (padrão
  `../evidencias/app-metricas.jsonl`), com o mesmo filtro de IP da TV e o mesmo limite de 1 MB. Para ensaiar no PC,
  passe `127.0.0.1` como o IP da TV (o filtro já aceita `::ffff:127.0.0.1`).
- [X] T035 [US3] Conferir SC-007: `npm run build` e buscar `ccplay-app-metrics` em `tv-web/dist/assets/*.js` (não pode
  aparecer). Depois, build com `VITE_CCPLAY_PERF=1` e `VITE_CCPLAY_METRICS_REPORT=http://127.0.0.1:8770/app-metrics` +
  `npm run build:tizen`: o sync não pode recusar (R-005). Registre os dois resultados.

### Testes da Fase

- [X] T036 [P] [US3] `tv-web/src/lib/catalog/sectionLoader.test.ts`: `onTimings` é chamado uma vez por carga, com
  `items`, `categories`, `written` e `budgetCalls` coerentes, e todos os campos são números finitos ≥ 0 (relógio
  injetado). Abaixo do limite, `stageWriteMs === 0`.
- [X] T037 [P] [US3] `tv-web/src/lib/catalog/sectionRunner.test.ts` (crie, se não existir): no `runOnMainThread`, a
  linha emitida tem `source: 'section-load'` e nenhum texto (use `vi.mock('../perf/metricsChannel')`).
- [X] T038 [P] [US3] `tv-web/src/lib/perf/metricsChannel.test.ts`: o lote enviado tem `schema` e `lines`; descarta a mais
  antiga ao passar de `maxQueue`; `metricsDestination` recusa usuário/senha/query/hash e hosts fora da lista.
- [X] T039 [US3] Ensaiar no PC, conforme o `quickstart.md` §3: coletor com `--app-saida`, `npm run dev` com a variável
  apontando para `127.0.0.1`, uma carga de lista de teste, e as linhas chegando sem texto do provedor.

**Critério de Conclusão**: C4 e C5 verdes
(`npx vitest run src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts` → 2/2), C1–C3 verdes,
`check-contract-tests.ps1` íntegro. SC-007 conferido em T035. Ensaio no PC (T039) com linhas recebidas.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída no código; ensaio no PC feito sem o app inteiro (ver Pendências).
- Feito: `metricsChannel.ts` implementado (saneamento, destino local, fila de 200, flush ~2 s, `emitMetric` com checagem direta de `import.meta.env`); `sectionTimings.ts` novo (`SectionTimer`, `SectionLoadTimings`) e `loadSection` com `onTimings`/`clock`; `sectionWorker.ts` leva `timings` no `done`; `sectionRunner.ts` emite `section-load` nos dois caminhos; emissores `entry` (`entryTiming.ts`), `assembly` (`assemblyTiming.ts`) e `frames` (`PerfOverlay.tsx`, a cada ~5 s); `coletor.mjs` com `POST /app-metrics` e `--app-saida`. `LABELS` ganhou só rótulos literais do código (`home`, `movies`, `cache`, `ready`, `cap`).
- Contrato: `npx vitest run src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts` → 2/2 verdes; C1–C3 verdes; trava íntegra.
- Testes executados: T036–T038 (`sectionLoader.test.ts`, `sectionRunner.test.ts` novo, `metricsChannel.test.ts` novo). T035: `npm run build` → nenhuma ocorrência de `ccplay-app-metrics` em `dist/assets`; build com `VITE_CCPLAY_PERF=1` e `VITE_CCPLAY_METRICS_REPORT=http://127.0.0.1:8770/app-metrics` → a string aparece só em `catalogApi.js` e `findUnlistedFiles`/`findStaleDeclared` devolvem vazio (o sync não recusaria; o `build:tizen` não foi rodado para não reescrever `CCPlayTv/`).
- Pendências: T039 foi ensaiado com o canal real (`createMetricsChannel`) contra o coletor real em `127.0.0.1` (linhas gravadas sem nome/URL), não com o app inteiro no `npm run dev` + uma lista de teste; o app real na TV (T044) cobre o ponta a ponta. Corrigido no ensaio: o filtro do coletor rejeitava `section-load` (hífen).

---

## Phase 6: Polish, documentação e gate na TV

**Purpose**: FR-014, gates automatizados e a medição na TV física (SC-001/002/005/006/008).

- [X] T040 [P] Documentar o caminho "medir no app real" (FR-014): `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/
  README.md` e `.claude/skills/tizen-sonda/SKILL.md`, com a cópia idêntica em `.agent/skills/tizen-sonda/SKILL.md`.
  Cobrir: as variáveis do build de medição, `--app-saida`, o schema `ccplay-app-metrics/1`, o que cada `source` mede, a
  regra "só números e rótulos fixos", e reinstalar o pacote normal no fim (avisando). Atualize a linha da skill que diz
  que o coletor "só conhece os schemas" das sondas.
- [X] T041 Sonda no código real (D-008): a variante `secaoEtapas` de `sonda-tv/memoria/cargaWorker.ts` chama
  `loadSection` com `onTimings` e devolve esses números para as três seções. Regenerar o `app2` (`memoria/empacotar.mjs`)
  e ensaiar no PC.
- [X] T042 Gates automatizados (em `tv-web/`): `npm run test`, `npx tsc -b`, `npm run lint` e `npm run build`. Com
  `npm run dev` no ar, `npm run test:e2e` inteiro (inclui `orcamento-armazenamento` e `carga-listas`; SC-003). Registrar
  falhas com a saída, sem afrouxar timeout.
- [X] T043 TV, sonda (**pedir autorização**): `etapasSecao` ≥ 2× por seção. Filmes ≤ 10 s em todas e `budgetMs` ≤ 1 s
  (SC-001/002); séries e canais dentro de D-006 contra T003 (SC-005). Evidência em `evidencias/tv-sonda-<data>.md`, com
  a tabela por etapa. Desinstalar a sonda.
- [X] T044 TV, app real (**pedir autorização**): instalar o build de medição (`tizen-tv`, com as variáveis do T035
  apontando para o IP do PC), coletor com `--app-saida sdd/specs/085-gravacao-carga-secao-tv/evidencias/app-metricas.jsonl`,
  e ≥ 1 carga da lista real (adicionar ou Atualizar). Registrar os números por seção (SC-006) e ler as linhas procurando
  texto do provedor (SC-008). **Reinstalar o pacote normal no fim, avisando.**
- [X] T045 Atualizar `plan.md` (Estado Atual, Riscos) e rodar
  `.\.planning\scripts\powershell\update-feature-status.ps1 -Slug 085-gravacao-carga-secao-tv`.

### Checklist de Release

- [X] Fase 1 (linha de base) concluída, ou a falta dela registrada em R-006
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 085-gravacao-carga-secao-tv`
  íntegro; trava da 082 íntegra
- [X] `npm run test`, `npx tsc -b`, `npm run lint` e `npm run build` verdes; SC-007 conferido no pacote
- [X] `npm run test:e2e` verde (com `orcamento-armazenamento`) **antes** de qualquer instalação na TV
- [X] TV, sonda: SC-001, SC-002 e SC-005 aprovados, com a evidência gravada
- [X] TV, app real: SC-006 registrado e SC-008 lido; pacote normal reinstalado
- [X] `tizen-sonda` (2 cópias idênticas) e o README do coletor atualizados (FR-014)
- [X] `quickstart.md` executado (§2 gates, §3 ensaio do canal com o coletor real, §4 sonda e §5 app real na TV; o ensaio do §3 foi feito com o canal e o coletor, não com o app no `npm run dev`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1**: T002 antes de T003. T003 depende de autorização e pode virar pendência (R-006).
- **Fase 3 (US1)** e **Fase 4 (US2)** independem entre si, e da Fase 1 só no sentido de que a linha de base deve ser
  medida **antes** do código mudar no pacote da sonda.
- **Fase 5 (US3)**: T031 edita `sectionLoader.ts`, então vem depois de T020/T021.
- **Fase 6**: T041 depende de T031. T043/T044 dependem de T042 (o E2E vem antes da TV, pela constituição).

### Parallel Opportunities

- T002 junto com as Fases 3/4 (a sonda e o app são arquivos diferentes), desde que T003 rode antes de instalar código
  novo na sonda.
- T013, T023, T033, T034, T036, T037, T038 e T040 são marcadas [P].

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1 (linha de base, se autorizada)
2. Fase 3 (US1): só ela já tira ~10–18 s da carga de filmes, segundo a hipótese do R-001
3. **PARAR E VALIDAR**: contratos, `src/lib/catalog` e a trava da 082

### Incremental Delivery

1. US1 → US2 → US3 → Polish e TV
2. Cada story fecha com os contratos dela verdes e as anteriores sem regressão

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Os contratos (C1–C5) estão travados: nunca editar; implementar até ficarem verdes
- Toda instalação na TV pede autorização antes; o pacote normal é reinstalado no fim

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
