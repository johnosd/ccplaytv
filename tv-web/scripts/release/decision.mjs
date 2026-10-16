// Feature 078 (FR-006, FR-014/014a, SC-001/003/008): decisão de prontidão.
// Regras em sdd/specs/078-prontidao-publicacao-samsung/logic/gate.md §6.
import { CHECKLIST, STATUS, checklistItem } from './checklist.mjs'

/**
 * @typedef {{ country: string, model: string, firmware: string, environment: 'tv' | 'emulator' | 'browser', evidence: string, date: string, state: 'allowed' | 'pending' | 'blocked' }} TargetMatrixEntry
 */

/** Item do catálogo, ou o que um ID dinâmico (`SAM-PRV:<nome>`) herda do prefixo. */
function itemFor(id) {
  const known = checklistItem(id)
  if (known) return known
  return { id, klass: id.startsWith('SAM-') ? 'samsung' : 'internal', blocker: true, waivable: false }
}

/** @param {import('./checklist.mjs').CheckResult} result */
function isImpeditive(result) {
  const item = itemFor(result.id)
  if (!item.blocker) return false
  switch (result.status) {
    case STATUS.PASS:
    case STATUS.NA:
      return false
    case STATUS.WAIVED:
      return !item.waivable || !result.owner?.trim() || !result.justification?.trim()
    default:
      return true // Blocked, Pending ou status desconhecido
  }
}

/** @param {TargetMatrixEntry} entry */
const isApproved = (entry) => entry.state === 'allowed' && entry.environment === 'tv' && Boolean(entry.evidence?.trim())

/**
 * @param {{ results: import('./checklist.mjs').CheckResult[], matrix: TargetMatrixEntry[] }} input
 * @returns {{ decision: 'Ready for submission' | 'Blocked', blockers: string[], approvedTargets: TargetMatrixEntry[] }}
 */
export function decideLaunch({ results, matrix }) {
  const byId = new Map(results.map((result) => [result.id, result]))
  const blockers = []
  // Item do catálogo sem resultado conta como Pending (SC-001: nada implícito).
  for (const item of CHECKLIST) {
    const result = byId.get(item.id) ?? { id: item.id, status: STATUS.PENDING, detail: 'sem resultado' }
    if (isImpeditive(result)) blockers.push(item.id)
  }
  for (const result of results) {
    if (checklistItem(result.id)) continue
    if (isImpeditive(result)) blockers.push(result.id)
  }
  const approvedTargets = (matrix ?? []).filter(isApproved)
  if (approvedTargets.length === 0) blockers.push('TARGET-MATRIX')
  return { decision: blockers.length === 0 ? 'Ready for submission' : 'Blocked', blockers, approvedTargets }
}
