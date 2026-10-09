import { useEffect } from 'react'
import { lazyRoute } from './lazyRoute'
export { lazyNamed } from './lazyRoute'
import type { LiveScreenProps } from '../features/live/LiveScreen'
import type { HomeScreenProps } from '../features/home/HomeScreen'
import type { AddSourceScreenProps } from '../features/import/AddSourceScreen'
import type { ImportProgressScreenProps } from '../features/import/ImportProgressScreen'
import type { SourceAccessRouteProps } from '../features/sources/SourceAccessRoute'
import type { VodShowcaseScreenProps } from '../features/vod/VodShowcaseScreen'
import type { MovieDetailScreenProps } from '../features/movies/MovieDetailScreen'
import type { SeriesDetailScreenProps } from '../features/series/SeriesDetailScreen'
import type { PersonScreenProps } from '../features/person/PersonScreen'
import type { SettingsScreenProps } from '../features/settings/SettingsScreen'
import type { EpgSettingsScreenProps } from '../features/settings/EpgSettingsScreen'
import type { TmdbKeyScreenProps } from '../features/settings/TmdbKeyScreen'
import type { SearchScreenProps } from '../features/search/SearchScreen'
import type { VodCategoryScreenProps } from '../features/vod/VodCategoryScreen'

// Feature 065 (SC-012): só Splash e Perfis ficam no caminho da abertura; Início, cadastro/importação e acesso à lista
// (e, por eles, o player e o virtualizador) chegam quando a pessoa vai até lá.
export const HomeScreen = lazyRoute<HomeScreenProps>(() => import('../features/home/HomeScreen'), 'HomeScreen')
export const AddSourceScreen = lazyRoute<AddSourceScreenProps>(() => import('../features/import/AddSourceScreen'), 'AddSourceScreen')
export const ImportProgressScreen = lazyRoute<ImportProgressScreenProps>(() => import('../features/import/ImportProgressScreen'), 'ImportProgressScreen')
export const SourceAccessRoute = lazyRoute<SourceAccessRouteProps>(() => import('../features/sources/SourceAccessRoute'), 'SourceAccessRoute')
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

/**
 * Aquece, quando o navegador estiver ocioso, só o código das próximas telas prováveis — nunca todas de uma vez, para não
 * deslocar trabalho para a abertura ou para o primeiro comando. Não toca em QueryClient, IndexedDB nem rede externa.
 */
export function warmRoutes(routes: readonly { preload: () => Promise<void> }[]): () => void {
  if (typeof window === 'undefined' || routes.length === 0) return () => undefined
  let cancelled = false
  const run = () => {
    if (!cancelled) for (const route of routes) void route.preload()
  }
  const requestIdle = window.requestIdleCallback
  if (typeof requestIdle === 'function') {
    const id = requestIdle(run, { timeout: 2000 })
    return () => {
      cancelled = true
      window.cancelIdleCallback(id)
    }
  }
  const id = window.setTimeout(run, 500)
  return () => {
    cancelled = true
    window.clearTimeout(id)
  }
}

/**
 * Com a tela atual já pintada, aquece o próximo destino provável — a primeira visita não paga o download do chunk, e a
 * abertura (splash/perfis) continua sem código de rota.
 */
export function useRouteWarmup(screenName: string): void {
  useEffect(() => {
    if (screenName === 'home') return warmRoutes([VodShowcaseScreen])
    if (screenName === 'movies') return warmRoutes([VodCategoryScreen, MovieDetailScreen])
    if (screenName === 'series') return warmRoutes([VodCategoryScreen, SeriesDetailScreen])
    return undefined
  }, [screenName])
}
