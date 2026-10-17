// Feature 078 (US1, FR-001, SC-009): identidade do candidato de release.
// Regras em sdd/specs/078-prontidao-publicacao-samsung/logic/gate.md §2.
import { STATUS } from './checklist.mjs'

/**
 * @typedef {{ variant: 'base' | 'commercial', revision: string, dirtyPaths: string[], buildMode: string, version: string, wgtSha256: string }} CandidateInput
 * @typedef {CandidateInput & { dirty: boolean }} Candidate
 */

const REVISION = /^[0-9a-f]{40}$/i
const SHA256 = /^[0-9a-f]{64}$/i

// Campos que, se mudarem, tornam um relatório anterior obsoleto (SC-009).
const IDENTITY_FIELDS = ['revision', 'version', 'variant', 'buildMode', 'wgtSha256']

/**
 * @param {CandidateInput} input
 * @returns {{ candidate: Candidate, results: import('./checklist.mjs').CheckResult[] }}
 */
export function describeCandidate(input) {
  const dirtyPaths = input.dirtyPaths ?? []
  const candidate = { ...input, dirtyPaths, dirty: dirtyPaths.length > 0 }

  /** @type {import('./checklist.mjs').CheckResult} */
  const tree = candidate.dirty
    ? { id: 'INT-CAND-TREE', status: STATUS.BLOCKED, detail: `árvore de trabalho com ${dirtyPaths.length} alteração(ões) não commitada(s)`, paths: dirtyPaths, nextAction: 'commitar ou descartar as alterações e gerar o candidato de novo' }
    : { id: 'INT-CAND-TREE', status: STATUS.PASS, detail: 'árvore limpa na revisão do candidato' }

  const missing = []
  if (!REVISION.test(String(input.revision ?? ''))) missing.push('revisão')
  if (!String(input.version ?? '').trim()) missing.push('versão')
  if (!SHA256.test(String(input.wgtSha256 ?? ''))) missing.push('hash do .wgt')
  /** @type {import('./checklist.mjs').CheckResult} */
  const hash = missing.length === 0
    ? { id: 'INT-CAND-HASH', status: STATUS.PASS, detail: 'revisão, versão e hash do .wgt identificados' }
    : { id: 'INT-CAND-HASH', status: STATUS.BLOCKED, detail: `candidato sem identificação válida: ${missing.join(', ')}`, nextAction: 'empacotar o .wgt e rodar o gate de novo' }

  return { candidate, results: [tree, hash] }
}

/**
 * @param {Candidate | undefined} previous
 * @param {Candidate} current
 * @returns {{ stale: boolean, reasons: string[] }}
 */
export function compareWithPrevious(previous, current) {
  if (!previous) return { stale: false, reasons: [] }
  const reasons = IDENTITY_FIELDS.filter((field) => previous[field] !== current[field])
  return { stale: reasons.length > 0, reasons }
}
