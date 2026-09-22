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
