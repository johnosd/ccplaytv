import { db, type CatalogDb } from './db'
import { ACCOUNT_CHECK_TIMEOUT_MS, type SourceAccount } from './sourceAccount'
import { markAccount, readCredential } from './sourceRepository'
import { ProviderError, resolveAccountStatus } from './xtreamConnector'

/**
 * Consulta leve à conta Xtream ao escolher a lista (feature 034, FR-008/
 * FR-009/FR-012) — `sdd/specs/034-fontes-estado-expiracao/logic/conta-da-fonte.md`
 * §4. Só esta função (e o pipeline de sincronização) escreve a conta (D-001).
 *
 * Reusa `resolveAccountStatus`, a mesma consulta que a importação faz — não
 * uma segunda implementação. O resultado nunca carrega endereço, usuário ou
 * senha, e o erro cru nunca é registrado (a URL embute a senha).
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

class CheckTimeout extends Error {}

/** Só os campos definidos — a mesma forma de `SourceView.account`. */
function storedAccountOf(record: {
  accountStatus?: SourceAccount['status']
  accountExpiresAt?: number | null
  accountCheckedAt?: number
}): SourceAccount {
  const account: SourceAccount = {}
  if (record.accountStatus !== undefined) account.status = record.accountStatus
  if (record.accountExpiresAt !== undefined) account.expiresAt = record.accountExpiresAt
  if (record.accountCheckedAt !== undefined) account.checkedAt = record.accountCheckedAt
  return account
}

export async function checkSourceAccount(
  sourceId: string,
  options: AccountCheckOptions = {},
): Promise<AccountCheckResult> {
  const database = options.database ?? db
  const now = options.now ?? (() => Date.now())
  const record = await database.sources.get(sourceId)
  const stored = record ? storedAccountOf(record) : {}

  const credential = await readCredential(sourceId, database)
  if (!credential) return { fresh: false, reason: 'no_credential', account: stored }

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new CheckTimeout())
    }, options.timeoutMs ?? ACCOUNT_CHECK_TIMEOUT_MS)
  })

  try {
    // O `race` é obrigatório (D-005): um `fetch` que ignora o sinal de
    // cancelamento nunca pode prender a tela. A consulta que perde a corrida
    // ainda pode rejeitar depois (cancelada) — o `catch` vazio evita um
    // "unhandled rejection" sobre uma promessa que ninguém mais espera.
    const pending = resolveAccountStatus(credential.dns, credential.username, credential.password, now(), {
      signal: controller.signal,
    })
    pending.catch(() => {})
    const status = await Promise.race([pending, timeout])

    const checkedAt = now()
    const accountStatus = !status.authorized ? 'refused' : status.expired ? 'expired' : 'active'
    await markAccount(sourceId, { status: accountStatus, expiresAt: status.expiresAt, checkedAt }, database)
    return { fresh: true, account: { status: accountStatus, expiresAt: status.expiresAt, checkedAt } }
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'invalid_credentials') {
      const checkedAt = now()
      await markAccount(sourceId, { status: 'refused', checkedAt }, database)
      return { fresh: true, account: { ...stored, status: 'refused', checkedAt } }
    }
    // Nunca grava nada sem resposta do painel, e nunca registra o erro cru.
    return { fresh: false, reason: error instanceof CheckTimeout ? 'timeout' : 'network', account: stored }
  } finally {
    clearTimeout(timer)
  }
}
