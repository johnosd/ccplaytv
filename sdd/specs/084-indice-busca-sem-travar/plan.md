# Implementation Plan: Índice de busca sem travar a tela na TV

**Slug**: `084-indice-busca-sem-travar` | **Date**: 2026-10-20 | **Spec**: `sdd/specs/084-indice-busca-sem-travar/spec.md`

**Nota**: Este template é preenchido pelo skill `sdd-plan`; a definição do skill
descreve o fluxo de execução completo.

## Summary

Na TV, o índice de busca de um tipo inteiro é montado numa leva só na thread principal. A busca global trava ~2 s, a
ordenação de "Todos" congela ~1 s, e a pré-carga remonta o índice a cada lote de 1 s. A abordagem mantém **o mesmo
resultado** (registros, ordem, cobertura, ordens de "Todos") e muda só a execução:

1. o índice é montado em fatias que cedem a vez à interface e respeitam cancelamento;
2. a conversão para itens de tela e a ordenação de "Todos" também rodam em fatias (merge sort estável, mesma ordem);
3. durante a pré-carga, o índice com a tela aberta é remontado no máximo uma vez a cada ~10 s.

Detalhes em `logic/fatias.md`.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 (Vite 8, alvo `chrome108`; TV de referência em Chromium 120).

**Primary Dependencies**: `@tanstack/react-query` ^5.102 (consultas `global-search-index` e `catalog-search-index`;
v5 cancela a consulta que fica sem observadores quando o `queryFn` consome o `signal`); Dexie (IndexedDB);
`@tanstack/react-virtual` (grades).

**Storage**: IndexedDB, só leitura nesta feature (pedaços comprimidos da 082 via `readHeaderChunks`; linhas do formato
antigo). Nada é gravado.

**Testing**: Vitest em dois projetos (`node` para `*.test.ts`, `dom`/jsdom para `*.test.tsx`), `fake-indexeddb` no `node`
(padrão de `catalogSearch.test.ts`), fake timers para o invalidador (padrão de `prefetchApi.test.ts`); E2E por
`npm run test:e2e`; sonda na TV (`sonda-tv/`, teste `quadrosIndice`) e `PerfOverlay` no app real.

**Target Platform**: Samsung Tizen 9 (QN50Q60DAGXZD), origem `file://`. Sem `scheduler.yield`, com `MessageChannel`,
`scheduler.postTask` e `requestIdleCallback`.

**Performance Goals**: nenhum quadro > 100 ms na TV durante a montagem do índice, a ordenação de "Todos" e a remontagem
na pré-carga (≥ 50 fps); busca global pronta em ≤ ~3,2 s com a lista real (linha de base 2,1–2,3 s).

**Constraints**:
- O ratchet de arquitetura (`npm run lint`) trava o tamanho de `catalogApi.ts` (2 184 de 2 187 linhas),
  `VodCategoryScreen.tsx` (949 de 949) e `SearchScreen.tsx` (345 de 345). A lógica nova vai para arquivos novos.
- Regra da 082: ler bloco `format === 2` só por `readHeaderChunks`/`readBlockChunks`, nunca `block.items`.
- Regra da 066: categorias escondidas e bloqueadas fora de todo leitor.

**Scale/Scope**: lista real ~55 mil itens (43 510 filmes, 9 768 séries, 2 355 canais); até ~100 mil sem meta própria de
tempo.

## Decisões Invariantes

- **D-001 — Mesmo resultado, outra execução.** Índice, cobertura, resultados de busca e ordens de "Todos" são idênticos
  aos de hoje. `listAllOfKind` e `sortVodItems` continuam como referência e não mudam de comportamento.
- **D-002 — Ordenação em fatias = merge sort estável com o mesmo comparador.** Um único `comparatorFor(option)` serve
  `sortVodItems` e `sortVodItemsInSlices`. Nada de chave de ordenação nova (a ordem mudaria; decisão do usuário).
- **D-003 — Sem Worker e sem índice gravado.** Tudo na thread principal, em fatias de ~8 ms (desktop) que cedem por
  `yieldToMain` (`lib/metadata/discoveryRules.ts`, `MessageChannel`).
