import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'

export interface RemoveTmdbKeyModalProps {
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Confirmação de "Remover" a chave TMDB (feature 032, FR-014) — mesmo molde de
 * `DeleteSourceModal`: "Cancelar" focado no índice 0 (o mais seguro),
 * LEFT/RIGHT alternam, RETURN fecha sem confirmar.
 */
export function RemoveTmdbKeyModal({ onCancel, onConfirm }: RemoveTmdbKeyModalProps): ReactNode {
  const [confirmIdx, setConfirmIdx] = useState<0 | 1>(0)

  return (
    <Modal
      ariaLabel="Remover a chave do TMDB?"
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setConfirmIdx(0)
        if (direction === 'right') setConfirmIdx(1)
      }}
      onSelect={() => (confirmIdx === 0 ? onCancel() : onConfirm())}
    >
      <p className="modal-title">Remover a chave do TMDB?</p>
      <p className="modal-description">
        A chave e os detalhes que vieram do TMDB serão apagados deste aparelho. O que a sua lista informa continua.
        Você pode configurar de novo quando quiser.
      </p>
      <div className="modal-actions">
        <Button variant="secondary" focused={confirmIdx === 0} onSelect={onCancel}>
          Cancelar
        </Button>
        <Button variant="accent" focused={confirmIdx === 1} onSelect={onConfirm}>
          Remover
        </Button>
      </div>
    </Modal>
  )
}
