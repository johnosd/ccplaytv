# Divisão de `catalogRepository.ts` (US1, item 49a-2)

O arquivo tem **1 517 linhas físicas** em 07/10/2026 (a spec cita 1 428, que é a
contagem sem linhas em branco do `Measure-Object -Line`; vale a física, mesma
regra da catraca, `catraca-arquitetura.md` §3).

## 1. Regra de ouro

**Mover, não reescrever.** Cada função sai do arquivo com o mesmo corpo, os mesmos
comentários e a mesma assinatura. Só mudam os `import` no topo de cada módulo
novo. Nenhum nome público muda. Nenhuma transação é aberta, fechada ou dividida
de outro jeito. Se algo parecer bug no caminho, não corrija: anote em
`Riscos e Decisões` e abra um `sdd-bugfix` depois (Assumptions da spec).

## 2. Mapa: símbolo → módulo

Pasta nova: `tv-web/src/lib/catalog/repository/`. Linhas citadas são do arquivo
atual. A estimativa inclui os imports e um cabeçalho curto.

| Módulo | Conteúdo (linhas atuais) | Estimativa |
| --- | --- | --- |
| `shared.ts` (**interno**) | `KEY_MIN`/`KEY_MAX` (51–59); `StorageFullError`, `isQuotaError` (61–87); `activeGenerationOf` (147–153); `activeGeneration` (155–167); `query` (169–183); `allGenerations`, `allCategoryGenerations`, `allStoredEntriesGenerations` (185–202); a sentinela `FavoritesScanComplete` (888–889) | ~110 |
| `categories.ts` | `CatalogCategory`, `NewCategory` (89–126); `getCategory`, `listCategories` (204–271, incluindo o docblock órfão das linhas 204–221, que descreve `listCategories`: mova-o para logo acima dela); `storeCategories` (273–293); `markCategoryFetched`, `setDeclaredCount` (468–491) | ~150 |
| `structureRefresh.ts` | `RefreshedCategory`, `StructureRefreshResult`, `applyStructureRefresh` (344–466) | ~135 |
| `categoryItems.ts` | `CategoryItemsTarget` (128–136); `storeCategoryItems`, `renewCategoryItems` (295–342); `StoredCategoryTarget`, `storeStoredCategory` (493–585) | ~160 |
| `kindReads.ts` | `listAllOfKind` (587–611); `KindPageChunk`, `KindPage`, `readKindPage` (613–659); `kindSortFields` (661–692) | ~120 |
| `categoryReads.ts` | `categoriesAtOrder`, `readCategory` (694–735, internos); `listChannels` (737–761); `getActiveCategoryBlock` (763–781); `countChannels` (783–807); `getChannel` (809–845) | ~170 |
| `series.ts` | `SeriesEpisodesTarget` (138–145); `findSeriesRecord`, `findSeriesIn` (847–886); `findSeriesManyIn` (1153–1188, interno); `listEpisodes`, `listAllEpisodes`, `storeSeriesEpisodes` (1190–1284) | ~200 |
| `stableIds.ts` | `resolveFavorites`, `resolveStableIds` (891–935); `resolveStableIdsIn` (937–1060, interno) | ~185 |
| `continueWatching.ts` | `resolveContinueWatching`, `ContinueEntry`, `resolveContinueEntries` (1062–1151) | ~105 |
| `generations.ts` | `storeBatch`, `allocateGeneration`, `publishGeneration`, `collectStaleGenerations`, `discardGeneration`, `deleteAllForSource` (1286–1467) | ~200 |
| `staging.ts` | `stagingOf` (interno), `stageSectionItems`, `stagedItemsOf`, `clearStagedItems`, `clearStagedItemsOfOtherSources` (1469–1517) | ~60 |

Se um módulo passar de 300 linhas, divida-o mais (nunca enxugue comentários para
caber). O contrato da fachada reprova qualquer arquivo de `repository/` acima do
limite.

## 3. Dependências permitidas entre os módulos (sem ciclo)

```text
shared ← todos
series ← continueWatching          (findSeriesManyIn)
stableIds ← continueWatching       (resolveStableIdsIn)
staging ← generations              (deleteAllForSource chama clearStagedItems)
```

Nenhum outro import entre módulos de `repository/`. `structureDiff`,
`categoryBlocks`, `blockMemo`, `db`, `userStateRepository` (`parseStableId`,
`StableIdParts`) e `dexie` continuam sendo importados de onde já estão.

## 4. Estado e identidade

- O arquivo atual **não tem estado de módulo mutável**. O cache curto de blocos
  vive em `blockMemo.ts`, que continua único. Nada aqui pode criar um segundo
  cache.
- `FavoritesScanComplete` é comparada por `instanceof` em `kindSortFields`,
  `findSeriesIn`, `resolveStableIdsIn` e `findSeriesManyIn`. **Uma definição
  só**, em `shared.ts`. Duas classes com o mesmo nome deixariam um `.each()`
  interrompido virar erro.
- `StorageFullError` também precisa de uma definição só, porque chamadores fazem
  `instanceof StorageFullError` com a classe que vem da fachada.

## 5. A fachada

`catalogRepository.ts` passa a ter só comentários e reexportações **por lista
explícita**. Nunca `export *`, porque ele exportaria os ajudantes internos e
mudaria o conjunto. Tipos vão em `export type { … }` (o projeto usa
`verbatimModuleSyntax`).

```ts
/** (o cabeçalho atual, com as duas regras estruturais, fica aqui) */
export { StorageFullError, isQuotaError, activeGeneration } from './repository/shared'
export type { CatalogCategory, NewCategory } from './repository/categories'
export { getCategory, listCategories, storeCategories, markCategoryFetched, setDeclaredCount } from './repository/categories'
// … um par export/export type por módulo, na ordem da tabela do §2
```

Ninguém fora de `lib/catalog/repository/` e da própria fachada importa
`./repository/*`, nem testes. Isso mantém os `vi.mock('…/catalogRepository')` e o
`vi.spyOn(catalogRepository, 'resolveFavorites')` existentes interceptando
exatamente o que interceptavam antes (`R-001`).

## 6. Prova de que nada mudou

1. Contrato da fachada (conjunto de valores, só reexporta, módulos dentro do limite).
2. `npx tsc -b`: os 54 importadores e o `TiposDaFachada` do contrato compilam sem
   edição.
3. `npm run test`: a suíte inteira, incluindo as travas de outras features
   (`handoff.md` lista as que tocam o repositório).
4. `check-contract-tests.ps1` para cada feature cuja trava toca o repositório.
5. `npm run test:e2e`, com `npm run dev` rodando.
6. `git diff --stat`: nenhum arquivo fora de `lib/catalog/catalogRepository.ts` e
   `lib/catalog/repository/` mudou nesta fase.
