import type { ReactNode } from 'react'

/**
 * Marca no topo das telas de entrada (onboarding e progresso de importação,
 * feature 023): a identidade V14 sem virar um elemento focável — nada aqui
 * disputa o foco com o formulário.
 */
export function OnboardingBrand(): ReactNode {
  return (
    <div className="onboarding-brand" aria-hidden="true">
      <div className="onboarding-brand-mark" />
      <span className="onboarding-brand-name">CCPlayTV</span>
    </div>
  )
}
