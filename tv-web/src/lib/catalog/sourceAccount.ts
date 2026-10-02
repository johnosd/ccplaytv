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
  if (raw === null || raw === undefined || raw === '') return null
  const seconds = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return seconds * 1000
}

const DAY_MS = 24 * 60 * 60 * 1000

/** DD/MM/AAAA no fuso local — é um instante, não uma data sem hora. */
export function formatAccountDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Dias até o vencimento por calendário LOCAL (meia-noite local de cada data) —
 * nunca `ms / dia`, que erra perto da meia-noite e na troca de horário de
 * verão. `Math.round` absorve a hora a mais/a menos desses dias.
 */
function calendarDaysLeft(expiresAt: number, now: number): number {
  return Math.round((startOfLocalDay(expiresAt) - startOfLocalDay(now)) / DAY_MS)
}

function isExpiredAccount(account: SourceAccount, now: number): boolean {
  return account.status === 'expired' || (typeof account.expiresAt === 'number' && account.expiresAt <= now)
}

/** FR-004/FR-005/FR-016 — regras em `logic/conta-da-fonte.md` §2 (a ordem importa). */
export function describeAccount(account: SourceAccount | undefined, now: number): AccountDisplay {
  if (!account || account.status === undefined) return { kind: 'unknown' }

  if (account.status === 'refused') {
    return { kind: 'refused', text: 'Credencial inválida', chip: { tone: 'error', label: 'Credencial inválida' } }
  }

  if (isExpiredAccount(account, now)) {
    const text =
      typeof account.expiresAt === 'number' ? `Conta expirada em ${formatAccountDate(account.expiresAt)}` : 'Conta expirada'
    return { kind: 'expired', text, chip: { tone: 'error', label: 'Conta expirada' } }
  }

  if (account.expiresAt === null) return { kind: 'no_expiry', text: 'Sem data de vencimento' }
  if (account.expiresAt === undefined) return { kind: 'unknown' }

  const text = `Conta válida até ${formatAccountDate(account.expiresAt)}`
  const daysLeft = calendarDaysLeft(account.expiresAt, now)
  if (daysLeft <= ACCOUNT_WARNING_DAYS) {
    const label = daysLeft <= 0 ? 'Vence hoje' : daysLeft === 1 ? 'Vence amanhã' : `Vence em ${daysLeft} dias`
    return { kind: 'expiring', text, chip: { tone: 'warning', label } }
  }
  return { kind: 'valid', text }
}

/**
 * Só o dado guardado, sem olhar a idade da verificação (`logic/conta-da-fonte.md`
 * §3, passo 3). Falha de rede nunca impede sozinha: sem `status` guardado,
 * abre (constitution 1.7.0, D-003).
 */
export function accessFromAccount(input: AccessInput, now: number): AccessDecision {
  if (input.provider_import_mode !== 'xtream_api') return { action: 'open' }
  const account = input.account
  if (!account) return { action: 'open' }
  if (account.status === 'refused') return { action: 'blocked', reason: 'refused' }
  if (isExpiredAccount(account, now)) return { action: 'blocked', reason: 'expired', expiresAt: account.expiresAt }
  return { action: 'open' }
}

/** FR-008/FR-010/FR-022 — `logic/conta-da-fonte.md` §3. */
export function decideSourceAccess(input: AccessInput, now: number): AccessDecision {
  // M3U avulsa, Modo limitado e nunca sincronizada: nunca verificada nem impedida (FR-022, D-006).
  if (input.provider_import_mode !== 'xtream_api') return { action: 'open' }
  const checkedAt = input.account?.checkedAt
  if (checkedAt === undefined || now - checkedAt > ACCOUNT_CHECK_MAX_AGE_MS) return { action: 'check' }
  return accessFromAccount(input, now)
}
