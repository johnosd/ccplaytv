# Implementation Plan: Gravação da carga por seção mais rápida na TV

**Slug**: `085-gravacao-carga-secao-tv` | **Date**: 2026-10-20 | **Spec**: `sdd/specs/085-gravacao-carga-secao-tv/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Na TV, a carga da seção de filmes da lista real (43 510 itens, 35 categorias) leva 21–33 s. O orçamento da 082 responde
por 10,7–18,0 s e a área de preparo por 2,7–5,0 s. A medição do `sdd-plan` (`fake-indexeddb`, 35 categorias, ~43 mil
itens preparados) achou a causa do orçamento: `catalogLedger` custa 1,7 ms. Quem custa 100,7 ms por chamada é uma linha
de `releaseCandidates`, `sectionStaging.filter(...).count()` (`storageRelease.ts:38`), que desserializa todos os itens
preparados para contar linhas. A abordagem fica assim:

1. **US1 (P1)**: contar e liberar o preparo só por chave do índice `[sourceId+categoryId]`, sem conta guardada entre
   chamadas. O orçamento continua recalculando do zero a cada categoria, e o teto da 082 continua idêntico.
2. **US2 (P2)**: subir o ponto de descarga do preparo de 20 mil para 60 mil itens, de modo que a seção da lista real
   nunca passe por ele, e limpar o preparo uma vez no fim, não mais por categoria.
3. **US3 (P2)**: canal genérico de métricas, só no build de medição, que manda números ao coletor da `tizen-sonda`. Os
   emissores são as etapas da carga por seção e o que o `PerfOverlay` já mede.

O gate é na TV física: a sonda `etapasSecao` mede ≤ 10 s e orçamento ≤ 1 s em ≥ 2 medições, e o build de medição do app
real faz ≥ 1 carga com os números chegando ao coletor.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Vite 8 (`tv-web/`). Build com alvo `chrome108`; a TV de referência é
Tizen 9 / Chromium 120.

**Primary Dependencies**: Dexie 4.4 (IndexedDB) e `fake-indexeddb` 6 nos testes `node`. Não entra dependência nova.

**Storage**: IndexedDB `CatalogDb` (`tv-web/src/lib/catalog/db.ts`). As tabelas tocadas são `sectionStaging` (`++id,
[sourceId+categoryId]`), `discoveryCache`, `categories` e `categoryBlocks`. **Não há mudança de esquema nem migração.**

**Testing**: Vitest em dois projetos (`dom` para `*.test.tsx`, `node` para `*.test.ts`) e o E2E Playwright
(`tv-web/e2e/run.mjs`), com `orcamento-armazenamento`, `carga-listas` e `carga-listas-real`. Para medir na TV há a sonda
`sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/` (`app2`, teste `etapasSecao`, Worker
`memoria/cargaWorker.ts`) e o coletor `coletor.mjs`.

**Target Platform**: Samsung QN50Q60DAGXZD (Tizen 9.0 / Chromium 120, origem `file://`). A carga por seção roda num
Web Worker (`sectionWorker.ts`) e cai para a thread da interface quando o Worker falha (`sectionRunner.ts`).

**Performance Goals**: seção de filmes da lista real ≤ 10 s na sonda (SC-001), orçamento ≤ 1 s somado (SC-002), e séries
e canais sem regressão (SC-005, tolerância D-006).

**Constraints**: cota de 80 MiB fixa, teto da 082 = cota − reserva; heap de Worker ~460 B por item descomprimido
(evidência da 082, `sonda2-capacidades-tv-2026-10-18.md`), com `jsHeapSizeLimit` de 364 MB; nada de texto do provedor
fora do aparelho; arquivo de produção ≤ 300 linhas (ratchet `scripts/architecture.mjs`); `sectionLoader.ts` tem 210.

**Scale/Scope**: listas reais de até ~45 mil itens por seção, e o caso extremo de 300 mil (039, FR-013).

## Decisões Invariantes

- **D-001 — Orçamento sem conta guardada.** `makeRoomFor` continua recalculando `catalogLedger` e `releaseCandidates` do
  zero a cada chamada. Não se cria livro-razão por carga, versão, contador, `storagemutated` nem cache global. A decisão
  é do usuário, de 2026-10-20 (Clarifications da spec).
