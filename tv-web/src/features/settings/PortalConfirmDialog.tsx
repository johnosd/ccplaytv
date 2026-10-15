import { useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useT } from '../../lib/i18n/I18nProvider'

/**
 * Confirmação das ações de backup e do Desvincular (feature 072): foco inicial em Cancelar, ← → alternam,
 * RETURN cancela. Nenhum valor privado aparece aqui.
 */
export function PortalConfirmDialog({ title, text, confirmLabel, busy, onCancel, onConfirm }: {
  title: string; text: string; confirmLabel: string; busy?: boolean; onCancel: () => void; onConfirm: () => void
}): ReactNode {
  const t = useT()
  const [index, setIndex] = useState(0)
  return <Modal ariaLabel={title} onBack={onCancel} onDirection={direction => {
    if (direction === 'left') setIndex(0)
    if (direction === 'right') setIndex(1)
  }} onSelect={() => (index === 0 ? onCancel() : onConfirm())}>
    <p className="modal-title">{title}</p>
    <p className="modal-description">{text}</p>
    <div className="modal-actions">
      <Button variant="secondary" focused={index === 0} onSelect={onCancel}>{t('common.cancel')}</Button>
      <Button variant="accent" focused={index === 1} loading={busy} onSelect={onConfirm}>{confirmLabel}</Button>
    </div>
  </Modal>
}
