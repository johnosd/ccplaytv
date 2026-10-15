import { useState } from 'react'
import type { ReactNode } from 'react'
import { PinPrompt } from './PinPrompt'
import { useT } from '../lib/i18n/I18nProvider'

export interface PinCreateFlowProps {
  /** Os dois PINs bateram: grava (ligar o controle, trocar o PIN, recuperar). */
  onDone: (pin: string) => Promise<void>
  onCancel: () => void
}

/**
 * Criar um PIN de 4 dígitos digitado duas vezes iguais (feature 066, FR-010). Se não baterem, recomeça do primeiro com o
 * aviso "Os PINs não são iguais" — nunca diz qual estava certo. O primeiro PIN fica só na memória do componente.
 */
export function PinCreateFlow({ onDone, onCancel }: PinCreateFlowProps): ReactNode {
  const t = useT()
  const [first, setFirst] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState(false)
  // Cada etapa é um `PinPrompt` novo (casas vazias, foco no 5).
  const [attempt, setAttempt] = useState(0)

  if (first === null) {
    return (
      <PinPrompt
        key={`create-${attempt}`}
        title={t('parental.pin.create')}
        notice={mismatch ? t('parental.pin.mismatch') : undefined}
        onSubmit={async (pin) => {
          setFirst(pin)
          return true
        }}
        onCancel={onCancel}
      />
    )
  }
  return (
    <PinPrompt
      key={`confirm-${attempt}`}
      title={t('parental.pin.confirm')}
      onSubmit={async (pin) => {
        if (pin !== first) {
          setFirst(null)
          setMismatch(true)
          setAttempt((current) => current + 1)
          return true
        }
        await onDone(pin)
        return true
      }}
      onCancel={onCancel}
    />
  )
}