- **D-002 — O preparo é contado e liberado só por chave.** Em `storageRelease.ts`, o candidato "temporário" conta as
  linhas de preparo de **outras** listas com `count()` por índice (total menos a faixa da lista ativa em
  `[sourceId+categoryId]`), e `releaseTemporary` acha as chaves das outras listas com `orderBy('[sourceId+categoryId]')
  .uniqueKeys()` (padrão de `clearStagedItemsOfOtherSources`) e apaga por faixa. Nunca `filter()` em `sectionStaging`.
  O tamanho do candidato continua `linhas × METADATA_BYTES`, idêntico ao de hoje.
- **D-003 — Limite do preparo em 60 mil itens.** `STAGE_FLUSH_ITEMS` passa de `20_000` para `60_000`. Uma seção com
  menos itens que isso nunca passa pelo preparo. Acima, ele descarrega a cada 60 mil, e o pico fica em ~60 mil itens
  mais a maior categoria (~28 MB a 460 B/item), não a seção inteira (FR-013 da 039). O mecanismo de hoje fica igual: só
  o número muda.
- **D-004 — O preparo é limpo uma vez.** Sai `clearStagedItems(sourceId, category.id)` por categoria. A limpeza da fonte
  inteira acontece no início (sobra de carga interrompida, como hoje), no fim com sucesso e em qualquer falha ou aborto.
  Pode até entrar num `finally`, desde que o comportamento observável seja este.
- **D-005 — Tempos pela opção `onTimings`, não pelo retorno.** `loadSection` ganha `onTimings?: (t:
  SectionLoadTimings) => void` e `clock?: () => number` (`logic/canal-metricas.md` §4). `SectionLoadResult` não muda,
  porque os testes existentes usam `toEqual({ outcome, written })`. O Worker manda `timings` na mensagem `done`, e a
  emissão acontece na thread da interface (`sectionRunner.ts`).
- **D-006 — Tolerância de "sem regressão" (SC-005).** Para séries e canais, a medição mais lenta depois da mudança DEVE
  ficar ≤ 110 % da medição mais lenta antes, com ≥ 2 medições de cada lado, na mesma sonda e no mesmo dia, quando
  possível.
- **D-007 — Canal só no build de medição, sem chunk novo.** Import estático e checagem direta de
  `import.meta.env.VITE_CCPLAY_METRICS_REPORT` (`logic/canal-metricas.md` §1). O destino só pode ser local, em
  `/app-metrics`. O coletor da `tizen-sonda` ganha essa rota e grava em arquivo próprio.
- **D-008 — A sonda mede o código real.** A variante `secaoEtapas` de `sonda-tv/memoria/cargaWorker.ts` deixa de
  reproduzir a sequência à mão: chama `loadSection` com `onTimings` e devolve esses números. Isso vale depois da
  mudança. A linha de base de séries e canais é medida antes, com a variante atual parametrizada por seção (T003).

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Nada de conta. |
| Segredos Fora dos Clientes e dos Logs | Atenção | ✅ | O canal de métricas manda dados para fora do aparelho. Só números e rótulos fixos (FR-012, `sanitizeMetricLine`, contrato C4); destino só local; desligado no build normal (SC-007). O coletor só aceita o IP da TV. |
| Categorias da Fonte São Preservadas | ✅ | ✅ | Mesmos itens, ordem e contagens (FR-009, contrato C2, `sectionLoader.test.ts`). |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | ✅ | ✅ | O canal é opcional e não bloqueia nada: coletor fora do ar = descarte silencioso (FR-013, C5). |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho por Controle Remoto | N/A | N/A | Sem UI nova. |
| Lista de Catálogo Nunca É Manifesto de Streaming | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | N/A | N/A | Sem UI nova; o `PerfOverlay` continua não focável. |
| Voltar Restaura Foco e Posição | N/A | N/A | — |
| Identidade de Reprodução Não Depende da URL | ✅ | ✅ | Os ids dos itens vêm do mesmo `toItemRecord`/`blockItemId`, e o caminho de gravação não muda. |
| Progresso e Capacidades São Reais | ✅ | ✅ | Os tempos medidos são reais e saem do código real (D-008). Nenhum número inventado. |
| Documentação do Repositório É Canônica | ✅ | ✅ | `tizen-sonda` (2 cópias) e o README do coletor são atualizados (FR-014); a spec foi emendada com a decisão de 2026-10-20. |
| Fluxo: testes por task, E2E antes da TV | ✅ | ✅ | Vitest a cada task. `npm run test:e2e` (com `orcamento-armazenamento` e `carga-listas`) antes de qualquer instalação. |
| Restrição: validação em hardware real | Elevada | Elevada | A spec torna a TV gate (SC-001/002/005/006), o que a exceção da constituição permite. Fechar sem a TV exige decisão explícita do usuário, registrada em Riscos. |

