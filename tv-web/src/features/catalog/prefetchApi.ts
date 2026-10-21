import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { prefetchScheduler, setPrefetchCategoryDone } from '../../lib/catalog/prefetch'
import { protectCatalogSource } from '../../lib/catalog/storageRelief'
import { subscribeCatalogReleases, touchSource } from '../../lib/catalog/storageBudget'
import { db } from '../../lib/catalog/db'
import { onScreenDocumentRefreshed } from '../../lib/catalog/screenDocument'
import { markExternalRowsForRefresh, onExternalRowRefreshed } from '../../lib/catalog/externalRows'
import { subscribeAppLanguage } from '../../lib/i18n/appLanguage'
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
 * Feature 084 (FR-006): com a tela aberta, o índice de busca (`global-search-index` e `catalog-search-index` de um
 * tipo) é remontado no máximo uma vez a cada tanto durante a pré-carga. Cada remontagem lê dezenas de milhares de
 * registros; a cada lote (até 1 por segundo) a TV não aguentaria.
 */
export const SEARCH_INDEX_REFRESH_MS = 10_000

/** `['catalog-search-index', fonte, tipo]`: o índice de busca. */
const CATALOG_INDEX_KEY_LENGTH = 3

/**
 * Consultas que percorrem o tipo inteiro e por isso têm remontagem limitada (feature 084, FR-006): o índice de busca e,
 * desde a feature 086, o índice de nomes do Top 10/Dica. A vitrine NÃO entra aqui: desde a 086 ela lê candidatos
 * guardados, é barata, e precisa acompanhar cada lote para a fileira não ficar velha com a tela aberta (FR-008).
 */
function isHeavyIndexKey(queryKey: readonly unknown[]): boolean {
  return queryKey.length === CATALOG_INDEX_KEY_LENGTH || queryKey[queryKey.length - 1] === 'discovery-entries'
}

/**
 * Invalida, agrupado, o que depende de uma categoria que acabou de chegar ao
 * aparelho (`logic/agendador-pre-carga.md` §6): a lista de categorias (o
 * número aparece no trilho), o conteúdo das categorias que chegaram, as
 * contagens e os índices de busca. Registrado uma vez, na raiz.
 */
