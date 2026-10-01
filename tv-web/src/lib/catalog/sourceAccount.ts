import type { AccountStatusKind } from './db'

/**
 * Conta Xtream de uma fonte (feature 034) — regras puras, sem rede nem
 * banco. `sdd/specs/034-fontes-estado-expiracao/logic/conta-da-fonte.md` é a
 * especificação; este arquivo é o stub deixado pelo `sdd-plan`.
 */

export type { AccountStatusKind }

/** O que o aparelho sabe da conta de uma fonte. Nenhum campo é segredo. */
export interface SourceAccount {
  /** `undefined` = nunca verificada. */
  status?: AccountStatusKind
  /** Vencimento em ms. `null` = o painel declarou "sem data"; `undefined` = desconhecido. */
  expiresAt?: number | null
  /** Última verificação que obteve resposta do painel. */
  checkedAt?: number
}

/** Chip âmbar a partir de 7 dias do vencimento (FR-005). */
export const ACCOUNT_WARNING_DAYS = 7
/** Consulta leve ao escolher a lista só se a última verificação tiver mais que isto (FR-008). */
export const ACCOUNT_CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Limite de espera da consulta leve (FR-009, SC-003). */
export const ACCOUNT_CHECK_TIMEOUT_MS = 5000

export interface AccountChip {
  tone: 'warning' | 'error'
  label: string
}

/**
 * O que a linha de Configurações e o cartão da lista mostram sobre a conta.
 * `text` é o texto discreto da linha; `chip`, o aviso (linha e cartão).
 */
export interface AccountDisplay {
  kind: 'unknown' | 'no_expiry' | 'valid' | 'expiring' | 'expired' | 'refused'
  text?: string
  chip?: AccountChip
}

/** Decisão ao escolher uma lista em "Quem está assistindo?" (FR-008/FR-010). */
export type AccessDecision =
  | { action: 'open' }
  | { action: 'check' }
  | { action: 'blocked'; reason: 'expired' | 'refused'; expiresAt?: number | null }

/** O mínimo da fonte que a decisão lê — casa com `SourceOut`. */
export interface AccessInput {
  provider_import_mode: 'xtream_api' | 'legacy_m3u' | null
  account?: SourceAccount
}

/**
 * `exp_date` cru do painel → ms. `0`, negativo, vazio, ausente ou não
 * numérico → `null` ("sem data", FR-003). Segundos Unix → milissegundos.
 */
export function parseExpDate(raw: unknown): number | null {
  void raw
  throw new Error('not implemented')
}

/** FR-004/FR-005/FR-016 — regras em `logic/conta-da-fonte.md` §2. */
export function describeAccount(account: SourceAccount | undefined, now: number): AccountDisplay {
  void account
  void now
  throw new Error('not implemented')
}

/** Só o dado guardado, sem olhar a idade da verificação (`logic/conta-da-fonte.md` §3, passo 3). */
export function accessFromAccount(input: AccessInput, now: number): AccessDecision {
  void input
  void now
  throw new Error('not implemented')
}

/** FR-008/FR-010/FR-022 — `logic/conta-da-fonte.md` §3. */
export function decideSourceAccess(input: AccessInput, now: number): AccessDecision {
  void input
  void now
  throw new Error('not implemented')
}