Sem violação, então não há Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/085-gravacao-carga-secao-tv/
├── spec.md
├── plan.md
├── logic/canal-metricas.md     # canal de métricas: ligação, saneamento, fila, emissores, SectionLoadTimings
├── quickstart.md
├── tasks.md
├── handoff.md
├── contract-tests.lock
└── evidencias/                 # criada pelo execute (linhas da sonda e do app real, notas)
```

### Source Code (repository root)

```text
tv-web/src/lib/catalog/
├── storageRelease.ts            # US1: contagem/liberação do preparo por chave (D-002)
├── storageBudget.ts             # sem mudança de lógica (D-001)
├── storageLedger.ts             # sem mudança
├── sectionLoader.ts             # US2: STAGE_FLUSH_ITEMS 60k, limpeza única; US3: onTimings/clock
├── sectionWorker.ts             # US3: `done` leva `timings`
├── sectionRunner.ts             # US3: emite `section-load` (Worker e thread da interface)
├── repository/staging.ts        # sem mudança de API (o contrato 063 lista os exports)
└── *.gravacao-carga-secao.contract.test.ts   # contratos travados (2 arquivos)
tv-web/src/lib/perf/
├── metricsChannel.ts            # US3: stub → canal (logic/canal-metricas.md)
├── metricsChannel.gravacao-carga-secao.contract.test.ts
├── entryTiming.ts               # US3: emissor `entry`
└── assemblyTiming.ts            # US3: emissor `assembly`
tv-web/src/components/PerfOverlay.tsx   # US3: emissor `frames`
sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/
├── coletor.mjs                  # US3: rota POST /app-metrics
├── memoria/cargaWorker.ts       # T002/T020: variante secaoEtapas por seção → loadSection + onTimings
├── memoria/gerar-vod-bruto.mjs  # T002: brutos de séries e canais também
└── README.md                    # FR-014
.claude/skills/tizen-sonda/SKILL.md + .agent/skills/tizen-sonda/SKILL.md   # FR-014 (idênticas)
```

**Structure Decision**: tudo em `tv-web/src/lib/` (catálogo e perf) e na sonda/coletor da 082. Não há mudança em `api/`,
`portal-web/` nem `CCPlayTv/` além do sync normal do build.

## Complexity Tracking

Sem violações.

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso). A TV é gate desta feature (SC-001/002/005/006).

Comandos-base (em `tv-web/`):

```powershell
npx vitest run src/lib/catalog src/lib/perf      # área tocada
npm run test                                      # suíte inteira (dom + node)
npx tsc -b
npm run lint                                      # oxlint + ratchet de arquitetura
npm run build                                     # e conferir SC-007: Select-String -Path dist\assets\*.js -Pattern 'ccplay-app-metrics' → vazio
npm run test:e2e -- --only orcamento-armazenamento,carga-listas   # com `npm run dev` no ar (use Bash: o PowerShell perde o --)
npm run test:e2e                                  # gate antes da TV
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
`tv-web/src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts` (1),
`tv-web/src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts` (2),
`tv-web/src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts` (2).

