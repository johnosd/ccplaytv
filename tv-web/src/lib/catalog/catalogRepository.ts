/**
 * Acesso ao catálogo local (`contracts/local-storage.md` §2).
 *
 * Nenhuma tela fala com Dexie direto (D-001) — tudo passa por aqui, para
 * trocar a camada de armazenamento depois não alcançar nenhuma tela.
 *
 * Duas regras estruturais valem em todo este arquivo:
 *
 * 1. **Leitura é sempre da geração ativa**, e quem chama não informa
 *    geração. Isso impede uma tela de ler pela metade um catálogo que
 *    ainda está sendo escrito.
 * 2. **Importação que troca de caminho escreve numa geração nova**, publicada
 *    só no fim (D-004 da 005) — a anterior continua legível enquanto isso.
 *    **Desde a feature 038 (D-004, R-010)**, a atualização pelo mesmo caminho
 *    (Xtream→Xtream, conteúdo guardado→conteúdo guardado) e a renovação dos
 *    itens de uma categoria escrevem **na geração ativa**: com a pré-carga, a
 *    geração nova apagaria o catálogo inteiro numa transação só e esfriaria
 *    tudo. Cada escrita deixa a categoria inteira antiga ou inteira nova, nunca
 *    pela metade (`applyStructureRefresh`, `renewCategoryItems`).
 */

// Feature 063: este arquivo é só a fachada. A implementação vive em `repository/` (um
// módulo por responsabilidade) e tudo o que a superfície pública precisa sai daqui, por
// lista explícita — nunca `export *`, que vazaria os ajudantes internos. Ninguém fora de
// `repository/` importa os módulos direto: é assim que `vi.mock`/`vi.spyOn` na fachada
// continuam interceptando o que sempre interceptaram.

export { StorageFullError, isQuotaError, activeGeneration } from './repository/shared'
export type { CatalogCategory, NewCategory } from './repository/categories'
export { getCategory, listCategories, storeCategories, markCategoryFetched, setDeclaredCount } from './repository/categories'
export type { RefreshedCategory, StructureRefreshResult } from './repository/structureRefresh'
export { applyStructureRefresh } from './repository/structureRefresh'
export type { CategoryItemsTarget, StoredCategoryTarget } from './repository/categoryItems'
export { storeCategoryItems, renewCategoryItems, storeStoredCategory } from './repository/categoryItems'
export type { KindPageChunk, KindPage } from './repository/kindReads'
export { listAllOfKind, readKindPage, kindSortFields } from './repository/kindReads'
export { listChannels, getActiveCategoryBlock, countChannels, getChannel } from './repository/categoryReads'
export type { SeriesEpisodesTarget } from './repository/series'
export { findSeriesRecord, listEpisodes, listAllEpisodes, storeSeriesEpisodes } from './repository/series'
export { resolveFavorites, resolveStableIds } from './repository/stableIds'
export type { ContinueEntry } from './repository/continueWatching'
export { resolveContinueWatching, resolveContinueEntries } from './repository/continueWatching'
export { storeBatch, allocateGeneration, publishGeneration, collectStaleGenerations, discardGeneration, deleteAllForSource } from './repository/generations'
export { stageSectionItems, stagedItemsOf, clearStagedItems, clearStagedItemsOfOtherSources } from './repository/staging'
