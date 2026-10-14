**Contexto**

Feature 065 revalidada no ccplayTv, branch `feature/designWave2`, base `e0ec6ef`. Stack: React/TypeScript/Vite, Dexie e Tizen, client-first. Status: **Planejada**, 48 tasks em sete fases; backlog **0/61** incluindo release. Workspace inicialmente limpo; esta passada atualizou plan/tasks/quickstart/handoff. Reler esses documentos antes de executar. Próximo comando: `/sdd-execute 065-otimizacao-carga-consultas-memoria`.

**O que a feature entrega**

- US1/P1: consultas externas com prazo, compartilhamento, recuperação e cache completo.
- US2/P1: vitrines com menos CPU e atualização apenas do contexto afetado.
- US3/P2: janelas de leitura e limites de retenção, mantendo acesso integral.
- US4/P2: resumos de séries reutilizáveis e incrementais.
- US5/P3: splash por prontidão e código local por rota, mantendo splash → perfis.

Preservar conteúdo, seleção, ordem e navegação. Aceite por benchmark comparativo; TV recomendada.

**Leitura obrigatória, em ordem**

Em `sdd/specs/065-otimizacao-carga-consultas-memoria/`: `spec.md` (escopo/aceite), `plan.md` (invariantes/gates), `tasks.md` (fases), `research.md` (alternativas), `logic/consultas.md` (deadline/leases), `logic/catalogo.md` (seleção/janelas), `logic/abertura-benchmark.md` (prontidão/medição), `data-model.md` (projeções/limites), `contracts/client.md` (interfaces), `quickstart.md` (verificação). Depois, `.planning/memory/constitution.md`, na raiz. Constitution Check pré/pós: PASS.

**Testes de contrato**

Arquivos travados, relativos a tv-web/:

- `src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts`: dois casos, fase 2.
- `src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts`: um, fase 3.
- `src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts`: um, fase 3.
- `src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts`: um, fase 4.

Comando confirmado, de tv-web/:

~~~powershell
npm run test -- otimizacao-carga-consultas-memoria.contract.test.ts
~~~

Integridade, da raiz:

~~~powershell
& ./.planning/scripts/powershell/check-contract-tests.ps1 -Slug '065-otimizacao-carga-consultas-memoria' -Json
~~~

Cinco vermelhos esperados: timeout pendente, parcial promovido a válido, séries relidas por evento movie e dois `not implemented`. 73 testes existentes, tipos e lint passaram; avisos preexistentes no lint. Locks 017/018/038/039/050/052/053/056/057/060/061/063 íntegros; não editá-los.

**Stubs criados**

Sob tv-web/src/: `features/vod/ratedSelectionAsync.ts` (T015) e `lib/catalog/repository/categoryWindow.ts` (T023) lançam `not implemented`. `features/catalog/prefetchApi.ts` aceita `kind?`, ignorado até T018. Permanecem preparatórios; esta revalidação alterou documentação.

**Armadilhas já mapeadas**

Baseline antes de otimizar; runners futuros do quickstart são T002/T003. Manter categoryBlocks canônicos e medir conversão/quota/Worker. Pausa fallback: **10 minutos**. Não materializar todo AsyncIterable nem usar maxPages sem índice lógico/RETURN. T010 usa useTitleMetadata dentro de catalogApi.ts. T033 move helper puro para lib com reexport. Chunks exigem YAML/chrome108/caminhos relativos; foco nunca dispara API.

**Pendências do Analyze**

Nenhuma. A referência incorreta da T010 foi corrigida antes do Analyze; seguir para sdd-execute.

**Gate de pronto**

Contratos verdes e travas íntegras; em tv-web/: `npm run lint`, `npx tsc -b --pretty false`, `npm run test`, `npm run build`, `npm run build:tizen` e `npm run test:e2e` com dev server ativo. Cumprir quickstart e SC-001..013 com ≥7 amostras pareadas. Polish atualiza spec/plan/tasks/backlog, README e evidências. TV recomendada/pendente; navegador não comprova RAM/desempenho físico.

