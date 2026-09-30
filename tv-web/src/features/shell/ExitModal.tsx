import { useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { exitApp } from '../../lib/tizenExit'

export interface ExitModalProps {
  /** "Cancelar" e RETURN — fecha o modal sem sair. */
  onCancel: () => void
  /** "Sair"; padrão: encerra o app Tizen (no navegador de desenvolvimento é um no-op). */
  onExit?: () => void
}

/**
 * "Sair do CCPlayTV?" (feature 023, D-011 do plan.md): modal único de saída,
 * usado pelo Início e pela tela de perfis quando ela é a base da pilha.
 * "Cancelar" nasce em foco (o mais seguro); RETURN equivale a Cancelar
 * (FR-030). O foco entre os dois botões é estado — o `Modal` é só a casca
 * (feature 022, R-006).
 */
export function ExitModal({ onCancel, onExit = exitApp }: ExitModalProps): ReactNode {
  const [focusIndex, setFocusIndex] = useState<0 | 1>(0) // 0 = Cancelar, 1 = Sair

  return (
    <Modal
      ariaLabel="Sair do CCPlayTV?"
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setFocusIndex(0)
        if (direction === 'right') setFocusIndex(1)
      }}
      onSelect={() => (focusIndex === 0 ? onCancel() : onExit())}
    >
      <p className="modal-title">Sair do CCPlayTV?</p>
      <p className="modal-description">Você pode voltar ao aplicativo depois e continuar de onde parou.</p>
      <div className="modal-actions">
        <Button variant="secondary" focused={focusIndex === 0} onSelect={onCancel}>
          Cancelar
        </Button>
        <Button variant="accent" focused={focusIndex === 1} onSelect={onExit}>
          Sair
        </Button>
      </div>
    </Modal>
  )
}
