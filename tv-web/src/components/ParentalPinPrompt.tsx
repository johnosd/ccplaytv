import { useState } from 'react'
import type { ReactNode } from 'react'
import { PinPrompt, type PinPromptProps } from './PinPrompt'
import { RecoverPinFlow } from './RecoverPinFlow'

export interface ParentalPinPromptProps extends Omit<PinPromptProps, 'onForgot'> {
  /** A lista dona do PIN (feature 067): "Esqueci o PIN" confere os dados dela e troca o PIN dela. */
  sourceId: string
}

/**
 * O pedido do PIN parental com "Esqueci o PIN" (feature 066, FR-027) em todos os pontos da feature: a recuperação
 * substitui o pedido (um `Modal` por vez) e, terminada ou desistida, devolve a ele.
 */
export function ParentalPinPrompt({ sourceId, ...props }: ParentalPinPromptProps): ReactNode {
  const [recovering, setRecovering] = useState(false)
  if (recovering) return <RecoverPinFlow sourceId={sourceId} onDone={() => setRecovering(false)} onCancel={() => setRecovering(false)} />
  return <PinPrompt {...props} onForgot={() => setRecovering(true)} />
}
