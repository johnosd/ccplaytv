import { db, type CatalogDb } from './db'
import type { SourceAccount } from './sourceAccount'

/**
 * Consulta leve à conta Xtream ao escolher a lista (feature 034, FR-008/
 * FR-009/FR-012). Stub deixado pelo `sdd-plan` — ver
 * `sdd/specs/034-fontes-estado-expiracao/logic/conta-da-fonte.md` §4.
 */

export interface AccountCheckOptions {
  database?: CatalogDb
  now?: () => number
  /** Padrão: `ACCOUNT_CHECK_TIMEOUT_MS`. */
  timeoutMs?: number
}

export type AccountCheckResult =
  /** O painel respondeu (inclusive recusando): o resultado já foi gravado na fonte. */
  | { fresh: true; account: SourceAccount }
  /** Sem resposta utilizável: nada foi gravado; `account` é o que já estava guardado. */
  | { fresh: false; reason: 'network' | 'timeout' | 'no_credential'; account: SourceAccount }

export async function checkSourceAccount(
  sourceId: string,
  options: AccountCheckOptions = {},
): Promise<AccountCheckResult> {
  void sourceId
  void (options.database ?? db)
  throw new Error('not implemented')
}
