// Feature 078 (US6, FR-013, SC-006): evidências por ambiente. Módulo puro — o CLI lê
// release/samsung/evidence/*.json (data-model "evidence/*.json") e passa aqui já parseado.
// Evidência só conta para o candidato de mesmo `wgtSha256` e no ambiente do gate: navegador
// nunca vale por emulador ou TV.
import { STATUS, checklistItem } from './checklist.mjs'

/** Gate → ambiente exigido. */
export const EVIDENCE_GATES = Object.freeze({
  'INT-EVD-STATIC': 'local',
  'INT-EVD-BUILD': 'local',
  'INT-EVD-E2E': 'browser',
  'INT-EVD-EMULATOR': 'emulator',
  'INT-EVD-TV': 'tv',
  'INT-UPD-PRESERVE': 'tv',
})

/** Texto curto do ambiente e dispositivo, sem nada vindo de credencial (só campos descritivos). */
function describe(entry) {
  return [entry.environment, entry.device, entry.firmware, entry.date].filter(Boolean).join(' · ')
}

/**
 * @param {{ evidence: object[], wgtSha256: string }} input
 * @returns {import('./checklist.mjs').CheckResult[]} um resultado por gate de EVIDENCE_GATES
 */
export function checkEvidence({ evidence, wgtSha256 }) {
  return Object.entries(EVIDENCE_GATES).map(([id, environment]) => {
    const forGate = (evidence ?? []).filter((entry) => entry?.gate === id)
    const matching = forGate
      .filter((entry) => entry.candidate?.wgtSha256 === wgtSha256 && entry.environment === environment)
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    const latest = matching[0]
    if (!latest) {
      const stale = forGate.length > 0
      return {
        id,
        status: STATUS.PENDING,
        detail: stale ? 'evidência existente é de outro pacote ou de outro ambiente' : `sem evidência no ambiente ${environment}`,
        nextAction: `executar o roteiro (quickstart) no ambiente ${environment} e gravar release/samsung/evidence/`,
      }
    }
    if (latest.result === STATUS.PASS) return { id, status: STATUS.PASS, detail: describe(latest), owner: latest.by }
    if (latest.result === STATUS.WAIVED) {
      // A decisão (decision.mjs) bloqueia Waived em item não dispensável ou sem dono/justificativa.
      return { id, status: STATUS.WAIVED, detail: describe(latest), owner: latest.by, justification: latest.limitations || latest.justification }
    }
    const waivable = checklistItem(id)?.waivable
    return {
      id,
      status: STATUS.BLOCKED,
      detail: `roteiro não passou (${describe(latest)})`,
      owner: latest.by,
      nextAction: waivable ? 'corrigir e repetir, ou registrar Waived com dono e justificativa' : 'corrigir e repetir o roteiro',
    }
  })
}
