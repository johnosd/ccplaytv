import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import type { SourceOut } from '../import/importApi'

export interface DeleteSourceModalProps {
  source: SourceOut
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Confirmação de exclusão de lista — compartilhada entre a tela de perfis e
 * Configurações › Fontes IPTV (feature 026, D-007). Extraída de
 * `ProfilesScreen.tsx` (feature 023) sem mudar texto nem comportamento:
 * "Cancelar" focado no índice 0 (o mais seguro), LEFT/RIGHT alternam,
 * RETURN fecha sem confirmar.
 */
export function DeleteSourceModal({ source, onCancel, onConfirm }: DeleteSourceModalProps): ReactNode {
  const [confirmIdx, setConfirmIdx] = useState<0 | 1>(0)

  return (
    <Modal
      ariaLabel={`Excluir a lista ${source.display_name}?`}
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setConfirmIdx(0)
        if (direction === 'right') setConfirmIdx(1)
      }}
      onSelect={() => (confirmIdx === 0 ? onCancel() : onConfirm())}
    >
      <p className="modal-title">Excluir a lista {source.display_name}?</p>
      <p className="modal-description">
        Os favoritos e o ponto de retomada desta lista também serão apagados. Isso não pode ser desfeito.
      </p>
      <div className="modal-actions">
        <Button variant="secondary" focused={confirmIdx === 0} onSelect={onCancel}>
          Cancelar
        </Button>
        <Button variant="accent" focused={confirmIdx === 1} onSelect={onConfirm}>
          Excluir
        </Button>
      </div>
    </Modal>
  )
}
