import type { Dashboard, LicenseDevice } from '../api'
import type { MessageKey } from '../../lib/i18n'

/**
 * Regras do resumo da TV (feature 077, `logic/shell-responsivo.md` §3): licença e último contato, sem rede e sem
 * efeito colateral. O resumo mostra texto além da cor (FR-002); estados de atenção levam a Licença.
 */
export type LicenseTone = 'success' | 'warning' | 'danger' | 'unknown'
export interface SummaryState {
  tone: LicenseTone
  licenseLabel: MessageKey
  expiresAt?: number
  /** Licença vencida ou revogada: o resumo oferece Renovar. */
  needsRenew: boolean
  contact: 'none' | 'ok' | 'stale'
  contactAt?: string
}

export function summaryState(device: LicenseDevice | undefined, dashboard: Dashboard | undefined, now = Date.now()): SummaryState {
  const contact: SummaryState['contact'] = !dashboard?.snapshot ? 'none' : dashboard.stale ? 'stale' : 'ok'
  const contactAt = dashboard?.snapshot?.capturedAt
  if (!device) return { tone: 'unknown', licenseLabel: 'license_trial', needsRenew: false, contact, contactAt }
  const { state, expiresAt, serverTime } = device.license
  // Mesma regra do cartão de licença: relógio do navegador nunca antecipa nem atrasa o vencimento além do servidor.
  const expired = state === 'revoked' || expiresAt <= Math.max(now, serverTime)
  if (expired) return { tone: 'danger', licenseLabel: state === 'revoked' ? 'license_revoked' : 'licenseExpired', expiresAt, needsRenew: true, contact, contactAt }
  return { tone: state === 'active' ? 'success' : 'warning', licenseLabel: state === 'active' ? 'license_active' : 'license_trial', expiresAt, needsRenew: false, contact, contactAt }
}
