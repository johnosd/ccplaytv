import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { FixedQr } from '../../components/FixedQr'
import { useT } from '../../lib/i18n/I18nProvider'
import { formatDeviceKey } from '../../lib/portal/displayId'
import type { usePairingCredentials } from '../../lib/portal/usePairingCredentials'
import { pairingNeedsAction } from './portalActions'

type Pairing = ReturnType<typeof usePairingCredentials>

/**
 * Cartão "Acessar o portal" (feature 075, US1): QR fixo, endereço do site, ID e chave à vista, sem nenhuma ação
 * (ADR-019 / constitution 1.14.0). Nada aqui consulta o serviço além do cadastro único do `usePairingCredentials`.
 * O convite de recuperação (069) ocupa o lugar do QR fixo enquanto é válido. Mensagens de falha só com o código
 * não secreto (FR-018); a chave só aparece quando existe e nunca em mensagem.
 */
export function PortalAccessCard({ connected, pairing, recovery, retryFocused, onRetry }: {
  connected: boolean
  pairing: Pairing
  /** Convite de recuperação válido: substitui o QR fixo, com contagem regressiva real. */
  recovery?: { qrDataUrl: string; seconds: number }
  retryFocused: boolean
  onRetry: () => void
}): ReactNode {
  const t = useT()
  const { device, site, qrUrl, code } = pairing
  const { failed, unlinked } = pairingNeedsAction(connected, pairing)

  let body: ReactNode
  if (recovery) {
    body = <div className="portal-card-body">
      <div className="portal-qr-frame"><img src={recovery.qrDataUrl} alt={t('portal.recoveryQr')} /></div>
      <div className="portal-fields">
        <p role="status">{t('portal.expiry', { seconds: recovery.seconds })}</p>
        <p className="portal-card-hint">{t('portal.recoveryWaiting')}</p>
      </div>
    </div>
  } else if (!connected) {
    body = <div className="portal-card-body is-message">
      <p role="status">{t('portal.unconfigured')}</p>
      {import.meta.env.DEV && <p role="status">{t('portal.devHint')}</p>}
    </div>
  } else if (qrUrl && device) {
    body = <div className="portal-card-body">
      <div className="portal-qr-frame"><FixedQr value={qrUrl} label={t('portal.qrAlt')} /></div>
      <dl className="portal-fields">
        <div className="portal-field"><dt className="portal-field-label">{t('portal.site')}</dt>
          <dd className="portal-field-value is-url">{site}</dd></div>
        <div className="portal-field"><dt className="portal-field-label">{t('portal.pairing.deviceId')}</dt>
          <dd className="portal-field-value">{device.displayId}</dd></div>
        <div className="portal-field"><dt className="portal-field-label">{t('portal.pairing.deviceKey')}</dt>
          <dd className="portal-field-value is-key">{formatDeviceKey(device.deviceKey)}</dd></div>
      </dl>
    </div>
  } else if (failed || unlinked) {
    body = <div className="portal-card-body is-message">
      <p role={failed ? 'alert' : 'status'}>{failed ? t(code === 'conflict' ? 'portal.recoveryNeeded' : 'portal.failure') : t('portal.unlinkedState')}</p>
      {failed && code && <p>{t('portal.failureCode', { code })}</p>}
      <div className="portal-card-actions">
        <Button variant="accent" focused={retryFocused} onSelect={onRetry}>{t(failed ? 'portal.retry' : 'portal.relink')}</Button>
      </div>
    </div>
  } else {
    body = <div className="portal-card-body is-message"><p role="status">{t('portal.pairing.loading')}</p></div>
  }

  return <section className="portal-card" aria-label={t('portal.access.title')}>
    <h3>{t('portal.access.title')}</h3>
    {body}
    {!recovery && qrUrl && <p className="portal-card-hint">{t('portal.pairing.qr')}</p>}
  </section>
}
