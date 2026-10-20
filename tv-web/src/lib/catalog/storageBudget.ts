/**
 * Orçamento de armazenamento do catálogo (feature 082, `logic/orcamento.md`).
 *
 * A TV dá 80 MiB FIXOS de cota ao app (sondas de 2026-10-18: `quota` = 83 886 080; `unlimitedstorage`, `persist()` e
 * `requestQuota` não mudam nada; OPFS/Cache/Web SQL dividem a mesma cota). O catálogo e o guia
 * ficam sob um teto (cota − reserva); a reserva é do estado da pessoa e das gravações críticas. Antes de gravar mais
 * catálogo, o app libera o que pode ser refeito, do menos ao mais caro e do usado há mais tempo ao mais recente — nunca
 * estado da pessoa, nunca categoria `eager`/`stored` (M3U, fora da 082), nunca o que está em uso agora.
 */
import { db, type CatalogDb, type CategoryRecord } from './db'
import { catalogLedger } from './storageLedger'
import { pinnedUserCategories, releaseCandidate, releaseCandidates } from './storageRelease'
import { readStorageEstimate } from './storageRelief'

const MB = 1024 * 1024

/** Reserva mínima e fração da cota (provisórias — calibrar com a medição da Fase 1, R-003). */
export const BUDGET_RESERVE_MIN_BYTES = 12 * MB
export const BUDGET_RESERVE_RATIO = 0.15
/** Cota assumida quando a TV não informa (`navigator.storage.estimate` ausente): a da TV de referência. */
export const FALLBACK_QUOTA_BYTES = 80 * MB
/** Categoria usada há menos que isto não sai (é a que está na tela, no detalhe ou no player). */
export const PIN_WINDOW_MS = 10 * 60 * 1000

/** Quem pede espaço: a entrada da pessoa pode liberar categorias da lista ativa; a pré-carga e o guia, nunca. */
export type BudgetMode = 'entry' | 'prefetch'

/** Do mais barato ao mais caro (`logic/orcamento.md` §3). */
export type ReleaseScope = 'temporary' | 'inactive-list' | 'active-category'

export interface ReleaseCandidate {
  key: string
  scope: ReleaseScope
  sourceId?: string
  categoryId?: number
  /** Bytes gravados (conta própria, `storageLedger.ts`): pedaços comprimidos + cabeçalhos. */
  bytes: number
  /** Último uso (lista ativada / categoria aberta); 0 = nunca. */
  lastUsedAt: number
  /** `false` para o que não volta pela rede (categoria `eager`/`stored`). */
  refetchable: boolean
  /** Em uso agora (janela `PIN_WINDOW_MS`, ou protegida pelo chamador). */
  pinned: boolean
}

export interface BudgetState {
  /** Teto do catálogo + guia. */
  capBytes: number
  /** Total contabilizado do catálogo + guia agora. */
  ledgerBytes: number
  /** O que o navegador informa (pode atrasar depois de apagar — R-002). `limit` = cota − reserva. */
  reported?: { usage: number; limit: number }
}

/** Sobrescritas de teste/medição; em produção o teto vem da cota informada (80 MiB fixos na TV de referência). */
export interface StorageBudgetConfig {
  capBytes?: number
}
type ReleaseListener = (sourceId: string, categoryIds: number[]) => void
const releaseListeners = new Set<ReleaseListener>()
export function subscribeCatalogReleases(listener: ReleaseListener): () => void { releaseListeners.add(listener); return () => releaseListeners.delete(listener) }

/** Opções de orçamento de quem grava catálogo (`ensureCategory`): a entrada (padrão) pode liberar a lista ativa. */
export interface BudgetOptions {
  budgetMode?: BudgetMode
  budget?: StorageBudgetConfig
}

export function storageReserveBytes(quotaBytes: number): number {
  return Math.max(BUDGET_RESERVE_MIN_BYTES, quotaBytes * BUDGET_RESERVE_RATIO)
}

export function catalogCapBytes(quotaBytes: number): number {
  return Math.max(0, quotaBytes - storageReserveBytes(quotaBytes))
}

/**
 * Escolhe o que liberar para caber `needBytes` (`logic/orcamento.md` §3). Puro: não toca o banco.
 * Devolve na ordem em que deve ser liberado; pode devolver menos que o necessário (o chamador decide `storage_full`).
 */
