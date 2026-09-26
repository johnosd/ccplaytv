import type { SourceRecord } from './db'

export const STALE_AFTER_MS = 24 * 60 * 60 * 1000 // 24 hours

export type FreshnessAction = 'none' | 'migrate' | 'update_by_age'

/**
 * Decide o que abrir uma fonte dispara (D-004 portado do backend) — a TV só 
 * avisa "abri esta fonte"; toda a decisão mora aqui, nunca na tela.
 *
 * @param source A fonte a ser avaliada.
 * @param now Instante atual injetado, não lido do relógio dentro da função — 
 *            é o que torna a regra testável e imune a relógio errado do aparelho.
 */
export function decideOnOpen(source: SourceRecord, now: number): FreshnessAction {
  // Fonte que nunca sincronizou não é velha — é pendente, sem idade a comparar.
  // Não é este ponto de entrada que resolve isso.
  if (source.connectionState === 'never_synced') {
    return 'none'
  }

  // Migração Única (FR-012/FR-014): fonte de provedor que nunca passou pelo conector novo.
  if (source.type === 'provider_credentials' && source.providerMigratedAt === undefined) {
    return 'migrate'
  }

  // Atualização por idade (FR-020): qualquer fonte cuja última
  // sincronização bem-sucedida passou de STALE_AFTER.
  if (source.lastSuccessfulSyncAt !== undefined) {
    if (now - source.lastSuccessfulSyncAt > STALE_AFTER_MS) {
      return 'update_by_age'
    }
  }

  return 'none'
}

/**
 * Decide se os itens de uma categoria ainda valem, ou se é hora de buscar
 * de novo (feature 010, `categoryLoader`).
 *
 * Reusa o mesmo prazo que a fonte inteira já usa (`STALE_AFTER_MS`, FR-020)
 * em vez de inventar um segundo valor: duas noções de "velho" no mesmo
 * aplicativo, sem nenhuma medição que justifique a diferença, seria
 * complexidade sem necessidade comprovada (research.md R0-2). Categoria
 * `eager` não passa por aqui — ela é sempre servida do disco, qualquer
 * que seja a idade (contrato `catalog-on-demand.md` §2), porque não há o
 * que "atualizar" nela isoladamente: a fonte inteira é que re-sincroniza.
 *
 * @param itemsFetchedAt Instante da última obtenção. `undefined` = nunca
 *                        obtida — nunca é "fresca".
 * @param now Instante atual injetado — mesma disciplina de `decideOnOpen`.
 */
export function isCategoryFresh(itemsFetchedAt: number | undefined, now: number): boolean {
  if (itemsFetchedAt === undefined) return false
  return now - itemsFetchedAt <= STALE_AFTER_MS
}
