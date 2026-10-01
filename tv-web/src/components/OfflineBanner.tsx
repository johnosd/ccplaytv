import type { ReactNode } from 'react'
import { useOnlineStatus } from '../lib/onlineStatus'

export interface OfflineBannerProps {
  onTestConnection: () => void
}

/** Aviso de conectividade real (feature 022, D-012 do plan.md) — some sozinho ao voltar online. */
export function OfflineBanner({ onTestConnection }: OfflineBannerProps): ReactNode {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="offline-banner" role="status">
      <span>Sem conexão com a internet.</span>
      <button type="button" className="button-secondary" onClick={onTestConnection}>
        Testar conexão
      </button>
    </div>
  )
}
