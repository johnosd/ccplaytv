import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { RefreshStatusLine } from '../../components/RefreshButton'
import { useT } from '../../lib/i18n/I18nProvider'
import type { LicenseSnapshot } from '../../lib/licensing/licenseMonitor'
import type { RefreshAction } from '../../lib/portal/useRefreshAction'
import type { PortalActionId } from './portalActions'

/**
 * Cartão "Licença" (features 075/076): estado, validade, oferta, Comprar/Renovar licença e Atualizar. Só existe no
 * build comercial — quem o monta decide; o código de recuperação NÃO fica aqui (feature 076, mora no Avançado).
 * `license` chega lido na renderização do painel.
 */
export function PortalLicenseCard({ license, refresh, connected, focusedId, onSelect }: {
  license: LicenseSnapshot
  refresh: RefreshAction
  connected: boolean
  focusedId?: PortalActionId
  onSelect: (id: PortalActionId) => void
}): ReactNode {
  const t = useT()
  const status = t(license.decision.reason === 'expired' ? 'portal.license_expired'
    : license.state ? ('portal.license_' + license.state) as 'portal.license_active' : 'portal.license_missing')
  return <section className="portal-card" aria-label={t('portal.license.title')}>
    <h3>{t('portal.license.title')}</h3>
    <p role="status">{t('portal.licenseStatus', { status })}</p>
    {license.expiresAt && <p>{t('portal.licenseExpiry', { date: new Date(license.expiresAt).toLocaleDateString() })}</p>}
    <p className="portal-card-hint">{t('portal.licenseOffer')}</p>
    <div className="portal-card-actions">
      <Button variant="accent" focused={focusedId === 'purchase'} softDisabled={!connected}
        onSelect={() => onSelect('purchase')}>{t(license.state === 'active' ? 'portal.renew' : 'portal.buy')}</Button>
      <Button variant="secondary" focused={focusedId === 'refresh'} loading={refresh.status === 'loading'} softDisabled={refresh.paused}
        onSelect={() => onSelect('refresh')}>{t('portal.refresh.label')}</Button>
    </div>
    <RefreshStatusLine action={refresh} scope="license" />
  </section>
}
