import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ParentalPinPrompt } from './ParentalPinPrompt'
import { hasPin, verifyPin } from '../lib/parental/listPin'
import { useT } from '../lib/i18n/I18nProvider'

export interface ParentalGateProps {
  /**
   * A lista protegida (feature 067: o PIN é por lista). Ausente = a tela não é de uma lista com dono (adicionar lista),
   * e abre direto — adicionar lista não pede PIN (067, FR-021).
   */
  sourceId?: string
  /** RETURN ou "Cancelar" no PIN: a tela protegida nem chega a abrir. */
  onCancel: () => void
  children: ReactNode
}

/**
 * Com o controle parental ligado na lista, pede o PIN dela antes de mostrar a tela (feature 066, FR-017; D-008; 067,
 * FR-020). Sem PIN na lista, ou sem lista, mostra a tela direto. A conferência do PIN existir é uma leitura local e curta.
 */
export function ParentalGate({ sourceId, onCancel, children }: ParentalGateProps): ReactNode {
  const t = useT()
  const [state, setState] = useState<'checking' | 'ask' | 'open'>(sourceId === undefined ? 'open' : 'checking')

  useEffect(() => {
    if (sourceId === undefined) return
    let alive = true
    void hasPin(sourceId).then((active) => {
      if (alive) setState(active ? 'ask' : 'open')
    })
    return () => {
      alive = false
    }
  }, [sourceId])

  if (state === 'open') return children
  return (
    <div className="screen">
      {state === 'ask' && sourceId !== undefined && (
        <ParentalPinPrompt
          sourceId={sourceId}
          title={t('parental.pin.enter')}
          onSubmit={async (pin) => {
            const accepted = await verifyPin(sourceId, pin)
            if (accepted) setState('open')
            return accepted
          }}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

