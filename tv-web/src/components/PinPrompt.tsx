/**
 * Pedido de PIN de 4 dígitos (feature 066): teclas numéricas do controle e um
 * teclado numérico na tela, navegável pelo direcional (FR-018). Nunca mostra
 * os dígitos (FR-012); PIN errado limpa e mantém o foco (FR-016).
 *
 * STUB do `sdd-plan` — o `sdd-execute` implementa (T030). As props são as que
 * o contrato travado usa.
 */

import type { ReactNode } from 'react'

export interface PinPromptProps {
  /** Título já traduzido (ex.: "Digite o PIN"). */
  title: string
  /** Chamado com os 4 dígitos. `true` = aceito (quem chama fecha e segue); `false` = "PIN incorreto". */
  onSubmit: (pin: string) => Promise<boolean>
  /** RETURN ou "Cancelar". */
  onCancel: () => void
  /** Mostra "Esqueci o PIN" quando passado (FR-027). */
  onForgot?: () => void
}

export function PinPrompt(_props: PinPromptProps): ReactNode {
  throw new Error('not implemented')
}
