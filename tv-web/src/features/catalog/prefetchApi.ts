import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { prefetchScheduler, setPrefetchCategoryDone } from '../../lib/catalog/prefetch'
import type { PrefetchHint } from '../../lib/catalog/prefetch/prefetchOrder'
import type { PrefetchProgress } from '../../lib/catalog/prefetch/prefetchScheduler'

// Telas falam com `features/catalog`, nunca com `lib/` direto (D-001 da 005).
export type { PrefetchHint, PrefetchProgress }

/** Estado da pré-carga para a linha do Início (feature 038, US6). Só memória, nunca disco. */
export function usePrefetchProgress(): PrefetchProgress {
  return useSyncExternalStore(prefetchScheduler.subscribe, prefetchScheduler.getProgress)
}

/**
 * Diz à pré-carga onde a pessoa está (FR-005/FR-011). Só reordena a fila —
 * nenhuma consulta nasce daqui. Desmontar a tela limpa a dica.
 */
export function usePrefetchHint(kind: PrefetchHint['kind'], focusedCategoryId: number | undefined): void {
  useEffect(() => {
    prefetchScheduler.setHint({ kind, focusedCategoryId })
  }, [kind, focusedCategoryId])
  useEffect(() => () => prefetchScheduler.setHint(undefined), [])
}

/** Uma rodada de invalidação a cada tanto, no máximo (D-014). */
export const INVALIDATE_BATCH_MS = 1000

/** "Todos" com até tantas páginas lidas é relido na hora quando uma categoria chega. */
export const ALL_PAGES_REFETCH_MAX = 2

/**
 * Invalida, agrupado, o que depende de uma categoria que acabou de chegar ao
 * aparelho (`logic/agendador-pre-carga.md` §6): a lista de categorias (o
 * número aparece no trilho), o conteúdo das categorias que chegaram, as
 * contagens e os índices de busca. Registrado uma vez, na raiz.
 */
export function createPrefetchInvalidator(queryClient: QueryClient, batchMs = INVALIDATE_BATCH_MS) {
  const pending = new Map<string, Set<number>>()
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush(): void {
    timer = undefined
    for (const [sourceId, categoryIds] of pending) {
      void queryClient.invalidateQueries({ queryKey: ['categories', sourceId] })
      for (const categoryId of categoryIds) {
        void queryClient.invalidateQueries({ queryKey: ['category-content', sourceId, categoryId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['catalog-counts', sourceId] })
      void queryClient.invalidateQueries({ queryKey: ['catalog-search-index', sourceId] })
      // Feature 039 (T022): "Todos" aos poucos. Reler uma consulta infinita relê
      // TODAS as páginas já lidas, uma por vez — com 30 páginas, a cada lote
      // (até 1 por segundo), a navegação travaria. Então: só marca como velha
      // (relida na próxima entrada, `refetchOnMount: 'always'`) e relê agora
      // apenas quem leu pouco — o caso de "Todos" ainda vazio esperando a
      // pré-carga. Categoria nova depois do que foi lido entra pelo `loadMore`.
      void queryClient.invalidateQueries({ queryKey: ['catalog-all-pages', sourceId], refetchType: 'none' })
      void queryClient.refetchQueries({
        queryKey: ['catalog-all-pages', sourceId],
        type: 'active',
        predicate: (query) => {
          const pages = (query.state.data as { pages?: unknown[] } | undefined)?.pages
          return (pages?.length ?? 0) <= ALL_PAGES_REFETCH_MAX
        },
      })
      void queryClient.invalidateQueries({ queryKey: ['kind-sort-fields', sourceId] })
      void queryClient.invalidateQueries({ queryKey: ['global-search-index', sourceId] })
    }
    pending.clear()
  }

  return {
    categoryDone(sourceId: string, categoryId: number): void {
      const set = pending.get(sourceId) ?? new Set<number>()
      set.add(categoryId)
      pending.set(sourceId, set)
      if (timer === undefined) timer = setTimeout(flush, batchMs)
    },
    dispose(): void {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      pending.clear()
    },
  }
}

/**
 * Liga a pré-carga à fonte ativa (D-010): começa ao escolher a lista, para ao
 * sair dela, e invalida as consultas quando uma categoria chega. Só na raiz.
 */
export function usePrefetchForSource(sourceId: string | null): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const invalidator = createPrefetchInvalidator(queryClient)
    setPrefetchCategoryDone(invalidator.categoryDone)
    return () => {
      setPrefetchCategoryDone(undefined)
      invalidator.dispose()
    }
  }, [queryClient])

  useEffect(() => {
    if (sourceId) prefetchScheduler.start(sourceId)
    else prefetchScheduler.stop()
  }, [sourceId])
}

/** Uma atualização da lista ativa terminou: a estrutura pode ter mudado. */
export function wakePrefetch(): void {
  prefetchScheduler.wake()
}

/** Entrada numa categoria vencida: a renovação passa para a frente da fila (FR-026). */
export function prioritizeCategory(categoryId: number): void {
  prefetchScheduler.prioritize(categoryId)
}
