# Handoff — feature 065

**Contexto**

Planejamento concluído em ccplayTv, branch `feature/designWave2`: React/TypeScript/Vite, Dexie e Tizen, client-first. Backlog: **Planejada, 0/61 checkboxes** (48 tasks e 13 itens de release), em sete fases. Próximo comando: `/sdd-execute 065-otimizacao-carga-consultas-memoria`. Antes de editar, reler alterações preexistentes de 062/063/064, especialmente catalogRepository, catalogApi, db, App, scripts de benchmark/arquitetura e locks; não revertê-las.

**O que a feature entrega**

- US1/P1: prazo, compartilhamento, recuperação e cache completo nas consultas externas.
- US2/P1: vitrines com menos CPU e atualizações restritas ao tipo afetado.
- US3/P2: leituras em janelas e retenção limitada, mantendo todo o conteúdo acessível.
- US4/P2: resumos de séries reutilizáveis e atualização apenas das séries afetadas.
- US5/P3: splash por prontidão e menos JavaScript inicial, mantendo splash → perfis.

Conteúdo, seleção, ordem e navegação permanecem. Ganhos são metas comparativas a medir; TV é recomendada. Esta sessão preparou documentação, contratos e stubs.

**Leitura obrigatória, em ordem**

Em `sdd/specs/065-otimizacao-carga-consultas-memoria/`:

1. `spec.md`: escopo/26 FR/13 SC; `plan.md`: invariantes, riscos e gates; `tasks.md`: sequência/checkpoints.
2. `research.md`: alternativas; `logic/consultas.md`: deadline/leases/pausa; `logic/catalogo.md`: seleção/janelas/delta; `logic/abertura-benchmark.md`: prontidão e medição.
3. `data-model.md`: projeções/resumos/limites; `contracts/client.md`: interfaces; `quickstart.md`: comandos e roteiro.
4. `.planning/memory/constitution.md`, na raiz: regras vinculantes. Constitution Check pré/pós: PASS.

**Testes de contrato**

Caminhos abaixo relativos a tv-web/, todos travados:

- `src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts`: 2 casos, fase 2.
- `src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts`: 1, fase 3.
- `src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts`: 1, fase 3.
- `src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts`: 1, fase 4.

De tv-web/:

~~~powershell
npm run test -- src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

Integridade, da raiz:

~~~powershell
& ./.planning/scripts/powershell/check-contract-tests.ps1 -Slug '065-otimizacao-carga-consultas-memoria' -Json
~~~

Cinco vermelhos confirmados: timeout pendente, parcial tratado como válido, séries relidas por evento movie e dois `not implemented`. Sem falhas de importação/tipo. 73 testes existentes, tipos e lint passaram; lint tem avisos preexistentes. Locks 017/018/038/039/050/052/053/056/057/060/061/063 íntegros na conclusão; não regravá-los.

**Stubs criados**

Sob tv-web/src/: `features/vod/ratedSelectionAsync.ts` e `lib/catalog/repository/categoryWindow.ts` têm assinaturas compiláveis e lançam `not implemented` (T015/T023). `features/catalog/prefetchApi.ts` aceita `kind?`, ainda ignorado até T018. Nenhuma otimização foi ligada às telas.

**Armadilhas já mapeadas**

Baseline nova vem antes das otimizações; três runs do review são exploratórios. CLI futura do quickstart será criada em T002/T003. Manter categoryBlocks canônicos: projeções são reconstruíveis, com migração/quota/Worker medidos. Fallback de pausa vigente é **10 minutos**. Não coletar todo AsyncIterable antes da seleção nem aplicar maxPages sem índice lógico/RETURN. T033 move o helper puro de séries para lib com reexport, evitando lib→features. Chunks locais exigem YAML, chrome108 e caminhos relativos; foco nunca dispara API.

**Pendências do Analyze**

A-001/LOW: T010 cita useTitleMetadata.ts inexistente; o hook está em catalogApi.ts. Usar o caminho atual ou declarar explicitamente a extração ao executar T010. Nenhum achado bloqueador; seguir para sdd-execute.

**Gate de pronto**

Contratos 5/5 verdes e locks íntegros; em tv-web/: `npm run lint`, `npx tsc -b --pretty false`, `npm run test`, `npm run build`, `npm run build:tizen` e `npm run test:e2e` com dev server ativo. Cumprir quickstart e SC-001..013 com ≥7 amostras pareadas. Polish atualiza spec/plan/tasks/backlog, README e evidências. TV recomendada/pendente não bloqueia aceite; sem medição física, não afirmar RAM/desempenho na TV.

