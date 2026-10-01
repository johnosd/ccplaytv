/**
 * Ordem da pré-carga em segundo plano (feature 038, FR-005/FR-007,
 * `sdd/specs/038-carga-listas-pre-carga/logic/agendador-pre-carga.md` §2).
 *
 * Função pura: recebe o estado das categorias e a dica de onde a pessoa está,
 * devolve a próxima categoria a obter — nunca toca disco, rede ou relógio
 * (o instante vem injetado, mesma disciplina de `freshness.ts`).
 */

import type { CatalogFetchMode, CategoryKind } from '../db'
import { isCategoryFresh } from '../freshness'

/** O que a ordem precisa saber de uma categoria — nada além disto. */
export interface PrefetchCategoryState {
  id: number
  kind: CategoryKind
  /** Posição na ordem declarada pela fonte (a mesma de `listCategories`). */
  order: number
  fetchMode: CatalogFetchMode
  /** Instante da última obtenção dos itens. `undefined` = nunca obtida (fria). */
  itemsFetchedAt?: number
  /**
   * Instante da última atualização de estrutura que pediu renovação desta
   * categoria (feature 038, FR-025). Renovação pendente quando é maior que
   * `itemsFetchedAt`.
   */
  renewRequestedAt?: number
}

/** Onde a pessoa está agora — só reordena a fila, nunca dispara nada sozinha (FR-011). */
export interface PrefetchHint {
  kind: CategoryKind
  /** Categoria em foco na navegação lateral daquela seção, se houver. */
  focusedCategoryId?: number
}

export interface PickNextInput {
  categories: readonly PrefetchCategoryState[]
  hint?: PrefetchHint
  /** Falhas desta sessão por categoria (FR-007). */
  attempts: ReadonlyMap<number, number>
  now: number
  /**
   * Recuo do FR-014: `'neighborhood'` limita a escolha à focada e às vizinhas
   * (níveis T0/T1). Padrão `'full'` — o catálogo inteiro.
   */
  scope?: 'full' | 'neighborhood'
}

/** Quantas categorias para cada lado da focada contam como "vizinhas" (FR-005). */
export const NEIGHBOR_RADIUS = 3

/** Falhas por categoria numa sessão antes de a pré-carga desistir dela (FR-007). */
export const MAX_ATTEMPTS_PER_SESSION = 3

/** Canais → Filmes → Séries fora da seção em que a pessoa está (FR-005). */
export const SECTION_ORDER: readonly CategoryKind[] = ['channel', 'movie', 'series']

export type PrefetchWork = 'cold' | 'renew'

/** Se a categoria precisa de trabalho agora, e de que tipo. `eager` nunca precisa. */
export function workNeeded(category: PrefetchCategoryState, now: number): PrefetchWork | undefined {
  if (category.fetchMode === 'eager') return undefined
  if (category.itemsFetchedAt === undefined) return 'cold'
  if (category.renewRequestedAt !== undefined && category.renewRequestedAt > category.itemsFetchedAt) return 'renew'
  // `stored` não vence por idade: vem de um arquivo que só muda numa atualização.
  if (category.fetchMode === 'on_demand' && !isCategoryFresh(category.itemsFetchedAt, now)) return 'renew'
  return undefined
}

interface Candidate {
  category: PrefetchCategoryState
  work: PrefetchWork
}

const byOrder = (a: Candidate, b: Candidate) => a.category.order - b.category.order

/** Dentro de um nível, frias antes de renovações, mantendo a ordem de chegada. */
function coldFirst(tier: Candidate[]): Candidate[] {
  return [...tier.filter((c) => c.work === 'cold'), ...tier.filter((c) => c.work === 'renew')]
}

/** A próxima categoria a obter, ou `undefined` quando não há nada a fazer. */
export function pickNextCategory(input: PickNextInput): number | undefined {
  const { categories, hint, attempts, now } = input
  const scope = input.scope ?? 'full'

  const candidates: Candidate[] = []
  for (const category of categories) {
    const work = workNeeded(category, now)
    if (!work) continue
    if ((attempts.get(category.id) ?? 0) >= MAX_ATTEMPTS_PER_SESSION) continue
    candidates.push({ category, work })
  }
  if (candidates.length === 0) return undefined

  const tiers: Candidate[][] = []
  const placed = new Set<number>()
  const take = (tier: Candidate[]) => {
    const fresh = tier.filter((c) => !placed.has(c.category.id))
    for (const c of fresh) placed.add(c.category.id)
    if (fresh.length > 0) tiers.push(coldFirst(fresh))
  }

  if (hint) {
    // Posição na lista da seção (ordenada pela fonte), não o `order` cru: o
    // raio de vizinhança conta categorias, e `order` pode ter buracos.
    const section = categories.filter((c) => c.kind === hint.kind).sort((a, b) => a.order - b.order)
    const positionOf = new Map(section.map((c, index) => [c.id, index]))
    const focusedPosition = hint.focusedCategoryId !== undefined ? positionOf.get(hint.focusedCategoryId) : undefined
    const inSection = candidates.filter((c) => c.category.kind === hint.kind).sort(byOrder)

    if (focusedPosition !== undefined) {
      // T0: a focada.
      take(inSection.filter((c) => c.category.id === hint.focusedCategoryId))
      // T1: vizinhas por distância; no empate, a de baixo antes da de cima.
      const neighbors = inSection
        .map((c) => ({ c, distance: (positionOf.get(c.category.id) ?? 0) - focusedPosition }))
        .filter(({ distance }) => distance !== 0 && Math.abs(distance) <= NEIGHBOR_RADIUS)
        .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance) || b.distance - a.distance)
        .map(({ c }) => c)
      take(neighbors)
    }
    if (scope === 'full') {
      // T2: o resto da seção da dica.
      take(inSection)
    }
  }

  if (scope === 'full') {
    // T3..: cada outra seção como um nível próprio.
    for (const kind of SECTION_ORDER) {
      if (hint && kind === hint.kind) continue
      take(candidates.filter((c) => c.category.kind === kind).sort(byOrder))
    }
  }

  const ordered = tiers.flat()
  // Quem já falhou nesta sessão vai para o fim, na mesma ordem relativa.
  const firstTry = ordered.find((c) => (attempts.get(c.category.id) ?? 0) === 0)
  if (firstTry) return firstTry.category.id
  return ordered[0]?.category.id
}
