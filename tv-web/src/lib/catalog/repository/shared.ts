/** Ajudantes e erros compartilhados entre os mÃ³dulos do repositÃ³rio (interno: a fachada nÃ£o o reexporta por inteiro). Parte da divisÃ£o de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogItemKind } from '../db'

/**
 * Limites da faixa de `generation` e de `groupOrder` nas consultas por
 * índice composto. `-Infinity`/`Infinity` não são chaves válidas de
 * IndexedDB; estes são, e cobrem toda a faixa que o pipeline produz —
 * inclusive `Number.MAX_SAFE_INTEGER`, usado pelo conector para a
 * categoria desconhecida.
 */
export const KEY_MIN = -1
export const KEY_MAX = Number.MAX_SAFE_INTEGER

/** Falta de espaço no aparelho — sinalizada ao chamador, nunca engolida (FR-018). */
export class StorageFullError extends Error {
  constructor() {
    super('Não há espaço no aparelho para guardar o catálogo.')
    this.name = 'StorageFullError'
  }
}

/**
 * O navegador reporta falta de espaço de mais de um jeito, e o Dexie ainda
 * embrulha o erro original. Reconhecer só uma das formas deixaria o
 * truncamento passar como erro genérico — e a pessoa veria um catálogo
 * incompleto sem aviso.
 *
 * Exportada para `storedEntries.ts` (feature 014) reusar a mesma detecção
 * na gravação dos blocos — sem duplicar a lista de nomes de erro.
 */
export function isQuotaError(error: unknown): boolean {
  const names = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const name = (current as { name?: unknown }).name
    if (typeof name === 'string' && names.has(name)) return true
    current = (current as { inner?: unknown }).inner
  }
  return false
}

export async function activeGenerationOf(
  sourceId: string,
  database: CatalogDb,
): Promise<number | undefined> {
  const source = await database.sources.get(sourceId)
  return source?.activeGeneration
}

/**
 * Geração ativa de uma fonte, ou `undefined` se nenhuma foi publicada
 * ainda. Envoltório público do mesmo helper interno — existe para
 * `categoryLoader` (feature 010) saber onde escrever sem reimplementar a
 * leitura de `sources` nem furar D-001 (nenhuma tela/módulo fala com Dexie
 * direto).
 */
export async function activeGeneration(
  sourceId: string,
  database: CatalogDb = db,
): Promise<number | undefined> {
  return activeGenerationOf(sourceId, database)
}

/**
 * Consulta sempre pelo índice de três partes, mesmo quando a categoria não
 * é filtrada: assim a varredura de uma geração inteira também sai na ordem
 * declarada pela fonte, sem ordenação por texto em cima.
 */
export function query(database: CatalogDb, sourceId: string, generation: number, groupOrder?: number, kind?: CatalogItemKind) {
  if (kind) {
    const low = [sourceId, generation, kind, groupOrder ?? KEY_MIN]
    const high = [sourceId, generation, kind, groupOrder ?? KEY_MAX]
    return database.channels.where('[sourceId+generation+kind+groupOrder]').between(low, high, true, true)
  }
  const low = [sourceId, generation, groupOrder ?? KEY_MIN]
  const high = [sourceId, generation, groupOrder ?? KEY_MAX]
  return database.channels.where('[sourceId+generation+groupOrder]').between(low, high, true, true)
}

/** Tudo de uma fonte, qualquer geração — usado só para descarte. */
export function allGenerations(database: CatalogDb, sourceId: string) {
  return database.channels
    .where('[sourceId+generation]')
    .between([sourceId, KEY_MIN], [sourceId, KEY_MAX], true, true)
}

/** Categorias de uma fonte, qualquer geração — mesmo propósito, para `categories`. */
export function allCategoryGenerations(database: CatalogDb, sourceId: string) {
  return database.categories.where('sourceId').equals(sourceId)
}

/** Blocos guardados de uma fonte, qualquer geração — mesmo propósito, para `storedEntries` (feature 014). */
export function allStoredEntriesGenerations(database: CatalogDb, sourceId: string) {
  return database.storedEntries
    .where('[sourceId+generation]')
    .between([sourceId, KEY_MIN], [sourceId, KEY_MAX], true, true)
}

/** Sentinela pra encerrar `.each()` mais cedo — nunca vaza pra fora desta função. */
export class FavoritesScanComplete {}
