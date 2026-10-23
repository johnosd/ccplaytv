import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { relockSession, subscribeCategoryAccess } from '../../lib/catalog/categoryAccess'
import { syncPinHints } from '../../lib/parental/listPin'

/**
 * Consultas que mostram itens ou categorias do catálogo (feature 066, D-005) — prefixo de chave, sem `sourceId`. Lista
 * tirada das chaves reais (`grep "queryKey: \['"`), não do `logic/`: faltar uma é item escondido/bloqueado na tela.
 */
const CATALOG_QUERY_KEYS = [
  'categories',
  'category-content',
  'category-preview',
  'catalog-all-pages',
  'catalog-search-index',
  'global-search-index',
  'catalog-item',
  'kind-sort-fields',
  'favorites-content',
  'history-content',
  'history-summary',
  'continue-watching',
  'my-list-content',
  'home-hero',
  'because-seed',
  'because-items',
  'similar-titles',
  'person-titles',
  'series-episodes',
  'cached-title-view',
]

/** `reset`, não `invalidate`: invalidar deixa o dado velho na tela até a releitura — o bloqueado continuaria visível. */
export function resetCatalogQueries(queryClient: QueryClient): void {
  for (const key of CATALOG_QUERY_KEYS) void queryClient.resetQueries({ queryKey: [key] })
}

/**
 * Acesso às categorias acompanha o app (feature 066, `logic/acesso-categorias.md` §5): qualquer mudança (preferência,
 * PIN, desbloqueio, rebloqueio) refaz as consultas do catálogo; ir para segundo plano e trocar de lista rebloqueiam.
 * Montado uma vez, em `App.tsx`.
 */
export function useCategoryAccessLifecycle(activeSourceId: string | null): void {
  const queryClient = useQueryClient()

  useEffect(() => subscribeCategoryAccess(() => resetCatalogQueries(queryClient)), [queryClient])

  // Realinha o espelho síncrono de "lista tem PIN" com o IndexedDB ao abrir o app (R-013 da 066, R-006 da 067).
  useEffect(() => {
    void syncPinHints()
  }, [])

  // FR-015: trocar de lista (inclusive voltar para a mesma depois de outra) fecha a sessão desbloqueada.
  useEffect(() => {
    relockSession()
  }, [activeSourceId])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') relockSession()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
}
