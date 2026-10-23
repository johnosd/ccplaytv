/**
 * "Bem avaliados" (features 056/065). A lógica vive em `lib/catalog/ratedSelection.ts` desde a feature 086 (`lib/` não
 * pode importar de `features/`); aqui ela é **reexportada**, para quem já importava deste caminho continuar valendo.
 */
export type { RatedFields, FeaturedRatedOptions, RatedSelectionAccumulator } from '../../lib/catalog/ratedSelection'
export {
  RATED_MIN_RATING,
  RATED_MAX_RATING,
  RECENT_YEARS,
  RATED_POOL,
  fnv1a32,
  titleKey,
  createRatedSelectionAccumulator,
  selectFeaturedRated,
  dayKey,
} from '../../lib/catalog/ratedSelection'
