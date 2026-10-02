import type { ReactNode } from 'react'
import { useConnectionCheckStatus } from '../lib/network/connectionCheck'
import { useOnlineStatus } from '../lib/onlineStatus'

/**
 * Aviso de conectividade real (feature 022, D-012 do plan.md) — some sozinho
 * ao voltar online. Desde a feature 042 (D-007) é SÓ texto: a ação "Tentar de
 * novo" vive na topbar, porque o botão que estava aqui só respondia a clique e
 * o controle remoto não o alcançava.
 */
export function OfflineBanner(): ReactNode {
  const online = useOnlineStatus()
  const check = useConnectionCheckStatus()
  if (online) return null

  const message =
    check === 'verifying'
      ? 'Verificando rede…'
      : check === 'failed'
        ? 'Ainda sem conexão. O conteúdo que já está no aparelho continua disponível.'
        : 'Sem conexão com a internet.'

  return (
    <div className="offline-banner" role="status">
      <span>{message}</span>
    </div>
  )
}