- **D-004 — Cancelamento por `AbortSignal`.** Os `queryFn` passam o `signal` do React Query. Abortado, o trabalho para
  na próxima checagem e rejeita com `AbortError`; nunca segue depois de uma cessão.
- **D-005 — Limite de remontagem só no invalidador da pré-carga.** `SEARCH_INDEX_REFRESH_MS = 10_000`, com borda de
  entrada (o 1º lote remonta na hora) e uma remontagem no fim da janela se chegou algo. Esconder/bloquear categoria
  (`categoryAccessApi.ts`) e o fim de sincronização (`App.tsx`) continuam imediatos (FR-007).
- **D-006 — Listas pequenas continuam síncronas** (até `SYNC_SORT_MAX = 2 000` itens no hook de "Todos"), para o
  carregando não piscar.

## Constitution Check

*GATE: deve passar antes da Fase 0. Reavaliado após o design da Fase 1.*

| Princípio | Pré-Design | Pós-Design | Notas |
| --- | --- | --- | --- |
| Sem Conta Obrigatória | N/A | N/A | Não toca entrada, licença nem conta. |
| Segredos Fora dos Clientes e dos Logs | OK | OK | Sem rede, sem log novo; o índice compacto já tira URLs e headers. |
| Categorias da Fonte São Preservadas | OK | OK | Mesmo índice (D-001); nada de taxonomia externa. |
| IA e Classificação Nunca Inventam Dados | N/A | N/A | — |
| Comandos Locais Independem de Rede, Backend ou IA | OK | OK | Busca e ordenação continuam locais; a feature melhora a resposta ao controle. |
| Trailers e Metadados Não Alteram o Estado Principal | N/A | N/A | — |
| Toda Ação Essencial Tem Caminho Completo por Controle Remoto | OK | OK | É o objetivo: o controle responde durante a montagem. |
| Uma Lista de Catálogo Nunca É Tratada Como Manifesto | N/A | N/A | — |
| Foco Visível e Sem Becos Sem Saída | Atenção | OK | O `pending` novo de "Todos" reaproveita o estado de carregando que já tem elemento focável (FR-009, T011). |
| Voltar Restaura Foco e Posição | Atenção | OK | O foco continua por id (`focusedItemId` + `locateOrNeighbor`); a lista ordenada chega como array (FR-010). |
| Identidade de Reprodução Não Depende da URL | N/A | N/A | — |
| Progresso e Capacidades São Reais | OK | OK | Nenhuma barra ou % nova; o "Busca em X de Y" segue a regra de cobertura. |
| Documentação do Repositório É Canônica | OK | OK | Plan/tasks/backlog atualizados no Polish; `CLAUDE.md` só se surgir regra permanente. |
| Restrições: client-first, Tizen, regra da 082/066 | OK | OK | Leitura por `readHeaderChunks`; filtro de acesso mantido; ratchet de linhas respeitado (arquivos novos). |
| Fluxo: E2E antes da validação na TV | OK | OK | T018 roda `test:e2e` antes da sonda (T019). |

Sem violações; `Complexity Tracking` vazio.

## Project Structure

### Documentation (this feature)

```text
sdd/specs/084-indice-busca-sem-travar/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── handoff.md
├── contract-tests.lock
└── logic/
    └── fatias.md
```

### Source Code (repository root)

