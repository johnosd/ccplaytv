import type { ReactNode } from 'react'

export interface SeeAllCardProps {
  label: string
  focused: boolean
  /** Classe extra do chamador (ex.: `vod-see-all-card` na vitrine de Filmes/Séries). */
  className?: string
}

/**
 * Cartão final "Ver todos"/"Ver tudo" de uma fileira (Início, feature 026; vitrine de Filmes/Séries, feature 052).
 * Extraído de `HomeContent.tsx` com markup e classes idênticos — o contrato 026 fixa o DOM.
 */
export function SeeAllCard({ label, focused, className }: SeeAllCardProps): ReactNode {
  return (
    <div className={`home-see-all${className ? ` ${className}` : ''}${focused ? ' tv-focus' : ''}`}>
      <span>{label}</span>
    </div>
  )
}
