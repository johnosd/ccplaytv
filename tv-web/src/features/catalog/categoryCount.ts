/**
 * Reexporta `knownCategoryCount` (feature 024, `features/live/channelNumber.ts`)
 * para quem precisa da mesma regra de contagem honesta (feature 025,
 * `VodCatalogScreen.tsx`) sem importar `features/live` diretamente —
 * `features/vod/` só importa de `features/catalog`, `features/favorites` e
 * `features/shell` (plan.md, Structure Decision).
 */
export { knownCategoryCount } from '../live/channelNumber'
