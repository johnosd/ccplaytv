import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useT } from '../../lib/i18n/I18nProvider'

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
  const t = useT()
  const [confirmIdx, setConfirmIdx] = useState<0 | 1>(0)

  return (
    <Modal
      ariaLabel={t('settings.removeKey.title')}
      onBack={onCancel}
      onDirection={(direction) => {
        if (direction === 'left') setConfirmIdx(0)
        if (direction === 'right') setConfirmIdx(1)
      }}
      onSelect={() => (confirmIdx === 0 ? onCancel() : onConfirm())}
    >
      <p className="modal-title">{t('settings.removeKey.title')}</p>
      <p className="modal-description">{t('settings.removeKey.description')}</p>
      <div className="modal-actions">
        <Button variant="secondary" focused={confirmIdx === 0} onSelect={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="accent" focused={confirmIdx === 1} onSelect={onConfirm}>
          {t('common.remove')}
        </Button>
      </div>
    </Modal>
  )
}
