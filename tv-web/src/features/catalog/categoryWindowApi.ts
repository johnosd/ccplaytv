/** Fachada de janelas/cursos para as grades; a persistência continua em lib/catalog. */
export {
  prepareCategoryReadModel,
  readCategoryWindow,
} from '../../lib/catalog/categoryWindow'
export { readKindCursorPage } from '../../lib/catalog/kindCursor'

export type { CategoryWindow } from '../../lib/catalog/categoryWindow'
export type { KindCursor, KindCursorPage } from '../../lib/catalog/kindCursor'
