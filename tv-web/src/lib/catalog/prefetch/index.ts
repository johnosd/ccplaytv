/**
 * Instâncias reais da pré-carga (feature 038, `logic/agendador-pre-carga.md`
 * §3/§4): o portão ligado aos eventos do navegador e o agendador ligado ao
 * catálogo. Os testes de contrato usam as fábricas (`createActivityGate`,
 * `createPrefetchScheduler`), nunca este módulo.
 */

import { clearStagedItemsOfOtherSources, collectStaleGenerations, listCategories, type CatalogCategory } from '../catalogRepository'
import { ensureCategory } from '../categoryLoader'
import { convertLegacyCategories } from '../categoryBlocks'
import { prepareMissingReadModels } from '../categoryWindow'
import { isAbortError } from '../xtreamConnector'
import { createActivityGate } from './activityGate'
import { createPrefetchScheduler, IDLE_AFTER_KEY_MS, type PrefetchRunOutcome } from './prefetchScheduler'
import { runSectionLoad } from '../sectionRunner'
import { listVisibleCategories } from '../categoryAccess'

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
      if (result.reason === 'rate_limited') return 'rate_limited'
      return result.outcome === 'fetched' || result.outcome === 'fresh' ? 'done' : 'failed'
    } catch (error) {
      if (!isAbortError(error)) return 'failed'
    }
  }
  return 'failed'
}

let onCategoryDone: ((sourceId: string, categoryId: number, kind?: 'channel' | 'movie' | 'series') => void) | undefined

export const prefetchScheduler = createPrefetchScheduler({
  // Feature 066: escondidas não gastam rede nem disco; bloqueadas continuam (o desbloqueio abre na hora).
  loadCategories: async (sourceId) =>
    (await listVisibleCategories(sourceId)).map((category) => ({
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
  onCategoryDone: (sourceId, categoryId, kind) => onCategoryDone?.(sourceId, categoryId, kind),
  // Com o mesmo portão, uma parte por chamada: primeiro a conversão do formato
  // antigo para blocos (feature 039, FR-008/FR-012 — uma categoria por vez,
  // avisando a tela porque os ids mudam, R-003), depois a limpeza das gerações
  // que não servem mais (D-008). `true` = ainda há trabalho; o agendador chama de novo.
  housekeeping: async (sourceId) => {
    const moreToConvert = await convertLegacyCategories(sourceId, {
      maxCategories: 1,
      onConverted: (categoryId) => onCategoryDone?.(sourceId, categoryId),
    })
    if (moreToConvert) return true
    // Feature 065: janela de leitura das categorias grandes de catálogos anteriores às projeções.
    if (await prepareMissingReadModels(sourceId)) return true
    // Preparo que sobrou de outra lista (carga interrompida e troca de lista):
    // só as chaves são lidas; sem sobra, não custa nada.
    if (await clearStagedItemsOfOtherSources(sourceId)) return true
    return collectStaleGenerations(sourceId)
  },
  // Seção inteira num Worker (R0-3): um pedido por seção em vez de um por
  // categoria; a gravação pausa sempre que o portão fecha.
  // Renovação pedida por uma atualização (`urgent`) não cede à tecla — bug
  // `abrir-app-nao-atualiza-todas-categorias`; player, app oculto e rede seguem pausando.
  runSection: (sourceId, kind, categoryIds, { signal, onCategory, urgent }) =>
    runSectionLoad(sourceId, kind, categoryIds, {
      signal,
      onCategory,
      isBlocked: () => prefetchGate.blockReason(Date.now(), IDLE_AFTER_KEY_MS, urgent) !== undefined,
    }),
})

/**
 * Entrada numa categoria com renovação pendente (bug
 * `categoria-aberta-nao-mostra-itens-novos`): renova **essa** categoria na
 * hora, por fora da fila. Na TV a fila pode passar minutos presa numa carga
 * por seção (pausada a cada tecla), e a categoria aberta ficava com os itens
 * de antes. Uma busca só da categoria (`dedup` por id), sem esperar o portão
 * — entrar é ação explícita, como a entrada numa categoria fria. Só um
 * `fetched` avisa a tela: sem isso, nada muda no disco e reler não adianta.
 */
export async function renewCategoryNow(sourceId: string, category: CatalogCategory): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await ensureCategory(sourceId, category, { renew: true })
      if (result.outcome === 'fetched') onCategoryDone?.(sourceId, category.id, category.kind)
      return
    } catch (error) {
      // Compartilhada (`dedup`) com uma pré-busca por foco que foi abortada: tenta de novo.
      if (!isAbortError(error)) return
    }
  }
}

/** A raiz do app registra quem invalida as consultas quando uma categoria chega (D-014). */
export function setPrefetchCategoryDone(listener: ((sourceId: string, categoryId: number, kind?: 'channel' | 'movie' | 'series') => void) | undefined): void {
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
