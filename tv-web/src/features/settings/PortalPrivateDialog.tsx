import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useT } from '../../lib/i18n/I18nProvider'
import type { PortalDeviceRecord } from '../../lib/portal/portalTables'
export type PortalDialogKind = 'key' | 'code' | 'revoke' | 'rotate'
export function PortalPrivateDialog({ kind, device, onCancel, onConfirm }: {
  kind: PortalDialogKind; device?: PortalDeviceRecord; onCancel: () => void; onConfirm: () => void
}) {
  const t = useT()
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [deadline] = useState(() => Date.now() + 60000)
  const privateValue = kind === 'key' || kind === 'code'
  const title = t(kind === 'key' ? 'portal.showKey' : kind === 'code' ? 'portal.showCode' : kind === 'revoke' ? 'portal.revoke' : 'portal.rotateCode')
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') onCancel() }
    const timer = setInterval(() => { if (Date.now() >= deadline) onCancel() }, 1000)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', onCancel)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', onCancel) }
  }, [deadline, onCancel])
  function confirm() {
    if (privateValue) setRevealed(true)
    else onConfirm()
  }
  return <Modal ariaLabel={title} onBack={onCancel} onDirection={direction => {
    if (direction === 'left') setIndex(0)
    if (direction === 'right') setIndex(1)
  }} onSelect={() => revealed || index === 0 ? onCancel() : confirm()}>
    <p className="modal-title">{title}</p>
    {revealed ? <>
      <p className="portal-private-value">{kind === 'key' ? device?.deviceKey : device?.recoveryCode}</p>
      {kind === 'code' && <p className="modal-description">{t('portal.codeHint')}</p>}
      <div className="modal-actions"><Button variant="secondary" focused onSelect={onCancel}>{t('portal.close')}</Button></div>
    </> : <>
      <p className="modal-description">{t(privateValue ? 'portal.privateWarning' : kind === 'revoke' ? 'portal.revokeHint' : 'portal.rotateHint')}</p>
      <div className="modal-actions">
        <Button variant="secondary" focused={index === 0} onSelect={onCancel}>{t('common.cancel')}</Button>
        <Button variant="accent" focused={index === 1} onSelect={confirm}>{privateValue ? t('portal.reveal') : t('portal.confirm')}</Button>
      </div>
    </>}
  </Modal>
}
