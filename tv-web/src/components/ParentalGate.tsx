import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ParentalPinPrompt } from './ParentalPinPrompt'
import { hasPin, verifyPin } from '../lib/parental/pin'
import { useT } from '../lib/i18n/I18nProvider'

export interface ParentalGateProps {
  /** RETURN ou "Cancelar" no PIN: a tela protegida nem chega a abrir. */
  onCancel: () => void
  children: ReactNode
}

/**
 * Com o controle parental ligado, pede o PIN antes de mostrar a tela (feature 066, FR-017; D-008). Sem PIN, mostra a tela
 * direto — inclusive a primeira lista, que nunca pede PIN. A conferência do PIN existir é uma leitura local e curta.
 */
export function ParentalGate({ onCancel, children }: ParentalGateProps): ReactNode {
  const t = useT()
  const [state, setState] = useState<'checking' | 'ask' | 'open'>('checking')

  useEffect(() => {
    let alive = true
    void hasPin().then((active) => {
      if (alive) setState(active ? 'ask' : 'open')
    })
    return () => {
      alive = false
    }
  }, [])

  if (state === 'open') return children
  return (
    <div className="screen">
      {state === 'ask' && (
        <ParentalPinPrompt
          title={t('parental.pin.enter')}
          onSubmit={async (pin) => {
            const accepted = await verifyPin(pin)
            if (accepted) setState('open')
            return accepted
          }}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

