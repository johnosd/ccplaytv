# Handoff — 085-gravacao-carga-secao-tv

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. Stack: `tv-web/` (React 19 + TS + Vite 8, Dexie 4 / IndexedDB, Vitest
  `dom`+`node`, Playwright E2E).
- Próximo comando: `/sdd-execute 085-gravacao-carga-secao-tv`. No backlog: **Planejada**, 0/40 tasks.
- A `spec.md` foi **emendada no `sdd-plan`** em 2026-10-20 (FR-001 a FR-003, US1/AC3–AC4 e Edge Cases). Leia a versão
  em disco, não o assessment.

## O que a feature entrega

- **P1 (US1)**: o orçamento (`makeRoomFor`) deixa de ler os itens do preparo: a contagem e a liberação passam a usar só
  chaves do índice. **Não existe livro-razão por carga.** A conta continua refeita do zero a cada categoria, porque o
  usuário rejeitou a abordagem A depois da medição: ledger 1,7 ms contra `filter` do preparo 100,7 ms.
- **P2 (US2)**: `STAGE_FLUSH_ITEMS` 20 000 → 60 000, para que a seção da lista real (43 510) nunca use o preparo; acima
  disso, o preparo é limpo uma vez, no fim.
- **P2 (US3)**: canal genérico de métricas, **só no build de medição** (`VITE_CCPLAY_METRICS_REPORT`), que manda números
  ao coletor da `tizen-sonda` (rota nova `/app-metrics`). Emissores: etapas da carga por seção + `entry` + `assembly` +
  `frames` do `PerfOverlay`.
- O gate é na TV física: sonda ≤ 10 s / orçamento ≤ 1 s (filmes), séries e canais ≤ 110 % da linha de base, e ≥ 1 carga
  no app real com os números no coletor.

## Leitura obrigatória, em ordem

1. `spec.md`: escopo, FRs emendados, SCs e as duas sessões de Clarifications.
2. `plan.md`: D-001 a D-008 (as regras travadas), Constitution Check, Riscos R-001 a R-006, comandos e a tabela dos
   contratos.
3. `tasks.md`: 6 fases. A Fase 1 mede a linha de base na TV **antes** de mudar o código da sonda.
4. `logic/canal-metricas.md`: ligação só no build de medição, saneamento, fila, emissores e `SectionLoadTimings`.
5. `quickstart.md`: ensaio no PC, sonda na TV e app real na TV.
6. `.planning/memory/constitution.md`: "Segredos Fora dos Clientes e dos Logs" e o "Fluxo de Desenvolvimento" (E2E antes
   da TV).

## Testes de contrato

- `tv-web/src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts`: 1 teste (C1, Fase 3).
- `tv-web/src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts`: 2 testes (C2/C3, Fase 4).
- `tv-web/src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts`: 2 testes (C4/C5, Fase 5).
- Rodar (em `tv-web/`):
  `npx vitest run src/lib/catalog/storageBudget.gravacao-carga-secao.contract.test.ts src/lib/catalog/sectionLoader.gravacao-carga-secao.contract.test.ts src/lib/perf/metricsChannel.gravacao-carga-secao.contract.test.ts`
