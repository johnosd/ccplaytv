import { useEffect } from 'react'
import { lazyRoute } from './lazyRoute'
export { lazyNamed } from './lazyRoute'
import type { LiveScreenProps } from '../features/live/LiveScreen'
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

// Feature 065 (SC-012): cadastro/importação e acesso à lista chegam quando a pessoa vai até lá. O Início fica no pacote
// inicial: carregá-lo sob demanda atrasava a primeira entrada na lista mais do que economizava na abertura.
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
  // Sem rede não aquece: no navegador de desenvolvimento um import que falha fica guardado como falho e derrubaria a
  // navegação real depois (no pacote da TV os arquivos são locais e isto não acontece).
  const run = () => {
    if (!cancelled && navigator.onLine !== false) for (const route of routes) void route.preload()
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
    // Perfis: só a tela de acesso à lista (leve), para escolher uma lista funcionar mesmo sem rede logo depois.
    if (screenName === 'profiles') return warmRoutes([SourceAccessRoute])
    if (screenName === 'home') return warmRoutes([VodShowcaseScreen])
    if (screenName === 'movies') return warmRoutes([VodCategoryScreen, MovieDetailScreen])
    if (screenName === 'series') return warmRoutes([VodCategoryScreen, SeriesDetailScreen])
    return undefined
  }, [screenName])
}
