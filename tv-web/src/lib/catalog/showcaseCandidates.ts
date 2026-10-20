/**
 * Candidatos das fileiras calculadas, por categoria (feature 086, `logic/selecoes-guardadas.md` §1 e §3).
 *
 * Quem grava uma categoria também guarda, dela, os poucos itens que podem entrar em "Adicionados recentemente" e em
 * "Bem avaliados" — com os itens que já estão em mãos, sem nenhuma leitura extra. A tela deixa de varrer o tipo inteiro.
 *
 * STUB do `sdd-plan` — corpo a implementar no `sdd-execute`.
 */

import type { CatalogDb, CatalogReadItem, CatalogRecord, BlockItem } from './db'

/** Os mais novos guardados por categoria: um item fora dos 12 mais novos da sua categoria nunca entra nos 12 do tipo. */
export const RECENT_CANDIDATES = 12
/** Pool de "Bem avaliados" (36) mais folga para o dedupe entre categorias (`logic/selecoes-guardadas.md` §2.1). */
export const RATED_CANDIDATES = 48

/** O que o card precisa, sem reabrir o bloco da categoria. Mesmo conjunto de `projectReadItem`. */
export type ShowcaseCandidateItem = CatalogReadItem

export interface ShowcaseCandidates {
  categoryId: number
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  /** Ordem da categoria na fonte — define o desempate da mesclagem. */
  order: number
  recent: ShowcaseCandidateItem[]
  rated: ShowcaseCandidateItem[]
  /** Títulos elegíveis para "Bem avaliados" nesta categoria (sem dedupe entre categorias). */
  eligibleCount: number
  itemsCount: number
}

export interface CandidateTarget {
  sourceId: string
  generation: number
  kind: 'movie' | 'series'
  categoryId: number
  groupOrder: number
  order: number
}

/**
 * Escolhe os candidatos de uma categoria a partir dos itens que estão sendo gravados. Função pura: não toca o banco.
 * Os dois conjuntos saem dos MESMOS acumuladores que a varredura de hoje usa (`logic/selecoes-guardadas.md` §2).
 */
export function pickCandidates(
  _target: CandidateTarget,
  _items: readonly (CatalogRecord | BlockItem)[],
  _now: number,
): ShowcaseCandidates {
  throw new Error('not implemented')
}

/** Grava os candidatos de uma categoria (chamado por quem grava a categoria, nunca pela tela). */
export function writeCandidates(_candidates: ShowcaseCandidates, _database?: CatalogDb): Promise<void> {
  throw new Error('not implemented')
}

/** Apaga os candidatos de uma categoria (liberação pelo orçamento, geração trocada, lista apagada). */
export function clearCandidates(_categoryId: number, _database?: CatalogDb): Promise<void> {
  throw new Error('not implemented')
}

/** Candidatos da geração ativa de uma lista e tipo, na ordem da fonte. Nunca lê blocos. */
export function readCandidates(
  _sourceId: string,
  _kind: 'movie' | 'series',
  _database?: CatalogDb,
): Promise<ShowcaseCandidates[]> {
  throw new Error('not implemented')
}
