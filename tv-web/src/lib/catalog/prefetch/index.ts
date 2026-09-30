/**
 * Instâncias reais da pré-carga (feature 038, `logic/agendador-pre-carga.md`
 * §3/§4): o portão ligado aos eventos do navegador e o agendador ligado ao
 * catálogo. Os testes de contrato usam as fábricas (`createActivityGate`,
 * `createPrefetchScheduler`), nunca este módulo.
 */

import { collectStaleGenerations, listCategories } from '../catalogRepository'
import { ensureCategory } from '../categoryLoader'
import { isAbortError } from '../xtreamConnector'
import { createActivityGate } from './activityGate'
import { createPrefetchScheduler, type PrefetchRunOutcome } from './prefetchScheduler'

export const prefetchGate = createActivityGate()

/**
 * Recuo do FR-014: trocar para `'neighborhood'` se a medição na TV mostrar que
 * a pré-carga do catálogo inteiro degrada a navegação (SC-003).
 */
export const PREFETCH_SCOPE: 'full' | 'neighborhood' = 'full'

async function runCategory(sourceId: string, categoryId: number): Promise<PrefetchRunOutcome> {
  const category = (await listCategories(sourceId)).find((candidate) => candidate.id === categoryId)
  // Saiu numa atualização: nada a fazer, e não é falha.
  if (!category) return 'done'
  // Duas tentativas só por causa de cancelamento: a busca pode ter sido
  // compartilhada (`dedup`) com uma pré-busca por foco que o cursor abandonou
  // e abortou (R-004) — isso não é falha da categoria.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await ensureCategory(sourceId, category, { renew: true })
      if (result.reason === 'storage_full') return 'storage_full'
      return result.outcome === 'fetched' || result.outcome === 'fresh' ? 'done' : 'failed'
    } catch (error) {
      if (!isAbortError(error)) return 'failed'
    }
  }
  return 'failed'
}

let onCategoryDone: ((sourceId: string, categoryId: number) => void) | undefined

export const prefetchScheduler = createPrefetchScheduler({
  loadCategories: async (sourceId) =>
    (await listCategories(sourceId)).map((category) => ({
      id: category.id,
      kind: category.kind,
      order: category.order,
      fetchMode: category.fetchMode,
      itemsFetchedAt: category.itemsFetchedAt,
      renewRequestedAt: category.renewRequestedAt,
    })),
  runCategory,
  gate: prefetchGate,
  scope: PREFETCH_SCOPE,
  onCategoryDone: (sourceId, categoryId) => onCategoryDone?.(sourceId, categoryId),
  // Limpeza em partes das gerações que não servem mais (D-008), com o mesmo portão.
  housekeeping: (sourceId) => collectStaleGenerations(sourceId),
})

/** A raiz do app registra quem invalida as consultas quando uma categoria chega (D-014). */
export function setPrefetchCategoryDone(listener: ((sourceId: string, categoryId: number) => void) | undefined): void {
  onCategoryDone = listener
}

// Portão ligado ao navegador, uma vez só, na carga do módulo.
if (typeof window !== 'undefined') {
  // `window`, fase de captura, passivo: roda antes dos ouvintes de `document`
  // que um `Modal` corta com `stopImmediatePropagation`, e nunca interfere.
  window.addEventListener('keydown', () => prefetchGate.noteKey(Date.now()), { capture: true, passive: true })
  window.addEventListener('online', () => prefetchGate.setOnline(true))
  window.addEventListener('offline', () => prefetchGate.setOnline(false))
  if (typeof navigator !== 'undefined' && navigator.onLine === false) prefetchGate.setOnline(false)
}
if (typeof document !== 'undefined') {
  const syncVisibility = () => prefetchGate.setHidden(document.visibilityState === 'hidden')
  document.addEventListener('visibilitychange', syncVisibility)
  syncVisibility()
}
