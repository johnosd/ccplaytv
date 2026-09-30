# Handoff — 038-carga-listas-pre-carga

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Stack: React 19 + TS + Vite + Dexie (IndexedDB) em `tv-web/`, app Tizen client-first.
- Próximo comando: `/sdd-execute 038-carga-listas-pre-carga`. Backlog: **Planejada**, 0 tasks.
- Veio do assessment `sdd/assessments/carga-listas-progresso-claro-entrada-instantanea/` (go). O dono do produto quer esta **antes** da 034.
- Há trabalho de outras features na árvore sem commit (037 implementada; 034 e 036 planejadas com contratos travados **vermelhos**). Não mexer nos arquivos delas.

## O que a feature entrega

- **P1 US1**: pré-carga em segundo plano. Uma categoria por vez, só com 2 s sem tecla, nunca com player/trailer aberto, com o app oculto ou sem rede. Prioridade: categoria em foco → vizinhas → resto da seção → Canais → Filmes → Séries.
- **P1 US2**: medir **primeiro** (código de hoje) os ~60 s da primeira entrada fria e corrigir o que for do app (meta ≤ 3 s).
- **P2 US4**: contagem real no trilho só para categorias no aparelho.
- **P2 US3**: tela de importação com linhas Canais/Filmes/Séries/Guia, sem percentual. "Abrir lista" fica disponível já com a estrutura; o foco vai para ele quando o guia se resolve.
- **P2 US5**: atualização sem esfriar. O usuário **escolheu construir isso também para M3U guardada** (não aceitou o desvio), por isso existe `storedFrom`.
- **P3 US6**: linha não focável no Início ("Preparando catálogo — N de M" / "Atualizando catálogo…" / "Catálogo atualizado há …").

## Leitura obrigatória, em ordem

1. `spec.md`: FR-001..FR-034, SC-001..SC-008 e as clarificações.
2. `plan.md`: D-001..D-015, Complexity Tracking (foco × consulta; escrita na geração ativa) e R-001..R-012.
3. `tasks.md`: ordem Fase 1 (medição) → 2 (fundação) → 3 (US1) → 4..9.
4. `logic/agendador-pre-carga.md`: ordem, portão, laço, invalidação e texto do Início.
5. `logic/atualizacao-sem-esfriar.md`: por que não dá para manter "geração nova a cada atualização", `order`×`position`, atualização no lugar (Xtream e M3U), `renewCategoryItems` e limpeza em partes.
6. `logic/progresso-importacao.md`: `sections` no run e linha do Guia.
7. `data-model.md`, `research.md` (R0-1 aberto), `quickstart.md`.
8. `.planning/memory/constitution.md` (1.7.0).

## Testes de contrato (5/5, travados, todos vermelhos hoje)

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/catalog/prefetch/prefetchOrder.carga-listas.contract.test.ts` | 1 | 3 |
| `tv-web/src/lib/catalog/prefetch/prefetchScheduler.carga-listas.contract.test.ts` | 1 | 3 |
| `tv-web/src/lib/catalog/structureDiff.carga-listas.contract.test.ts` | 1 | 7 |
| `tv-web/src/lib/catalog/catalogRepository.carga-listas.contract.test.ts` | 1 | 2 |
| `tv-web/src/lib/catalog/categoryLoader.carga-listas.contract.test.ts` | 1 | 2 |

- Rodar (em `tv-web/`): `npx vitest run src/lib/catalog/prefetch/prefetchOrder.carga-listas.contract.test.ts src/lib/catalog/prefetch/prefetchScheduler.carga-listas.contract.test.ts src/lib/catalog/structureDiff.carga-listas.contract.test.ts src/lib/catalog/catalogRepository.carga-listas.contract.test.ts src/lib/catalog/categoryLoader.carga-listas.contract.test.ts`
- Integridade (na raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 038-carga-listas-pre-carga`
- Travas de **outras** features em arquivos que esta toca: `PlayerLayer.*.contract` (020/027/029/031), `TrailerLayer.trailers.contract` (033), `LiveScreen.*.contract` (018/024/030/031), `HomeScreen.home-busca-configuracoes-ds-v14.contract` (026), `VodCatalogScreen.limpar-historico.contract` (036, vermelho), `importPipeline.fontes-estado.contract` (034, vermelho). Precisam continuar íntegras e, as da 034/036, **compilando**.

## Stubs criados

