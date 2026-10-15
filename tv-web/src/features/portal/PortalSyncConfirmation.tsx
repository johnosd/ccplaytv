import { useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useT } from '../../lib/i18n/I18nProvider'
export function PortalSyncConfirmation({ onDecide }: { onDecide(value: boolean): void }) {
  const t = useT()
  const [index, setIndex] = useState(0)
  return <Modal ariaLabel={t('portal.confirmChange')} onBack={() => onDecide(false)}
    onDirection={direction => { if (direction === 'left') setIndex(0); if (direction === 'right') setIndex(1) }}
    onSelect={() => onDecide(index === 1)}>
    <p className="modal-title">{t('portal.confirmChange')}</p>
    <p className="modal-description">{t('portal.confirmChangeHint')}</p>
    <div className="modal-actions">
      <Button variant="secondary" focused={index === 0} onSelect={() => onDecide(false)}>{t('common.cancel')}</Button>
      <Button variant="accent" focused={index === 1} onSelect={() => onDecide(true)}>{t('portal.confirm')}</Button>
    </div>
  </Modal>
}