- Trava (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 085-gravacao-carga-secao-tv`
- Travas de outras features que esta pode quebrar: **082**
  (`storageBudget.orcamento-armazenamento.contract.test.ts`, 5 testes; confira com `-Slug 082-orcamento-armazenamento-tv`)
  e **063** (`catalogRepository.codigo-saudavel.contract.test.ts` lista os exports públicos, inclusive
  `clearStagedItems`, `stagedItemsOf`, `stageSectionItems` e `clearStagedItemsOfOtherSources`; **não remova nem
  renomeie**).

## Stubs criados

- `tv-web/src/lib/perf/metricsChannel.ts`: `METRICS_SCHEMA`, os tipos `MetricSource`/`MetricLine`/`MetricsChannel`, e
  `sanitizeMetricLine`, `metricsDestination`, `createMetricsChannel` e `emitMetric` com `throw new Error('not
  implemented')`. As assinaturas são as que os contratos usam. Ainda não é importado por ninguém.

## Armadilhas já mapeadas

- **Não devolva os tempos no `SectionLoadResult`**: `sectionLoader.test.ts` usa `toEqual({ outcome, written })` em
  vários testes. Use a opção `onTimings` (D-005).
- **C3 espia `clearStagedItems` via `vi.mock('./catalogRepository')`**: `sectionLoader.ts` precisa continuar importando
  `clearStagedItems` **da fachada `./catalogRepository`**, e não de `./repository/staging`, senão o espião não vê a
  chamada.
- **C2 espia `database.sectionStaging.bulkAdd`**: o descarregamento tem que continuar passando por `stageSectionItems`
  (que usa `bulkAdd`), não por `add`/`put`.
- **C1 mede tempo relativo**: o orçamento com ~43 mil itens no preparo tem que custar menos que 3× o custo vazio + 10 ms.
  Qualquer `filter()`, `toArray()` ou `each()` sobre `sectionStaging` no caminho de `makeRoomFor` quebra isso.
  `releaseTemporary` também não pode ler valores.
- **C2 leva ~3,5 s no PC** antes da mudança, perto do timeout padrão de 5 s. Não aumente o timeout (proibido); depois
  da mudança ele fica mais rápido.
- **O canal não pode criar chunk**: nada de `import()` dinâmico. Um arquivo a mais no build de medição faz
  `sync-tizen.mjs` recusar, porque ele não estaria em `tizen_web_project.yaml`. A checagem tem que ser direta em
  `import.meta.env.VITE_CCPLAY_METRICS_REPORT`, para o build normal não levar o canal (SC-007).
- **No PowerShell, `npm run x -- --flag` perde o `--`**: rode o E2E com `--only` pelo Bash.
- **Ratchet de 300 linhas**: `sectionLoader.ts` tem 210. Se a medição inflar o arquivo, mova o acumulador para
  `sectionTimings.ts`.
- **TV**: cada instalação (sonda ou build de medição) **pede autorização antes** (memória do usuário). Ao fim, reinstale
  o pacote normal, avisando. Nunca leia `staging.env.yaml`. As credenciais reais ficam no `.env` e nunca vão para a
  sonda, a não ser como amostra sanitizada.
- **A sonda importa o código real** por caminho relativo (`sonda-tv/memoria/*.ts` → `tv-web/src/...`) e é empacotada
  por `memoria/empacotar.mjs`. O `app2/appReal.js` gerado é ignorado pelo git.

## Pendências do Analyze

- A-01 (LOW): FR-002 da spec cita uma "exceção" para o tamanho do candidato "temporário", mas D-002 mantém o tamanho
  idêntico (`linhas × METADATA_BYTES`). Basta seguir D-002; a frase da spec pode ser corrigida no `sdd-converge`.
- A-02 (MEDIUM): C1 (tempo relativo) e C2 (~3,5 s) podem oscilar numa máquina carregada. Se falharem intermitentemente,
  rode de novo isolado antes de concluir qualquer coisa. Os contratos não podem ser editados.
- A-03 (LOW): FR-006 ("outros gravadores mantêm o comportamento") não tem task própria. A US1 acelera também a carga
  por categoria, o guia e as séries, que chamam o mesmo `makeRoomFor`, sem mudar a decisão. A cobertura vem de
  `npx vitest run src/lib/catalog` e da trava da 082.

## Gate de pronto

- Contratos 5/5 verdes, travas da 085 e da 082 íntegras.
- Em `tv-web/`: `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` (+ `ccplay-app-metrics` ausente de
  `dist/assets/*.js`) e `npm run test:e2e` com `npm run dev` no ar.
- `quickstart.md` §3 (ensaio no PC), §4 (sonda na TV) e §5 (app real na TV).
- Docs do Polish: `tizen-sonda` (as 2 cópias idênticas) e `sonda-tv/README.md` (FR-014); `plan.md`.
- **A TV física é gate** (SC-001/002/005/006, exceção da constituição). Fechar sem ela só por decisão explícita do
  usuário, registrada em R-006.
