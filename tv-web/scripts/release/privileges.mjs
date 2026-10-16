// Feature 078 (FR-005): privilégios por variante contra o ledger versionado
// (release/samsung/privileges.json). Regras em logic/gate.md §4.
import { STATUS } from './checklist.mjs'

/**
 * @typedef {{ level: 'public' | 'partner' | 'platform', usedBy: Partial<Record<'base' | 'commercial', string[]>>, authorization?: { source: string, date: string } | null, confirmation?: { source: string, date: string } | null }} LedgerEntry
 */

const DEPRECATED = new Set(['keymanager', 'systemmanager', 'websetting'])
const CHECKOUT_ONLY = new Set(['sso.partner', 'productinfo', 'billing'])
const LEVELS = new Set(['public', 'partner', 'platform'])

const suffixOf = (name) => name.slice(name.lastIndexOf('/') + 1)

/** @returns {string | null} motivo do bloqueio, ou null se o privilégio passa */
function blockReason(name, entry, features, variant) {
  const suffix = suffixOf(name)
  if (!entry) return 'privilégio sem justificativa registrada no ledger'
  if (DEPRECATED.has(suffix)) return 'privilégio descontinuado pelo Samsung'
  if (!entry.usedBy?.[variant]?.length) return `a variante ${variant} declara o privilégio mas não o usa`
  if (!LEVELS.has(entry.level)) return 'nível do privilégio não registrado'
  if (entry.level === 'platform') return 'privilégio de nível platform não é concedido a apps de terceiros'
  if (entry.level === 'partner' && !entry.authorization) return 'privilégio partner sem autorização registrada'
  if (suffix === 'smartcontroller.microphone' && !entry.authorization) return 'smartcontroller.microphone exige consulta prévia ao Samsung'
  if (suffix === 'adinfo' && !features.inAppAds) return 'adinfo só vale com anúncios no app'
  if (CHECKOUT_ONLY.has(suffix) && !features.checkout && !entry.confirmation) {
    return 'privilégio listado como do Samsung Checkout sem Checkout: registrar confirmação'
  }
  return null
}

/**
 * @param {{ declared: string[], ledger: Record<string, LedgerEntry>, features: { checkout: boolean, inAppAds: boolean }, variant: 'base' | 'commercial' }} input
 * @returns {import('./checklist.mjs').CheckResult[]} um `SAM-PRV:<nome>` por privilégio declarado + o agregado `SAM-PRV`
 */
export function checkPrivileges(input) {
  const { declared, ledger, features, variant } = input
  const results = declared.map((name) => {
    const reason = blockReason(name, ledger?.[name], features, variant)
    return reason
      ? { id: `SAM-PRV:${name}`, status: STATUS.BLOCKED, detail: reason, nextAction: 'ajustar o ledger release/samsung/privileges.json ou remover o privilégio de config.xml' }
      : { id: `SAM-PRV:${name}`, status: STATUS.PASS, detail: `uso registrado para a variante ${variant}` }
  })
  const blocked = results.filter((result) => result.status === STATUS.BLOCKED)
  results.push(blocked.length === 0
    ? { id: 'SAM-PRV', status: STATUS.PASS, detail: `${declared.length} privilégio(s) com nível, uso e regras nominais conferidos` }
    : { id: 'SAM-PRV', status: STATUS.BLOCKED, detail: `${blocked.length} privilégio(s) bloqueado(s)`, paths: blocked.map((result) => result.id.slice('SAM-PRV:'.length)) })
  return results
}