```text
tv-web/src/
├── lib/
│   ├── slices.ts                                  # NOVO: relógio de fatias, mapInSlices, stableSortInSlices
│   ├── metadata/discoveryRules.ts                 # yieldToMain (reuso, sem mudança)
│   └── catalog/
│       ├── catalogSearch.ts                       # loadSearchIndex(..., options) em fatias; warmNormalizedName
│       ├── catalogSearch.indice-sem-travar.contract.test.ts   # CONTRATO (travado, 2 testes)
│       ├── globalSearch.ts                        # loadGlobalSearchIndex(..., options) → signal + normalize
│       └── repository/kindReads.ts                # listAllOfKind (referência, sem mudança)
├── features/
│   ├── catalog/
│   │   ├── catalogApi.ts                          # queryFn com signal; indexItems sai do useMemo (≤ +3 linhas)
│   │   ├── aggregatedIndex.ts                     # NOVO: loadAggregatedItems (índice + itens + nomes aquecidos)
│   │   ├── prefetchApi.ts                         # limite de remontagem do índice (SEARCH_INDEX_REFRESH_MS)
│   │   └── prefetchApi.indice-sem-travar.contract.test.ts     # CONTRATO (travado, 1 teste)
│   └── vod/
│       ├── vodSort.ts                             # comparatorFor + sortVodItemsInSlices
│       ├── vodSort.indice-sem-travar.contract.test.ts         # CONTRATO (travado, 1 teste)
│       ├── useVodListItems.ts                     # NOVO: filtro + opções + ordenação (síncrona ≤ 2 000, senão fatias)
│       └── VodCategoryScreen.tsx                  # usa o hook (≤ 949 linhas)
sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/memoria/entrada.ts   # sonda: passa a medir o caminho novo (T019)
```

**Structure Decision**: frontend único em `tv-web/`. `lib/` puro (sem React), `features/` com hooks e telas. Respeita o
ratchet (sem feature→feature novo, sem lib→UI) e os tetos de linha.

## Complexity Tracking

> **Preencher SOMENTE se o Constitution Check tiver violações que precisam ser justificadas**

| Violação | Por que é necessária | Alternativa mais simples rejeitada porque |
| --- | --- | --- |

## Estratégia de Testes

Prioridade: unitário → contrato/integração → E2E → manual (último recurso). O gate de desempenho é a TV (sonda + app
real); o PC só diagnostica.

Comandos-base (de `tv-web/`):

```powershell
npx vitest run <arquivos>     # o mais estreito primeiro
npm run test
npx tsc -b
npm run lint                  # oxlint + ratchet (tetos de linha!)
npm run build
npm run test:e2e              # com npm run dev de pé
```

### Testes de Contrato

Arquivos travados em `contract-tests.lock`:
- `tv-web/src/lib/catalog/catalogSearch.indice-sem-travar.contract.test.ts`
- `tv-web/src/features/vod/vodSort.indice-sem-travar.contract.test.ts`
- `tv-web/src/features/catalog/prefetchApi.indice-sem-travar.contract.test.ts`

Comando (de `tv-web/`): `npx vitest run src/lib/catalog/catalogSearch.indice-sem-travar.contract.test.ts src/features/vod/vodSort.indice-sem-travar.contract.test.ts src/features/catalog/prefetchApi.indice-sem-travar.contract.test.ts`

