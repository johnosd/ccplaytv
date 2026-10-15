import type { ReactNode } from 'react'
import { useConnectionCheckStatus } from '../lib/network/connectionCheck'
import { useOnlineStatus } from '../lib/onlineStatus'
import { useT } from '../lib/i18n/I18nProvider'

/**
 * Aviso de conectividade real (feature 022, D-012 do plan.md) — some sozinho
 * ao voltar online. Desde a feature 042 (D-007) é SÓ texto: a ação "Tentar de
 * novo" vive na topbar, porque o botão que estava aqui só respondia a clique e
 * o controle remoto não o alcançava.
 */
export function OfflineBanner(): ReactNode {
  const t = useT()
  const online = useOnlineStatus()
  const check = useConnectionCheckStatus()
  if (online) return null

  const message =
    check === 'verifying' ? t('offline.verifying') : check === 'failed' ? t('offline.failed') : t('offline.offline')

  return (
    <div className="offline-banner" role="status">
      <span>{message}</span>
    </div>
  )
}
