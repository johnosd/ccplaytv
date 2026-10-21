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
import { convertNextBlock, hasOrphanCategories, releaseLegacyGuides, repairOrphanCategories } from '../blockConversion'
import { isAbortError } from '../xtreamConnector'
import { createActivityGate } from './activityGate'
import { createPrefetchScheduler, IDLE_AFTER_KEY_MS, type PrefetchRunOutcome } from './prefetchScheduler'
import { runSectionLoad } from '../sectionRunner'
import { listVisibleCategories } from '../categoryAccess'
import { hasStorageHeadroom } from '../storageRelief'
import { fillNextCandidates } from '../showcaseCandidates'
import { refreshMissingScreenDocuments } from '../screenDocument'

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
  // Bug `armazenamento-app-cheio-na-tv-impede`: para ANTES de encher, guardando folga para licença, pareamento e
  // estado da pessoa (antes só parava depois do `QuotaExceededError`, com o banco já cheio).
  if (!(await hasStorageHeadroom())) return 'storage_full'
  // Duas tentativas só por causa de cancelamento: a busca pode ter sido
  // compartilhada (`dedup`) com uma pré-busca por foco que o cursor abandonou
  // e abortou (R-004) — isso não é falha da categoria.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await ensureCategory(sourceId, category, { renew: true, budgetMode: 'prefetch' })
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

/** Reparo de órfãs bloqueado pela cota: tenta de novo a cada 5 s por até 3 min (depois, na rodada normal). */
const ORPHAN_RETRY_MS = 3 * 60_000
const ORPHAN_RETRY_DELAY_MS = 5_000
let orphanBlockedSince: number | undefined

async function housekeeping(sourceId: string): Promise<boolean> {
  const moreToConvert = await convertLegacyCategories(sourceId, {
    maxCategories: 1,
    onConverted: (categoryId) => onCategoryDone?.(sourceId, categoryId),
  })
  if (moreToConvert) return true
  // Feature 082 (D-004): apaga as projeções 065 (nunca prepara projeção nova) — antes de converter, porque apagar é o
  // que abre espaço num banco cheio.
  if (await prepareMissingReadModels(sourceId)) return true
  // Feature 082 (FR-006): bloco antigo → formato comprimido, uma categoria por vez (ids iguais; a tela relê).
  if (await convertNextBlock(sourceId, { onConverted: (owner, categoryId) => onCategoryDone?.(owner, categoryId) })) return true
  // Feature 086 (T029): candidatos das fileiras de uma categoria já gravada antes desta feature — uma por vez, aqui, para
  // a abertura da tela nunca pagar essa conta. Sem isto, uma lista que já estava no aparelho ficaria sem as fileiras.
  if (await fillNextCandidates(sourceId)) return true
  // Feature 086 (T071): o documento de tela que falta é refeito aqui — nunca na abertura da tela. Com ele, a próxima
  // abertura lê um registro do `localStorage` (p95 0,8 ms sob carga na TV) em vez de mesclar os candidatos.
  if (await refreshMissingScreenDocuments(sourceId)) return true
  // Feature 082: categorias liberadas com o banco cheio (carimbadas sem itens) — depois de converter, que é o que
  // libera espaço; o reparo precisa gravar.
  const repair = await repairOrphanCategories()
  if (repair === 'repaired') return true
  // Ainda acima da cota: o guia em linhas é o que mais ocupa e o mais barato de refazer.
  if (repair === 'blocked' && (await releaseLegacyGuides())) return true
  if (repair === 'blocked' && Date.now() - (orphanBlockedSince ??= Date.now()) < ORPHAN_RETRY_MS) {
    // O espaço apagado ainda não voltou para gravar (na TV, ~70 s): tenta de novo logo, sem esperar os 10 min do agendador.
    await new Promise((resolve) => setTimeout(resolve, ORPHAN_RETRY_DELAY_MS))
    return true
  }
  if (repair !== 'blocked') orphanBlockedSince = undefined
  // Preparo que sobrou de outra lista (carga interrompida e troca de lista):
  // só as chaves são lidas; sem sobra, não custa nada.
  if (await clearStagedItemsOfOtherSources(sourceId)) return true
  return collectStaleGenerations(sourceId)
}

/**
 * Feature 082: sem espaço, a limpeza (apagar a projeção 065, converter para o formato comprimido, gerações velhas) é o
 * que abre espaço num aparelho cheio de dados antigos — a TV de 2026-10-18 ficou acima da cota assim. Antes de o
 * agendador PARAR por `storage_full` (e com ele a própria limpeza), roda uma parte dela: se limpou algo, a categoria
 * volta como `failed` (tentada de novo depois); só sem nada a limpar o `storage_full` chega ao agendador.
 */
async function cleanBeforeStopping(sourceId: string, outcome: PrefetchRunOutcome): Promise<PrefetchRunOutcome> {
  if (outcome !== 'storage_full') return outcome
  if (await housekeeping(sourceId).catch(() => false)) return 'failed'
  // Apagou, mas o espaço ainda não voltou para gravar (R-002: na TV demora ~70 s): não para — a categoria vira
  // tentativa (no máximo 3) e o agendador, ao acabar, segue chamando a limpeza, que conserta as órfãs quando couber.
  return (await hasOrphanCategories().catch(() => false)) ? 'failed' : 'storage_full'
}

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
  runCategory: async (sourceId, categoryId) => cleanBeforeStopping(sourceId, await runCategory(sourceId, categoryId)),
  gate: prefetchGate,
  scope: PREFETCH_SCOPE,
  onCategoryDone: (sourceId, categoryId, kind) => onCategoryDone?.(sourceId, categoryId, kind),
  // Com o mesmo portão, uma parte por chamada: primeiro a conversão do formato
  // antigo para blocos (feature 039, FR-008/FR-012 — uma categoria por vez,
  // avisando a tela porque os ids mudam, R-003), depois a limpeza das gerações
  // que não servem mais (D-008). `true` = ainda há trabalho; o agendador chama de novo.
  housekeeping,
  // Seção inteira num Worker (R0-3): um pedido por seção em vez de um por
  // categoria; a gravação pausa sempre que o portão fecha.
  // Renovação pedida por uma atualização (`urgent`) não cede à tecla — bug
  // `abrir-app-nao-atualiza-todas-categorias`; player, app oculto e rede seguem pausando.
  runSection: async (sourceId, kind, categoryIds, { signal, onCategory, urgent }) =>
    cleanBeforeStopping(sourceId, await runSectionLoad(sourceId, kind, categoryIds, {
      signal,
      onCategory,
      isBlocked: () => prefetchGate.blockReason(Date.now(), IDLE_AFTER_KEY_MS, urgent) !== undefined,
    })),
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
