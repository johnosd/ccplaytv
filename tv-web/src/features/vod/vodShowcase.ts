/**
 * Vitrine de Filmes/Séries: o que depende do item de tela (`CatalogItemOut`).
 *
 * A lógica pura de seleção vive em `lib/catalog/showcaseSelection.ts` desde a feature 086 (`lib/` não pode importar de
 * `features/`, ratchet `lib-to-ui`); aqui ela é **reexportada**, para quem já importava deste caminho continuar valendo.
 */
import type { CatalogItemOut } from '../catalog/catalogApi'
import { createRecentlyAddedAccumulator, SHOWCASE_LIMIT } from '../../lib/catalog/showcaseSelection'

export {
  SHOWCASE_LIMIT,
  RATED_MIN,
  recentlyAddedBy,
  createRecentlyAddedAccumulator,
  validProviderRating,
  compareByRating,
  finiteAddedAt,
} from '../../lib/catalog/showcaseSelection'

/**
 * "Adicionados recentemente" (feature 052, FR-003): os `limit` itens com data de inclusão (`added_at`) mais nova, do
 * mais novo ao mais antigo. Item sem data fica de fora (nunca inventa data); empate mantém a ordem de entrada.
 */
export function recentlyAdded(items: readonly CatalogItemOut[], limit: number = SHOWCASE_LIMIT): CatalogItemOut[] {
  const accumulator = createRecentlyAddedAccumulator<CatalogItemOut>((item) => item.added_at, limit)
  for (const item of items) accumulator.add(item)
  return accumulator.finish()
}

/**
 * Regra do formato `wide` da fileira "Continue assistindo" (feature 053, D-006): só quando TODOS os itens mostrados têm
 * uma imagem horizontal real já guardada no aparelho. Sem isso, o pôster alto — nunca uma imagem genérica nem recortada.
 */
export function allHaveBackdrop(items: readonly CatalogItemOut[], backdrops: ReadonlyMap<string, string>, limit: number = SHOWCASE_LIMIT): boolean {
  const shown = items.slice(0, limit)
  return shown.length > 0 && shown.every((item) => backdrops.has(item.id))
}