- `lib/catalog/prefetch/prefetchOrder.ts`: tipos, constantes (`NEIGHBOR_RADIUS=3`, `MAX_ATTEMPTS_PER_SESSION=3`, `SECTION_ORDER`), `scope?` (recuo FR-014); `workNeeded`/`pickNextCategory` lançam `not implemented`.
- `lib/catalog/prefetch/activityGate.ts`: interface + `createActivityGate` (não implementado).
- `lib/catalog/prefetch/prefetchScheduler.ts`: deps/tipos/constantes (`IDLE_AFTER_KEY_MS=2000`, `GAP_BETWEEN_CATEGORIES_MS=500`) + `createPrefetchScheduler` (não implementado). A dep opcional `housekeeping` **ainda não está na interface**: acrescentar em T016.
- `lib/catalog/structureDiff.ts`: tipos + `categoryMatchKey`/`diffCategories` (não implementados).
- `catalogRepository.ts`: `renewCategoryItems` (não implementado); `CatalogCategory.renewRequestedAt` (ainda não mapeado por `listCategories`, é a T009).
- `categoryLoader.ts`: só o **tipo** da opção `serveStale` (o comportamento é a T010). `renew` e `reason` ainda não existem.
- `db.ts` `CategoryRecord`: `position`, `renewRequestedAt`, `itemsSignature`, `storedFrom` (sem subir a versão do Dexie).

## Armadilhas já mapeadas

- **Fase 1 mede o código antigo**: não mude o caminho de escrita antes de registrar a linha de base (FR-012). A TV pode não estar acessível. Nesse caso, mede no PC e registra o que ficou faltando.
- `listChannels` hoje ordena por **id**. Com ids preservados, a ordem da fonte só sai certa ordenando por `categoryPosition` (o contrato cobre isso). Único chamador: `catalogApi.loadCategoryContent`.
- `storeCategoryItems` apaga e regrava (ids novos). Continue exportando (o contrato 5 usa), mas nenhum código de produção deve gravar itens por ele depois da T010.
- `fetchAndStore` hoje engole tudo como `failed`. Sem deixar `StorageFullError` virar `reason: 'storage_full'`, o FR-008 nunca dispara. `AbortError` continua subindo como hoje.
- **Nunca abortar** uma categoria da pré-carga. Ela é compartilhada com a entrada pelo `dedup` (chave = id local); abortar quebra a entrada (bug de 25/09).
- O ouvinte de tecla vai em **`window`, fase de captura, passivo**. Em `document` ele não enxerga as teclas que um `Modal` corta com `stopImmediatePropagation`.
- `PlayerLayer`/`TrailerLayer`: acrescentar só o `useEffect(() => prefetchGate.acquirePlayback(), [])`. Zapping não remonta a camada, então o contador não oscila.
- `publishGeneration` apaga numa transação só: com o catálogo inteiro pré-carregado, isso congela a TV. Por isso existe a D-008 (apagar só categorias + limpeza em partes).
- `category_id` do Xtream **se repete entre seções**: a chave do diff sempre inclui `kind`.
- A seção que o painel não serviu numa atualização **fica fora do diff**. Sem isso, a atualização apagaria filmes porque `get_vod_categories` falhou.
- `knownCategoryCount` para `stored` devolve sempre `declaredCount`, mesmo depois de materializar (T044).
- `useCategoryFocusPrefetch` depende do objeto `focusedCategory` inteiro. A invalidação de `['categories']` pode rearmá-lo (R-004, T023).
- Flakes conhecidos: `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo; conferir isolado. Reiniciar o dev server antes do E2E. Os `e2e/*.mjs` têm `executablePath` Linux: no Windows, sobrescrever temporariamente.
- Roteiros `*-real.mjs` leem `CCPLAY_PROBE_*` do `.env` da raiz e imprimem **só números**.

## Pendências do Analyze

- A1 (MEDIUM): o prazo de SC-002 só é fixado depois da medição. É a T041, de propósito; não esquecer de escrevê-lo no `plan.md`.
- A2 (MEDIUM): FR-019 diz "termina quando estrutura e guia resolvidos"; a D-012 deixa "Abrir lista" disponível antes (só o foco automático espera o guia). É uma interpretação para não prender a pessoa atrás de um XMLTV lento. Se o usuário discordar, a mudança é pequena, em `ImportProgressScreen.tsx`.
- A3 (MEDIUM): SC-004 só é provado de verdade na TV (registro de tempos). O E2E cenário 5 prova no navegador.
- A4 (LOW): IDs T028–T039 ficaram livres de propósito (as correções da Fase 4 entram a partir de T040).
- A5 (LOW): FR-033 (não mexer em Configurações/cartão) não tem task própria; é restrição negativa, conferir no Polish.

## Gate de pronto

- 5 contratos verdes + `check-contract-tests.ps1 -Slug 038-carga-listas-pre-carga` íntegro + travas das outras features íntegras.
- `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run build:tizen`, `npm run test:e2e` (com `e2e/carga-listas.mjs`).
- `quickstart.md` executado.
- Docs no Polish: `CLAUDE.md` (Project status + "Known deviation"), backlog via script, nota na `research.md` da 010.
- **TV física é gate obrigatório** (SC-008: SC-001/003/004/005 medidos no aparelho). Fechar sem ele só com decisão explícita do usuário registrada em Riscos.
