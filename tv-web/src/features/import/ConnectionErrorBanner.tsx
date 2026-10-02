import type { ReactNode } from 'react'
import type { ConnectionBanner } from './connectionBanner'

/**
 * Faixa única de erro do formulário de lista (feature 045, D-006): título,
 * motivo e código discreto. `role="alert"` já é uma região viva — não há
 * segundo anúncio. Nada além do conteúdo da tabela de erros entra aqui.
 */
export function ConnectionErrorBanner({ banner }: { banner: ConnectionBanner }): ReactNode {
  return (
    <div className="connection-banner" role="alert">
      <p className="connection-banner-title">{banner.title}</p>
      <p className="connection-banner-text">
        {banner.description} <span className="connection-banner-code">{banner.code}</span>
      </p>
    </div>
  )
}
