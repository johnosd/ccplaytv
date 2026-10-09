/**
 * Tabelas da feature 066 (Dexie v20, `dbSchema.ts`) com acesso tipado. Ficam
 * fora da classe `CatalogDb` porque `db.ts` está no teto de linhas da catraca
 * (`sdd/specs/066-categorias-controle-parental/plan.md` R-009).
 */

import type { Table } from 'dexie'
import type { CatalogDb, CategoryKind } from './db'

/** Uma decisão da pessoa sobre uma categoria de uma lista (`data-model.md`). */
export interface CategoryPreferenceRecord {
  sourceId: string
  kind: CategoryKind
  /** `categoryMatchKey(providerCategoryId, name)` — `p:<id>` ou `n:<nome>`. */
  matchKey: string
  hidden?: boolean
  /** Ausente = decide a regra do nome adulto; `false` = liberada pela pessoa. */
  locked?: boolean
  declinedSuggestion?: boolean
  updatedAt: number
}

/** O PIN parental, só como hash com sal (`logic/pin.md` §1). Existir = controle ligado. */
export interface ParentalPinRecord {
  id: 'pin'
  salt: string
  hash: string
  algorithm: 'sha256'
  createdAt: number
}

export function categoryPreferences(database: CatalogDb): Table<CategoryPreferenceRecord, [string, CategoryKind, string]> {
  return database.table('categoryPreferences')
}

export function parentalPin(database: CatalogDb): Table<ParentalPinRecord, 'pin'> {
  return database.table('parentalPin')
}
