import { db, type CatalogDb, type CatalogRecord } from '../db'

export interface CategoryWindow {
  items: CatalogRecord[]
  total: number
  nextOffset?: number
}

/** Feature 065: projeção persistida e reconstruível; stub do sdd-plan. */
export async function prepareCategoryReadModel(
  _sourceId: string,
  _categoryId: number,
  _database: CatalogDb = db,
): Promise<void> {
  throw new Error('not implemented')
}

/** A janela mantém ids/ordem e não carrega um bloco completo já projetado. */
export async function readCategoryWindow(
  _sourceId: string,
  _categoryId: number,
  _offset: number,
  _limit: number,
  _database: CatalogDb = db,
): Promise<CategoryWindow> {
  throw new Error('not implemented')
}
