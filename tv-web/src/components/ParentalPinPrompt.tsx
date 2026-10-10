import { useState } from 'react'
import type { ReactNode } from 'react'
import { PinPrompt, type PinPromptProps } from './PinPrompt'
import { RecoverPinFlow } from './RecoverPinFlow'

/**
 * O pedido do PIN parental com "Esqueci o PIN" (feature 066, FR-027) em todos os pontos da feature: a recuperação
 * substitui o pedido (um `Modal` por vez) e, terminada ou desistida, devolve a ele.
 */
export function ParentalPinPrompt(props: Omit<PinPromptProps, 'onForgot'>): ReactNode {
  const [recovering, setRecovering] = useState(false)
  if (recovering) return <RecoverPinFlow onDone={() => setRecovering(false)} onCancel={() => setRecovering(false)} />
  return <PinPrompt {...props} onForgot={() => setRecovering(true)} />
}
