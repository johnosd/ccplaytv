import { useState } from 'react'
import type { ReactNode } from 'react'
import { PinCreateFlow } from '../../../components/PinCreateFlow'
import { ParentalPinPrompt } from '../../../components/ParentalPinPrompt'
import { changePin, disableParentalControl, verifyPin } from '../../../lib/parental/pin'
import { useT } from '../../../lib/i18n/I18nProvider'
import { SuggestionStep, type SuggestionDecision } from './SuggestionStep'

/** O que a aba pede ao PIN (FR-010, FR-017, FR-019). */
export type ParentalFlowKind = 'unlock-tab' | 'enable' | 'change' | 'disable'

export interface ParentalFlowProps {
  kind: ParentalFlowKind
  /** Lista ativa — a sugestão adulta de ligar o controle olha as categorias dela (FR-022). */
  sourceId: string
  /** PIN certo ao entrar na aba: libera até sair dela. */
  onTabUnlocked: () => void
  /** Ligar: sugestão confirmada e os dois PINs bateram — quem chama grava tudo junto (`enableParentalControl`, D-007). */
  onEnable: (pin: string, suggestions: SuggestionDecision[]) => Promise<void>
  /** Trocar ou desligar terminou. */
  onFinished: (kind: 'change' | 'disable') => void
  onCancel: () => void
}

/** Os pedidos de PIN da aba Categorias & parental — cada um num `ParentalPinPrompt` (com "Esqueci o PIN"); cancelar não grava nada (D-007). */
export function ParentalFlow({ kind, sourceId, onTabUnlocked, onEnable, onFinished, onCancel }: ParentalFlowProps): ReactNode {
  const t = useT()
  // Trocar: primeiro o PIN atual, depois o novo duas vezes.
  const [currentChecked, setCurrentChecked] = useState(false)
  // Ligar: primeiro a sugestão adulta (FR-022), depois o PIN 2×; cancelar em qualquer etapa não grava nada.
  const [suggestions, setSuggestions] = useState<SuggestionDecision[] | null>(null)

  if (kind === 'enable' && suggestions === null) return <SuggestionStep sourceId={sourceId} onConfirm={setSuggestions} onCancel={onCancel} />
  if (kind === 'enable') return <PinCreateFlow onDone={(pin) => onEnable(pin, suggestions ?? [])} onCancel={onCancel} />
  if (kind === 'change' && currentChecked) {
    return (
      <PinCreateFlow
        onDone={async (pin) => {
          await changePin(pin)
          onFinished('change')
        }}
        onCancel={onCancel}
      />
    )
  }
  return (
    <ParentalPinPrompt
      title={t(kind === 'unlock-tab' ? 'parental.pin.enter' : 'parental.pin.current')}
      onSubmit={async (pin) => {
        if (!(await verifyPin(pin))) return false
        if (kind === 'unlock-tab') onTabUnlocked()
        else if (kind === 'change') setCurrentChecked(true)
        else {
          await disableParentalControl()
          onFinished('disable')
        }
        return true
      }}
      onCancel={onCancel}
    />
  )
}