Comando (em `tv-web/`):
`npx vitest run src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts`

Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 085-gravacao-carga-secao-tv`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| C1 `o custo não cresce com os itens preparados, e só o preparo de outra lista é liberado` | FR-001, FR-002, FR-005, US1/AC4 | 3 | `expected 107.9… to be less than 16.0…` (100 ms com preparo contra 1–2 ms sem) |
| C2 `uma seção do tamanho da lista real é gravada inteira sem passar pela área de preparo` | FR-007, FR-009, US2/AC1 | 4 | `expected "Mock" to not be called at all, but actually been called 2 times` (`bulkAdd`) |
| C3 `acima do limite, o preparo é limpo uma vez no fim, sem limpeza por categoria, e nada sobra` | FR-008, US2/AC2 | 4 | `expected [ [ 'fonte-085', 1, …(1) ], …(2) ] to deeply equal []` |
| C4 `só números e rótulos fixos saem: texto do provedor, URL e estruturas são descartados` | FR-012, Constitution: Segredos | 5 | `Error: not implemented` |
| C5 `sem destino válido nada é enviado; com o coletor fora do ar a fila é limitada e a falha é silenciosa` | FR-010, FR-013 | 5 | `Error: not implemented` |

C1 compara tempos de forma relativa (`staged < empty × 3 + 10 ms`), e a margem do vermelho é de ~50×. C2 usa 43 510
itens e leva ~3,5 s no PC antes da mudança, perto do timeout padrão de 5 s. Depois da mudança fica mais rápido, porque
deixa de usar o preparo.

Stubs criados pelo plan (ponto de partida do execute, não travados): `tv-web/src/lib/perf/metricsChannel.ts`.

Fora do contrato e no `quickstart.md`: tempos na TV (SC-001/002/005), app real com o coletor (SC-006), ausência no
pacote (SC-007, checado no build) e leitura da evidência (SC-008).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| US1 (orçamento por chave) | Feita: C1 verde; `storageRelease.ts` sem `filter()` sobre o preparo |
| US2 (preparo só quando precisa) | Feita: limite 60 000, limpeza única no fim; C2/C3 verdes |
| US3 (canal de métricas) | Feita no código: C4/C5 verdes, emissores, coletor `/app-metrics`; SC-007 conferido no build |
| Sonda | Parametrizada por seção; ensaiada no PC; pacote da linha de base montado em worktree do código anterior |
| Gates automatizados | `npm run test` 3659 verdes, `tsc`, lint e build ok; E2E 51/54 e os 3 que falharam passaram isolados |
| TV, sonda (T003, T043) | Feita: filmes 8,8 s (SC-001 ok), séries/canais sem regressão (SC-005 ok), orçamento de filmes 1,02 s (SC-002 ~2 % acima da meta, R-009) |
| TV, app real (T044) | Feita: 63 linhas recebidas, sem texto do provedor (SC-006/SC-008 ok); filmes 11,7 s com orçamento ~1,8 s/chamada (R-010). Pacote normal reinstalado |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | A medição do PC (`fake-indexeddb`) atribui o custo do orçamento ao `filter` do preparo. Na TV pode haver outra parcela (por exemplo, `categories.toArray` com várias listas) | SC-002 pode não fechar só com a US1 | SC-002 é medido na TV com a sonda. Se o orçamento passar de 1 s, o `budgetMs` por chamada em `onTimings` mostra onde, e uma nova decisão é aberta antes de qualquer conta guardada (D-001 só muda com o usuário). |
| R-002 | Com o limite em 60 mil, o pico de memória do Worker sobe de ~20 mil itens + maior categoria para a seção inteira (até 60 mil) | Worker morto pela TV em lista grande | Resolvido: o Worker aguentou 43 510 itens na sonda e no app real (TV de 364 MB de heap), sem ser encerrado. (Antes: A conta é ~460 B/item → ~28 MB, contra 364 MB de `jsHeapSizeLimit`. A sonda na TV roda a lista real (43 510). Se cair, baixar o limite e registrar aqui.) |
| R-003 | Com a limpeza única no fim, o preparo das categorias já gravadas fica no disco até o fim da carga (> 60 mil itens) | Pico de disco um pouco maior na lista enorme; o preparo da lista ativa não entra no teto | Resolvido: o preparo não é usado na lista real (43 510 < 60 000); o caminho acima do limite é coberto por C3 e pelos testes da 039. (Antes: Só listas acima de 60 mil itens usam o preparo. O caminho de quota (`StorageFullError` → `storage_full`) continua. O caso real (43 510) não passa pelo preparo.) |
| R-004 | A variação entre rodadas (22 → 33 s) pode fazer a rodada mais lenta passar de 10 s | SC-001 exige todas ≤ 10 s | Resolvido: nas duas rodadas do dia a carga de filmes ficou estável (8 856 e 8 785 ms), sem a variação de 22 → 33 s. (Antes: O orçamento era o que subia junto. Se a variação persistir sem ele, registrar os números e investigar pela ideia `[Medição]` do backlog (FR-015, já registrada).) |
| R-005 | O build de medição pode emitir um arquivo a mais e quebrar `sync-tizen.mjs` | O pacote de medição não é gerado | Resolvido: o build de medição passou na guarda do sync (T035) e foi instalado na TV. (Antes: D-007: import estático, sem `import()`. Conferir com `npm run build:tizen` usando as variáveis do build de medição.) |
| R-007 | E2E completo com 3 falhas (`vitrine-filmes-series`, `carrosseis-filmes-series`, `home-vitrine-expandida`), todas com `UNKNOWN: unknown error, open …png` ao gravar a captura de tela (erro de arquivo no Windows sob 6 scripts em paralelo) | Gate E2E | Resolvido: os 3 scripts passaram em série; era erro de arquivo no Windows sob paralelismo. (Antes: Reexecutadas em série (`--jobs 1`): 3/3 passam. Flake de ambiente, explicado; nenhum script tocou a área da 085.) |
| R-008 | 2026-10-20: a sonda de linha de base (`etapasSecao`, 3 seções) foi instalada 2× e não mandou relatório algum em ~15 min (a TV chegou a abrir conexão com o coletor); no PC o mesmo pacote roda completo. Causa não confirmada (suspeita: a TV encerrou o app ou entrou em standby; sem ver a tela não deu para saber). A sonda foi dividida em `etapasCanais`, `etapasSeries` e `etapasFilmes` (um relatório e um Worker por seção), reinstalada, e o usuário avisou que ficou sem acesso à TV: sonda desinstalada, `applist` só com o CCPlayTV | T003/T043 sem números | Resolvido: com a TV acordada e o usuário presente a sonda reportou nas três seções. (Antes: Retomar com alguém olhando a TV, com `-Only etapasCanais,etapasSeries,etapasFilmes`. Se as seções pequenas reportarem e a de filmes não, a suspeita é memória do Worker (R-002).) |
| R-009 | 2026-10-20, TV (T043): filmes `loadSection` 8,86/8,79 s (SC-001 ok, antes 22,6/21,9 s); séries e canais iguais à linha de base (SC-005 ok); **orçamento de filmes 1 019/1 016 ms contra a meta de ≤ 1 000 ms (SC-002 não atingido por ~2 %)**. Evidência: `evidencias/linha-de-base-tv.md` e `evidencias/tv-sonda-2026-10-20.md` | SC-002 formalmente aberto | Resolvido: o usuário aceitou o desvio de ~19 ms em 2026-10-20. (Antes: Decisão do usuário: aceitar o desvio de ~19 ms com a justificativa (a carga caiu 2,5× e o orçamento 10×), ou abrir ajuste no que resta de `makeRoomFor` (~29 ms/chamada). Não afrouxar o critério sem essa decisão. **Decisão do usuário (2026-10-20): aceita o desvio de ~19 ms (SC-002 fechado como "aceito com desvio"), sem novo ajuste.**) |
| R-010 | 2026-10-20, app real na TV (T044): filmes 11,7 s (43 546 itens), séries 5,0 s, canais 2,6 s numa **Atualizar** da lista real. O orçamento custou ~1,8 s **por chamada** no app real (3,7 s em 2 chamadas de filmes; 1,7 s em 1 de séries) contra ~29 ms na sonda: o custo do `makeRoomFor` cresce com o catálogo real (R-001). SC-006 (registro) e SC-008 atendidos. Evidência: `evidencias/tv-app-real-2026-10-20.md` | Na lista real o orçamento ainda pesa e a carga de filmes passa de 10 s | O usuário aceitou SC-002 só com a medição da sonda. Reduzir o orçamento no app real exigiria atacar o resto do `makeRoomFor` (ledger/candidatos) ou mudar D-001: ideia para outra feature, com medição por etapa já disponível no canal. Registrada no backlog. |
| R-006 | A TV é gate (SC-001/002/005/006) e cada instalação precisa de autorização do usuário | A feature pode ficar parada esperando a TV | Resolvido: as medições na TV foram feitas com autorização (T003, T043, T044). (Antes: Pedir uma autorização por instalação (memória do usuário). Fechar sem a TV só por decisão explícita do usuário, registrada aqui.) |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-20 | Fases 1 (T001/T002), 3, 4, 5 e T040–T042 | Código das 3 stories, sonda por seção, coletor, docs; gates automatizados verdes | T003, T043, T044 (TV) esperam autorização |

**PRÓXIMO**: `sdd-converge` da feature 085.

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/catalog/{storageRelease,sectionLoader,sectionTimings,sectionRunner,sectionWorker}.ts`
- `tv-web/src/lib/perf/{metricsChannel,entryTiming,assemblyTiming}.ts`, `tv-web/src/components/PerfOverlay.tsx`
- `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/{coletor.mjs,memoria/cargaWorker.ts,memoria/gerar-vod-bruto.mjs,app2/memoria.js}`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- `repository/fachada.test.ts` (063) proíbe importar `repository/` fora da fachada: a contagem do preparo mora em `storageRelease.ts`.
- O ensaio da sonda no PC com o coletor grava em `evidencias/sonda-tv2.jsonl` (rastreado): reverta com `git checkout` depois.
- Linha de base na TV: `git worktree add --detach %TEMP%\base085 5605148`, sobrepor os 4 arquivos da sonda, `node_modules` por junção, `empacotar.mjs`; remover a junção (`rmdir`) antes de `git worktree remove`.