export function createPrefetchInvalidator(queryClient: QueryClient, batchMs = INVALIDATE_BATCH_MS, refreshMs = SEARCH_INDEX_REFRESH_MS) {
  const pending = new Map<string, {
    all: Set<number>
    byKind: Map<'channel' | 'movie' | 'series', Set<number>>
  }>()
  let timer: ReturnType<typeof setTimeout> | undefined

  // Feature 084 (FR-006): por consulta de índice, quando foi remontada pela última vez e se chegou algo depois.
  const indexRefresh = new Map<string, { queryKey: readonly unknown[]; last: number; dirty: boolean; timer?: ReturnType<typeof setTimeout> }>()

  function remountIndex(id: string): void {
    const state = indexRefresh.get(id)
    if (!state) return
    state.timer = undefined
    if (!state.dirty) return
    state.dirty = false
    state.last = Date.now()
    void queryClient.refetchQueries({ queryKey: state.queryKey, exact: true, type: 'active' })
  }

  /**
   * Marca o índice como velho sem reler e remonta no máximo 1× por `refreshMs`: a 1ª chegada remonta na hora (borda de
   * entrada); as seguintes, dentro da janela, só confirmam que há algo novo e entram numa remontagem no fim dela.
   */
  function refreshIndexes(queryKeys: readonly (readonly unknown[])[]): void {
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' })
      const id = JSON.stringify(queryKey)
      const state = indexRefresh.get(id) ?? { queryKey, last: Number.NEGATIVE_INFINITY, dirty: false }
      indexRefresh.set(id, state)
      state.dirty = true
      const wait = state.last + refreshMs - Date.now()
      if (wait <= 0) {
        if (state.timer !== undefined) clearTimeout(state.timer)
        remountIndex(id)
      } else if (state.timer === undefined) {
        state.timer = setTimeout(() => remountIndex(id), wait)
      }
    }
  }

  function flush(): void {
    timer = undefined
    for (const [sourceId, pendingSource] of pending) {
      const categoryIds = new Set(pendingSource.all)
      for (const ids of pendingSource.byKind.values()) for (const id of ids) categoryIds.add(id)
      void queryClient.invalidateQueries({ queryKey: ['categories', sourceId] })
      for (const categoryId of categoryIds) {
        void queryClient.invalidateQueries({ queryKey: ['category-content', sourceId, categoryId] })
        // Feature 053: o carrossel da tela hero lê a prévia da categoria que acabou de chegar.
        void queryClient.invalidateQueries({ queryKey: ['category-preview', sourceId, categoryId] })
      }
      void queryClient.invalidateQueries({ queryKey: ['category-preview', sourceId, 'window'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog-counts', sourceId] })
      const wholeSource = pendingSource.byKind.size === 0 || pendingSource.all.size > 0
      const indexPrefixes = wholeSource
        ? [['catalog-search-index', sourceId]]
        : [...pendingSource.byKind.keys()].map((kind) => ['catalog-search-index', sourceId, kind])
      for (const prefix of indexPrefixes) {
        // A vitrine e o resto sob o prefixo seguem como sempre; o índice (3 elementos) é remontado com limite.
        void queryClient.invalidateQueries({ queryKey: prefix, predicate: (query) => !isHeavyIndexKey(query.queryKey) })
        refreshIndexes(queryClient.getQueryCache()
          .findAll({ queryKey: prefix, predicate: (query) => isHeavyIndexKey(query.queryKey) })
          .map((query) => query.queryKey))
      }
      for (const kind of pendingSource.byKind.keys()) {
        void queryClient.invalidateQueries({ queryKey: ['catalog-all-pages', sourceId, kind], refetchType: 'none' })
      }
      // Feature 039 (T022): "Todos" aos poucos. Reler uma consulta infinita relê
      // TODAS as páginas já lidas, uma por vez — com 30 páginas, a cada lote
      // (até 1 por segundo), a navegação travaria. Então: só marca como velha
      // (relida na próxima entrada, `refetchOnMount: 'always'`) e relê agora
      // apenas quem leu pouco — o caso de "Todos" ainda vazio esperando a
      // pré-carga. Categoria nova depois do que foi lido entra pelo `loadMore`.
      const allPageKeys = pendingSource.byKind.size === 0 || pendingSource.all.size > 0
        ? [['catalog-all-pages', sourceId] as const]
        : [...pendingSource.byKind.keys()].map((kind) => ['catalog-all-pages', sourceId, kind] as const)
      for (const queryKey of allPageKeys) {
        void queryClient.invalidateQueries({ queryKey, refetchType: 'none' })
        void queryClient.refetchQueries({
          queryKey,
          type: 'active',
          predicate: (query) => {
            const pages = (query.state.data as { pages?: unknown[] } | undefined)?.pages
            return (pages?.length ?? 0) <= ALL_PAGES_REFETCH_MAX
          },
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['kind-sort-fields', sourceId] })
      refreshIndexes(queryClient.getQueryCache().findAll({ queryKey: ['global-search-index', sourceId], exact: true }).map((query) => query.queryKey))
    }
    pending.clear()
  }

  return {
    categoryDone(sourceId: string, categoryId: number, kind?: 'channel' | 'movie' | 'series'): void {
      const source = pending.get(sourceId) ?? { all: new Set<number>(), byKind: new Map() }
      if (kind) {
        const ids = source.byKind.get(kind) ?? new Set<number>()
        ids.add(categoryId)
        source.byKind.set(kind, ids)
      } else {
        source.all.add(categoryId)
      }
      pending.set(sourceId, source)
      if (timer === undefined) timer = setTimeout(flush, batchMs)
    },
    dispose(): void {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      pending.clear()
      for (const state of indexRefresh.values()) if (state.timer !== undefined) clearTimeout(state.timer)
      indexRefresh.clear()
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
    const unsubscribe = subscribeCatalogReleases((sourceId, categoryIds) => categoryIds.forEach((id) => invalidator.categoryDone(sourceId, id)))
    // Feature 086 (T081/FR-008): a abertura aceita o documento de tela vencido de propósito — é o que a mantém rápida
    // sob carga. Quando a fila de 2º plano o refaz, a vitrine daquele tipo relê, e só ela: sem isto o conteúdo novo
    // apareceria apenas se a pessoa saísse e voltasse.
    const unsubscribeDocument = onScreenDocumentRefreshed((sourceId, kind) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-search-index', sourceId, kind, 'showcase'] })
    })
    // Feature 087 (T028/FR-006): o mesmo para o Top 10 e a Dica. A invalidação da pré-carga depende de uma categoria
    // chegar, e o produtor roda quando não há mais nenhuma a chegar — sem este aviso a fileira só entraria na próxima
    // visita. Invalida só a chave daquele tipo: o foco e a rolagem ficam onde estão.
    const unsubscribeExternal = onExternalRowRefreshed((sourceId, kind) => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-search-index', sourceId, kind, 'external'] })
    })
    // Feature 087 (FR-012): trocar o idioma **mantém** a fileira na tela com o resultado anterior e marca para refazer.
    // A assimetria com remover a chave é deliberada: trocar o idioma não é pedido para esvaziar nada.
    const unsubscribeLanguage = subscribeAppLanguage(() => {
      void markExternalRowsForRefresh().then(() => {
        prefetchScheduler.wake()
      })
    })
    return () => {
      setPrefetchCategoryDone(undefined)
      invalidator.dispose()
      unsubscribe()
      unsubscribeDocument()
      unsubscribeExternal()
      unsubscribeLanguage()
    }
  }, [queryClient])

  useEffect(() => {
    // A lista ativa nunca perde cache quando uma gravação crítica precisa liberar espaço.
    protectCatalogSource(sourceId ?? undefined)
    if (sourceId) touchSource(sourceId, Date.now(), db)
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