export function planStorageRelease(
  state: BudgetState,
  needBytes: number,
  candidates: readonly ReleaseCandidate[],
  mode: BudgetMode,
): ReleaseCandidate[] {
  const excess = state.ledgerBytes + needBytes - state.capBytes
  const eligible = candidates.filter((candidate) => !candidate.pinned && candidate.refetchable && (mode === 'entry' || candidate.scope !== 'active-category'))
  const ordered = [...eligible].sort((a, b) => {
    const scope = { temporary: 0, 'inactive-list': 1, 'active-category': 2 }
    return scope[a.scope] - scope[b.scope] || a.lastUsedAt - b.lastUsedAt
  })
  if (excess > 0) {
    const selected: ReleaseCandidate[] = []
    let released = 0
    for (const candidate of ordered) {
      selected.push(candidate)
      released += candidate.bytes
      if (released >= excess) break
    }
    return selected
  }
  if (state.reported && state.reported.usage + needBytes > state.reported.limit) return ordered.slice(0, 1)
  return []
}

/**
 * Garante espaço no teto antes de gravar `needBytes` de catálogo/guia da lista `sourceId` (`logic/orcamento.md` §4):
 * monta os candidatos, planeja, libera um por transação e devolve se coube. **Nunca lança**: sem conseguir fazer a conta,
 * devolve `fits: true` e a gravação segue (o caminho normal de quota decide).
 */
export async function makeRoomFor(
  sourceId: string,
  needBytes: number,
  options: { database?: CatalogDb; now?: number; mode: BudgetMode; protectCategoryId?: number; config?: StorageBudgetConfig },
): Promise<{ fits: boolean; released: ReleaseCandidate[] }> {
  const database = options.database ?? db
  const now = options.now ?? Date.now()
  try {
    const ledger = await catalogLedger(database)
    const reported = await readStorageEstimate()
    const quota = reported?.quota ?? FALLBACK_QUOTA_BYTES
    const capBytes = options.config?.capBytes ?? catalogCapBytes(quota)
    const state: BudgetState = {
      capBytes,
      ledgerBytes: ledger.total,
      // Guarda do navegador (R-002): o uso físico inclui o estado da pessoa; o limite é cota − reserva.
      ...(reported && !options.config?.capBytes ? { reported: { usage: reported.usage, limit: catalogCapBytes(quota) } } : {}),
    }
    const context = {
      activeSourceId: sourceId,
      protectCategoryId: options.protectCategoryId,
      ledger,
      lastUsedOf: (category: CategoryRecord) => Math.max(category.lastUsedAt ?? 0, touched.get(touchKey(database, category.id as number)) ?? 0),
      isRecent: (category: CategoryRecord) => now - Math.max(category.lastUsedAt ?? 0, touched.get(touchKey(database, category.id as number)) ?? 0) < PIN_WINDOW_MS,
    }
    let candidates = await releaseCandidates(database, context)
    let plan = planStorageRelease(state, needBytes, candidates, options.mode)
    // Favoritos e "Continuar assistindo" só custam a resolução quando o plano chegaria à lista ativa (A-01).
    if (plan.some((candidate) => candidate.scope === 'active-category')) {
      const pinnedCategoryIds = await pinnedUserCategories(database, sourceId)
      candidates = candidates.map((candidate) => candidate.categoryId !== undefined && pinnedCategoryIds.has(candidate.categoryId)
        ? { ...candidate, pinned: true } : candidate)
      plan = planStorageRelease(state, needBytes, candidates, options.mode)
    }
    const released: ReleaseCandidate[] = []
    let freed = 0
    for (const candidate of plan) {
      const notice = await releaseCandidate(database, candidate, sourceId)
      released.push(candidate)
      freed += candidate.bytes
      if (notice && notice[1].length > 0) for (const listener of releaseListeners) listener(notice[0], notice[1])
    }
    return { fits: ledger.total - freed + needBytes <= capBytes, released }
  } catch {
    return { fits: true, released: [] }
  }
}

const touched = new Map<string, number>()
const touchKey = (database: CatalogDb, categoryId: number) => `${database.name}:${categoryId}`

/** Marca o uso de uma categoria (entrada, detalhe, player) — memória já; disco no máximo 1×/h (`logic/orcamento.md` §5). */
export function touchCategory(categoryId: number, now: number, database: CatalogDb = db): void {
  const key = touchKey(database, categoryId)
  const last = touched.get(key)
  touched.set(key, now)
  if (last !== undefined && now - last < 60 * 60 * 1000) return
  void database.categories.update(categoryId, { lastUsedAt: now }).catch(() => undefined)
}

/** A lista virou a ativa (ordem de liberação das inativas: a ativada há mais tempo sai primeiro). */
export function touchSource(sourceId: string, now: number, database: CatalogDb = db): void {
  void database.sources.update(sourceId, { lastActivatedAt: now }).catch(() => undefined)
}
