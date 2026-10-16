import { createElement, useEffect, type ComponentType, type ReactElement } from 'react'
import { aliasRouteReset, lazyRoute, type PreloadableRoute } from './lazyRoute'
import { ParentalGate } from '../components/ParentalGate'
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
import type { ListSettingsScreenProps } from '../features/settings/list/ListSettingsScreen'
import type { EpgSettingsScreenProps } from '../features/settings/EpgSettingsScreen'
import type { TmdbKeyScreenProps } from '../features/settings/TmdbKeyScreen'
import type { SearchScreenProps } from '../features/search/SearchScreen'
import type { VodCategoryScreenProps } from '../features/vod/VodCategoryScreen'
import type { RadioScreenProps } from '../features/radio/RadioScreen'
import type { AppScreen } from './appNav'

// Feature 065 (SC-012): cadastro/importação e acesso à lista chegam quando a pessoa vai até lá. O Início fica no pacote
// inicial: carregá-lo sob demanda atrasava a primeira entrada na lista mais do que economizava na abertura.
/**
 * Com o controle parental ligado na lista editada, a rota só abre depois do PIN dela (feature 066, FR-017; D-008; 067,
 * FR-020) — sem linha nas telas, que estão no teto da catraca. Sem `existingSource` (adicionar lista) abre direto
 * (067, FR-021). Cancelar o PIN é o `onBack` da rota.
 */
function withParentalGate<P extends { onBack: () => void; existingSource?: { id: string } }>(Route: PreloadableRoute<P>): PreloadableRoute<P> {
  function GatedRoute(props: P) {
    return createElement(ParentalGate, {
      sourceId: props.existingSource?.id,
      onCancel: props.onBack,
      children: createElement(Route as ComponentType<P>, props),
    })
  }
  aliasRouteReset(GatedRoute, Route)
  return Object.assign(GatedRoute, { preload: Route.preload })
}

// Editar lista pede o PIN da lista quando ela tem controle parental; adicionar lista não pede (feature 067).
export const AddSourceScreen = withParentalGate(lazyRoute<AddSourceScreenProps>(() => import('../features/import/AddSourceScreen'), 'AddSourceScreen'))
export const ImportProgressScreen =lazyRoute<ImportProgressScreenProps>(() => import('../features/import/ImportProgressScreen'), 'ImportProgressScreen')
export const SourceAccessRoute = lazyRoute<SourceAccessRouteProps>(() => import('../features/sources/SourceAccessRoute'), 'SourceAccessRoute')
export const LiveScreen = lazyRoute<LiveScreenProps>(() => import('../features/live/LiveScreen'), 'LiveScreen')
export const VodShowcaseScreen = lazyRoute<VodShowcaseScreenProps>(() => import('../features/vod/VodShowcaseScreen'), 'VodShowcaseScreen')
export const MovieDetailScreen = lazyRoute<MovieDetailScreenProps>(() => import('../features/movies/MovieDetailScreen'), 'MovieDetailScreen')
export const SeriesDetailScreen = lazyRoute<SeriesDetailScreenProps>(() => import('../features/series/SeriesDetailScreen'), 'SeriesDetailScreen')
export const PersonScreen = lazyRoute<PersonScreenProps>(() => import('../features/person/PersonScreen'), 'PersonScreen')
export const SettingsScreen = lazyRoute<SettingsScreenProps>(() => import('../features/settings/SettingsScreen'), 'SettingsScreen')
export const ListSettingsScreen = lazyRoute<ListSettingsScreenProps>(() => import('../features/settings/list/ListSettingsScreen'), 'ListSettingsScreen')
export const EpgSettingsScreen = lazyRoute<EpgSettingsScreenProps>(() => import('../features/settings/EpgSettingsScreen'), 'EpgSettingsScreen')
export const TmdbKeyScreen = lazyRoute<TmdbKeyScreenProps>(() => import('../features/settings/TmdbKeyScreen'), 'TmdbKeyScreen')
export const SearchScreen = lazyRoute<SearchScreenProps>(() => import('../features/search/SearchScreen'), 'SearchScreen')
export const VodCategoryScreen = lazyRoute<VodCategoryScreenProps>(() => import('../features/vod/VodCategoryScreen'), 'VodCategoryScreen')
export const RadioScreen = lazyRoute<RadioScreenProps>(() => import('../features/radio/RadioScreen'), 'RadioScreen')

/**
 * Rota da Rádio (feature 074) fora do `App.tsx`, que está no teto de linhas da catraca (mesmo motivo de
 * `settingsRoutes.tsx`). `undefined` = não é a Rádio; `null` = sem lista ativa não há Rádio (D-001).
 */
export function renderRadioRoute(screen: AppScreen, onBack: () => void, hasActiveSource: boolean): ReactElement | null | undefined {
  if (screen.name !== 'radio') return undefined
  return hasActiveSource ? createElement(RadioScreen, { onBack }) : null
}

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
    if (screenName === 'profiles') {
      // A escolha pode acontecer imediatamente após a tela pintar. No fallback
      // sem requestIdleCallback, adiar 500 ms deixa o Suspense visível sob
      // carga da suíte e na abertura rápida da lista; esta rota é pequena e
      // segura para aquecer já neste efeito.
      void SourceAccessRoute.preload()
      return undefined
    }
    if (screenName === 'home') return warmRoutes([VodShowcaseScreen])
    if (screenName === 'movies') return warmRoutes([VodCategoryScreen, MovieDetailScreen])
    if (screenName === 'series') return warmRoutes([VodCategoryScreen, SeriesDetailScreen])
    return undefined
  }, [screenName])
}
