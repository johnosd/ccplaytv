// Feature 078 (US5, FR-011, SC-005): `SAM-KIT-PRIVACY`. Módulo puro — o CLI lê o manifest e as
// evidências `release/samsung/evidence/privacy-*.json`; aqui não há rede (o gate nunca faz
// requisição: quem confere a página publicada é a pessoa, quickstart §6, e grava a evidência).
import { STATUS } from './checklist.mjs'

const ID = 'SAM-KIT-PRIVACY'

/** URL pública aceitável: https, sem credencial, query ou fragmento. */
function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

/**
 * @param {{ privacyUrl?: string, item?: { status?: string, owner?: string, naReason?: string }, evidence?: Array<{ url?: string, status?: number, date?: string }> }} input
 * @returns {import('./checklist.mjs').CheckResult}
 */
export function checkPrivacy({ privacyUrl, item, evidence = [] }) {
  const owner = item?.owner
  // FR-011: só uma variante sem coleta pode dispensar a página, e com o motivo registrado.
  if (item?.status === STATUS.NA) {
    return item.naReason?.trim()
      ? { id: ID, status: STATUS.NA, detail: 'variante sem coleta de dados', owner, justification: item.naReason }
      : { id: ID, status: STATUS.BLOCKED, detail: 'Not Applicable sem justificativa (naReason)', owner, nextAction: 'registrar naReason ou publicar a política' }
  }
  if (!privacyUrl) {
    return { id: ID, status: STATUS.PENDING, detail: 'URL da política de privacidade não registrada no manifest', owner, nextAction: 'preencher privacyUrl em kit/manifest.json' }
  }
  if (!isPublicHttpsUrl(privacyUrl)) {
    // Sem ecoar a URL: ela pode conter credencial ou query.
    return { id: ID, status: STATUS.BLOCKED, detail: 'privacyUrl precisa ser https, sem credencial, query ou fragmento', owner, nextAction: 'corrigir privacyUrl em kit/manifest.json' }
  }
  const verified = evidence.some((entry) => entry?.url === privacyUrl && entry.status === 200 && /^\d{4}-\d{2}-\d{2}/.test(entry.date ?? ''))
  if (!verified) {
    return { id: ID, status: STATUS.PENDING, detail: 'página não verificada: falta evidência HTTP 200 para esta URL', owner, nextAction: 'publicar bridge/privacidade/ (merge em main), conferir (quickstart §6) e gravar evidence/privacy-<data>.json' }
  }
  return { id: ID, status: STATUS.PASS, detail: `política pública verificada (${privacyUrl})`, owner }
}