Integridade (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 084-indice-busca-sem-travar`

| Teste | Origem | Fase | Vermelho esperado (antes do execute) |
| --- | --- | --- | --- |
| FR-001/FR-002: monta o índice em fatias, cedendo a vez, com o mesmo conteúdo, ordem e cobertura de hoje | FR-001, FR-002, US1/AC1-AC2 | Fase 3 | `expected 0 to be greater than or equal to 3` |
| FR-008: cancelada no meio, rejeita com AbortError e para de ceder | FR-008, US1/AC4 | Fase 3 | `promise resolved … instead of rejecting` |
| FR-005: em fatias, cada ordenação dá exatamente a ordem de sortVodItems | FR-005, SC-004, US2/AC1-AC2 | Fase 4 | `Error: not implemented` |
| FR-006: lotes seguidos remontam índice e busca global no máximo 1× a cada janela | FR-006, SC-003, US3/AC1-AC2 | Fase 5 | `expected "vi.fn()" to be called 1 times, but got 5 times` |

Stubs criados pelo plan (ponto de partida do execute, não travados):
- `catalogSearch.ts`: `LoadSearchIndexOptions` e o 4º parâmetro de `loadSearchIndex` (ignorado por enquanto);
- `vodSort.ts`: `SortInSlicesOptions` e `sortVodItemsInSlices` (lança `not implemented`);
- `prefetchApi.ts`: `SEARCH_INDEX_REFRESH_MS` e o 3º parâmetro de `createPrefetchInvalidator` (ignorado por enquanto).

Contratos de outras features nos mesmos arquivos, que devem continuar verdes: 017 (`catalogSearch.contract.test.ts`),
018 (`catalogSearch.busca-categoria.contract.test.ts`), 026 (`globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts`),
025 (`vodSort.filmes-series-ds-v14.contract.test.ts`), 065 (`prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts`).

## Estado Atual

<!-- Sobrescrita a cada checkpoint pelo sdd-execute. Vazia na criação. -->

| Área | Estado |
| --- | --- |
| Fase 2 (fundação, `lib/slices.ts`) | Concluída (T001–T002; 14 testes). |
| Fase 3 (US1, busca global em fatias) | Concluída (T003–T008): contrato 2/2 verde, trava íntegra; 017/018/026 verdes. Falta medir na TV (T019/T020). |
| Fase 4 (US2, "Todos" ordenado) | Concluída (T009–T013): contrato FR-005 verde, hook `useVodListItems`, `VodCategoryScreen.tsx` em 930 linhas. |
| Fase 5 (US3, limite de remontagem) | Concluída (T014–T016): contrato FR-006 verde; 065 e `prefetchApi.test.ts` verdes. |
| Polish (T017–T021) | T017/T018 feitas (suíte 664/3 641; E2E 53/54 em paralelo, 3/3 isolado no que falhou). T019 medida na TV: ganho grande, mas **quadros de 150–217 ms na 2ª rodada de cada instalação** (R-007). T020 lida no app real: sem ganho mensurável (R-008). T021 feita. Fase 7 (convergência): T025 feita; T022 diagnosticada e corrigida em parte (R-010), falta reler na TV; T023, T024 e T026 pendentes. |

## Riscos e Decisões

<!--
  IDs estáveis (R-001, R-002...), nunca deletados. Item resolvido ganha
  prefixo "Resolvido:" na célula de Mitigação em vez de sumir da tabela.
-->

| ID | Risco/Decisão | Impacto | Mitigação/Encaminhamento |
| --- | --- | --- | --- |
| R-001 | Tetos de linha do ratchet: `catalogApi.ts` tem 3 linhas de folga; `VodCategoryScreen.tsx` e `SearchScreen.tsx` estão no teto. | `npm run lint` falha. | Lógica em arquivos novos (`aggregatedIndex.ts`, `useVodListItems.ts`, `lib/slices.ts`); o hook absorve o filtro, as opções e a ordenação, liberando linhas na tela. Nunca subir o teto no baseline. |
| R-002 | A ordenação em fatias divergir da nativa (empate, comparador inconsistente). | Ordem visível muda (viola D-001). | Merge sort estável + `comparatorFor` único (D-002); contrato FR-005 com acentos, pontuação, números e empates em todas as opções. |
| R-003 | As ordenações Ano/Adicionados/Nota não foram medidas; o usuário não soube dizer se travam. | O FR-005 diz "fica como está se já cumpre". | Decisão: todas passam pelo mesmo `sortVodItemsInSlices` (mesma ordem garantida por D-002), mais simples que manter dois caminhos; medidas na sonda (T019). Comunicar no relato do execute. |
| R-004 | A 1ª tecla na busca global com termo curto (2 caracteres) pode casar dezenas de milhares de itens; ordenar os acertos por `Intl.Collator` é uma tarefa longa fora do escopo da spec (que trata da montagem). | Possível quadro > 100 ms na digitação, mesmo com a montagem resolvida. | O aquecimento do nome normalizado (opção `normalize`) tira a parte da normalização. A sonda mede "primeira tecla" (T019); se passar de 100 ms, registrar como achado novo no backlog, sem ampliar o escopo. |
| R-005 | A sonda roda sem React; o app real pode ter mais trabalho no mesmo quadro. | O gate da sonda passa e o app real não. | SC-005: leitura do `PerfOverlay` no app real com o usuário (T020). |
| R-007 | Medição na TV (T019, 2026-10-20, 3 instalações da sonda): a 1ª rodada da instalação com leitura por pedaço de 500 itens teve pior quadro 50 ms em todos os cenários e 4 montagens isoladas tiveram pior 64 ms, mas a 2ª rodada de `quadrosIndice` (após muitas listas descartadas) tem quadros de 150–217 ms (1–3 por cenário) nas duas instalações, e a remontagem a cada 10 s tem pior 150–217 ms (57–58 fps). Montagem da busca global 3,1–3,5 s (limite ~3,2 s). | SC-001/SC-002/SC-003 (nenhum quadro > 100 ms) não cumpridos em todas as medições; hipótese de pausa de GC não provada. | Evidência em `evidencias/quadros-tv-2026-10-20.md`. Decisão do usuário pendente: validar no app real (T020, `PerfOverlay`) antes de aceitar, ou investigar mais a sonda. O critério não foi afrouxado. |
| R-008 | App real na TV com `PerfOverlay` (T020, 2026-10-20, uma leitura por condição): abrir "Todos" A–Z soma +30 quadros>100ms com o código novo e +29 com o antigo (HEAD, catálogo quente); parado>100 0 → 12 (novo) contra 0 → 7 (antigo); a 1ª leitura do novo (+52) foi logo após instalar e não é comparável. Busca global não está acessível na interface hoje. | SC-005 (`quadros>100ms` sem subir) não cumprido nos dois códigos: no app real o custo dominante dessa entrada não é o que a 084 fatiou; o contador do painel não distingue uma trava longa de várias curtas. | Evidência em `evidencias/app-real-perfoverlay-2026-10-20.md`. Pendente decisão no `sdd-converge`: investigar a causa dos ~30 quadros lentos ao abrir "Todos" (render da grade, capas, trabalho O(n) por render) em feature/bugfix próprio; a 084 entrega a montagem em fatias (ganho provado na sonda) sem ganho visível no app real. |
| R-009 | `listAllOfKind` ganhou o parâmetro opcional `clock` (`repository/kindReads.ts`) em vez de uma função nova `listAllOfKindInSlices`, e o índice em fatias lê cada categoria de formato 2 por `iterateHeaderChunks` (um pedaço de 500 itens por vez). | O contrato da 063 (`catalogRepository.codigo-saudavel.contract.test.ts`) trava a lista de exports da fachada e `fachada.test.ts` proíbe importar `repository/` de fora; `logic/fatias.md` §2 dizia `listAllOfKind` inalterado. | Sem `clock` o comportamento é idêntico ao de antes (`Promise.all`, `sort` nativo); o contrato 084 e os 017/018/026/063/065 verdes. Decidido na T022/T025. |
| R-010 | Perfil no PC (CPU 4×) de "Todos" A–Z (T022): os quadros > 100 ms que sobram são nativos (`(program)`) na entrada da tela (~850 ms) e no início da troca de ordenação (~280 ms); o que a 084 fatiou não gera quadro > 100 ms. Achado e corrigido: `RatingBadge` e `translate.ts` criavam `Intl.NumberFormat` por card/render. | Explica por que o app real tem o mesmo contador (+29/+30) com o código antigo e o novo; o SC-005 não depende só do que a 084 entrega. | `evidencias/perfil-todos-pc-2026-10-20.md`. Reler na TV (PerfOverlay) para medir o efeito do cache dos formatadores; investigar o nativo (compilação dos chunks lazy, layout) em feature/bugfix próprio. |
| R-006 | Remontagem limitada deixa a cobertura até ~10 s defasada com a tela aberta. | Comportamento aceito pelo usuário (FR-006). | Esconder/bloquear categoria segue imediato (FR-007, D-005); teste de regressão T014. |

## Execution Notes

<!--
  Tabela append-only, mantida pelo sdd-execute. Quando passar de ~40 linhas,
  arquivar as mais antigas (exceto as ~10 mais recentes) em history.md,
  substituindo por uma linha de resumo consolidado aqui.
-->

| Data | Fase/Story | Resumo | Pendência Principal |
| --- | --- | --- | --- |
| 2026-10-20 | Fase 2 (fundação) | `lib/slices.ts` (relógio de fatias, `mapInSlices`, `forEachInSlices`, merge sort estável) e `slices.test.ts` (14/14). | — |
| 2026-10-20 | Fase 3 (US1) | `loadSearchIndex` em fatias e cancelável, `normalize`, `warmNormalizedName`, `loadGlobalSearchIndex` com `signal`, `useGlobalSearchIndex` com `signal`; T009 antecipada (`aggregatedIndex.ts`). Contrato 2/2 verde. | Medir na TV (T019/T020). |
| 2026-10-20 | Fases 4–5 e Polish (T017–T019) | US2 (`comparatorFor`, `sortVodItemsInSlices`, `useVodListItems`, `VodCategoryScreen`) e US3 (limite de remontagem de 10 s) concluídas; suíte 664/3 641 verde; E2E 53/54 (flake isolado); sonda na TV em 3 instalações; leitura por pedaço de 500 itens em `listAllOfKind(..., clock)`. | R-007: quadros de 150–217 ms na 2ª rodada da sonda; 1ª tecla 195–228 ms (backlog). |
| 2026-10-20 | Polish (T020–T021) | App real com PerfOverlay: +30 (novo) contra +29 (antigo) quadros>100ms em "Todos" A–Z; pacote normal reinstalado; quickstart e docs atualizados. | R-008: sem ganho mensurável no app real. |
| 2026-10-20 | Fase 7 (T022, T025) | Perfil de CPU de "Todos" no PC; formatadores `Intl` por idioma em `RatingBadge` e `translate.ts`; R-009 (`listAllOfKind` com `clock`) e R-010 registrados. | Reler na TV; T023, T024, T026 pendentes. |

**PRÓXIMO**: uma passada na TV (com autorização) para reler `quadros>100ms` em "Todos" A–Z com o cache dos formatadores (T022), medir "Todos" da TV ao vivo e o guia (T026) e decidir com o usuário o limite de tempo da busca global (T024, 3,1–3,5 s contra ~3,2 s) e o destino da T023 (picos da 2ª rodada da sonda).

## Arquivos Principais

<!-- Sobrescrita a cada checkpoint — foco da etapa atual, não a árvore inteira. -->

- `tv-web/src/lib/slices.ts` (novo) e `slices.test.ts`
- `tv-web/src/lib/catalog/catalogSearch.ts` (`loadSearchIndex` em fatias, `warmNormalizedName`)
- `tv-web/src/lib/catalog/globalSearch.ts` e `globalSearch.test.ts` (novo)
- `tv-web/src/features/catalog/aggregatedIndex.ts` (novo) e `catalogApi.ts` (`useGlobalSearchIndex`, `useAggregatedItems`)
- Próximos: `tv-web/src/features/vod/vodSort.ts`, `useVodListItems.ts` (novo), `VodCategoryScreen.tsx`

## Cuidados para Retomada

<!-- Armadilhas operacionais específicas desta feature, anexadas conforme descobertas. -->

- A entrada do índice (`LazySearchIndexEntry`) agora calcula o nome normalizado pelo cache do registro (`normalizedByItem`):
  um cálculo serve à entrada e à busca. Não volte a guardar só no campo da entrada.
- O dado da query `['catalog-search-index', sourceId, kind]` mudou de forma: agora é `{ items, coveredCategories,
  totalCategories }` (`loadAggregatedItems`), não um `SearchIndex`. A vitrine usa outra chave (6 elementos).
- `npm run lint` avisa "teto pode baixar" em `catalogApi.ts` (2 181 < 2 187): não rodar `--prune` sem o usuário pedir, para
  não mexer no baseline à toa.
- Dentro de `tv-web/`, o PowerShell mantém o diretório entre chamadas: volte à raiz antes de rodar os `.ps1` do `.planning`.
