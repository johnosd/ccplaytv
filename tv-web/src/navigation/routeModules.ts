import { lazyRoute } from './lazyRoute'
export { lazyNamed } from './lazyRoute'
import type { LiveScreenProps } from '../features/live/LiveScreen'
import type { VodShowcaseScreenProps } from '../features/vod/VodShowcaseScreen'
import type { MovieDetailScreenProps } from '../features/movies/MovieDetailScreen'
import type { SeriesDetailScreenProps } from '../features/series/SeriesDetailScreen'
import type { PersonScreenProps } from '../features/person/PersonScreen'
import type { SettingsScreenProps } from '../features/settings/SettingsScreen'
import type { EpgSettingsScreenProps } from '../features/settings/EpgSettingsScreen'
import type { TmdbKeyScreenProps } from '../features/settings/TmdbKeyScreen'
import type { SearchScreenProps } from '../features/search/SearchScreen'
import type { VodCategoryScreenProps } from '../features/vod/VodCategoryScreen'

export const LiveScreen = lazyRoute<LiveScreenProps>(() => import('../features/live/LiveScreen'), 'LiveScreen')
export const VodShowcaseScreen = lazyRoute<VodShowcaseScreenProps>(() => import('../features/vod/VodShowcaseScreen'), 'VodShowcaseScreen')
export const MovieDetailScreen = lazyRoute<MovieDetailScreenProps>(() => import('../features/movies/MovieDetailScreen'), 'MovieDetailScreen')
export const SeriesDetailScreen = lazyRoute<SeriesDetailScreenProps>(() => import('../features/series/SeriesDetailScreen'), 'SeriesDetailScreen')
export const PersonScreen = lazyRoute<PersonScreenProps>(() => import('../features/person/PersonScreen'), 'PersonScreen')
export const SettingsScreen = lazyRoute<SettingsScreenProps>(() => import('../features/settings/SettingsScreen'), 'SettingsScreen')
export const EpgSettingsScreen = lazyRoute<EpgSettingsScreenProps>(() => import('../features/settings/EpgSettingsScreen'), 'EpgSettingsScreen')
export const TmdbKeyScreen = lazyRoute<TmdbKeyScreenProps>(() => import('../features/settings/TmdbKeyScreen'), 'TmdbKeyScreen')
export const SearchScreen = lazyRoute<SearchScreenProps>(() => import('../features/search/SearchScreen'), 'SearchScreen')
export const VodCategoryScreen = lazyRoute<VodCategoryScreenProps>(() => import('../features/vod/VodCategoryScreen'), 'VodCategoryScreen')

const warmableModules = [
  () => import('../features/live/LiveScreen'),
  () => import('../features/vod/VodShowcaseScreen'),
  () => import('../features/vod/VodCategoryScreen'),
  () => import('../features/movies/MovieDetailScreen'),
  () => import('../features/series/SeriesDetailScreen'),
  () => import('../features/person/PersonScreen'),
  () => import('../features/settings/SettingsScreen'),
  () => import('../features/settings/EpgSettingsScreen'),
  () => import('../features/settings/TmdbKeyScreen'),
  () => import('../features/search/SearchScreen'),
]

let warmed = false

/**
 * Aquece somente módulos locais, depois que a primeira tela já está disponível.
 * Não toca em QueryClient, IndexedDB ou endpoints externos.
 */
export function warmRouteModules(): () => void {
  if (warmed || typeof window === 'undefined') return () => undefined
  let cancelled = false
  const run = () => {
    if (cancelled || warmed) return
    warmed = true
    for (const load of warmableModules) void load().catch(() => undefined)
  }
  const requestIdle = window.requestIdleCallback
  if (typeof requestIdle === 'function') {
    const id = requestIdle(run, { timeout: 1500 })
    return () => {
      cancelled = true
      window.cancelIdleCallback(id)
    }
  }
  const id = window.setTimeout(run, 250)
  return () => {
    cancelled = true
    window.clearTimeout(id)
  }
}
