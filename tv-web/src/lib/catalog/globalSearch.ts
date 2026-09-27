/**
 * Busca global (feature 026, US3 — FR-037..FR-040). Canais, filmes e séries
 * JÁ LIDOS da lista ativa, de uma vez, sobre o mesmo índice por tipo da
 * feature 017/018 (`loadSearchIndex`) — nunca dispara leitura de categoria
 * nem rede. Regras em
 * `sdd/specs/026-home-busca-configuracoes-ds-v14/logic/busca-global.md`.
 */

import { db, type CatalogDb, type CatalogRecord } from './db'
import type { SearchIndex } from './catalogSearch'

/**
 * Mínimo do termo NORMALIZADO para haver resultado (FR-039). Próprio da
 * busca global — `SEARCH_MIN_CHARS` (3) da feature 017/018 continua valendo
 * para a busca por categoria, intocado.
 */
export const GLOBAL_SEARCH_MIN_CHARS = 2

/** Um índice por tipo pesquisável, todos da mesma lista. */
export interface GlobalSearchIndex {
  channel: SearchIndex
  movie: SearchIndex
  series: SearchIndex
}

export interface GlobalSearchResult {
  channels: CatalogRecord[]
  movies: CatalogRecord[]
  series: CatalogRecord[]
  /** Soma dos três tipos — "Busca em X de Y categorias" (FR-038). Vale mesmo sem termo. */
  coveredCategories: number
  totalCategories: number
}

/** Lê os três índices da lista (um `loadSearchIndex` por tipo). */
export async function loadGlobalSearchIndex(sourceId: string, database: CatalogDb = db): Promise<GlobalSearchIndex> {
  void sourceId
  void database
  throw new Error('not implemented')
}

/**
 * Filtra os três tipos pelo termo, com a mesma normalização e ordenação da
 * feature 018 (`searchWithinItems`). Abaixo de `GLOBAL_SEARCH_MIN_CHARS`,
 * listas vazias — mas a cobertura é devolvida sempre.
 */
export function searchGlobal(index: GlobalSearchIndex, term: string): GlobalSearchResult {
  void index
  void term
  throw new Error('not implemented')
}
