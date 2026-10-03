import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useT } from '../../lib/i18n/I18nProvider'
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
  const t = useT()
  const [confirmIdx, setConfirmIdx] = useState<0 | 1>(0)
  const title = t('delete.title', { name: source.display_name })

  return (
    <Modal
      ariaLabel={title}
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setConfirmIdx(0)
        if (direction === 'right') setConfirmIdx(1)
      }}
      onSelect={() => (confirmIdx === 0 ? onCancel() : onConfirm())}
    >
      <p className="modal-title">{title}</p>
      <p className="modal-description">{t('delete.description')}</p>
      <div className="modal-actions">
        <Button variant="secondary" focused={confirmIdx === 0} onSelect={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="accent" focused={confirmIdx === 1} onSelect={onConfirm}>
          {t('delete.confirm')}
        </Button>
      </div>
    </Modal>
  )
}