## Resultado Final

Convergida em 2026-10-20, sem achado acionável (C-01 e C-02, ambos LOW, abaixo).

**O que foi construído**

- **US1**: `storageRelease.ts` conta (`count()` total menos a faixa da lista ativa em `[sourceId+categoryId]`) e libera o preparo de outras listas só por chave de índice (`clearStagedItemsOfOtherSources`); nenhum `filter()` sobre `sectionStaging` no orçamento. O orçamento continua refeito do zero a cada chamada (D-001), sem conta guardada.
- **US2**: `STAGE_FLUSH_ITEMS` 20 000 → 60 000; a limpeza por categoria saiu e o preparo é limpo uma vez no fim (mantida no início e nas falhas). A lista real (43 510) nunca passa pelo preparo.
- **US3**: `lib/perf/metricsChannel.ts` (só no build de medição, sem `import()`), `SectionTimer`/`onTimings` no `loadSection`, emissores `section-load`, `entry`, `assembly` e `frames`, rota `POST /app-metrics` e `--app-saida` no coletor, sonda por seção (filmes, séries, canais) e documentação na `tizen-sonda` e no README da sonda.

**Resultado na TV (2026-10-20)**

- Sonda, filmes: `loadSection` 22,6 / 21,9 s → 8,86 / 8,79 s (SC-001 ok); orçamento 10,6 s → ~1,02 s (SC-002 **aceito com desvio de ~19 ms**, R-009). Séries e canais sem regressão (SC-005).
- App real (T044, uma rodada, registro): filmes 11,7 s, séries 5,0 s, canais 2,6 s; 63 linhas no coletor, nenhuma com texto do provedor (SC-006, SC-008). O orçamento custou ~1,8 s por chamada na lista real (R-010).

**Desvios do plano**

- A contagem do preparo mora em `storageRelease.ts` com `KEY_MIN`/`KEY_MAX` locais, porque o teste da fachada (063) proíbe importar `repository/` fora da fachada.
- `clearStagedItemsOfOtherSources` passou a aceitar `sourceId` indefinido.
- A sonda ganhou os testes `etapasCanais`, `etapasSeries` e `etapasFilmes` (um relatório e um Worker por seção) depois que a primeira instalação, com a TV sem ninguém olhando, não reportou nada (R-008). A linha de base foi medida com o código anterior num worktree.
- T039 (ensaio do canal) foi feito com o canal e o coletor reais em `127.0.0.1`, e o ponta a ponta foi coberto pelo T044 na TV.
- FR-002 da spec cita uma "exceção" no tamanho do candidato temporário que a implementação não precisou (D-002 mantém o tamanho idêntico); o texto não foi reescrito.

**Em aberto (fora do escopo)**: o orçamento ainda custa ~1,8 s por chamada no app real (R-010; ideia `[Perf]` no backlog).
