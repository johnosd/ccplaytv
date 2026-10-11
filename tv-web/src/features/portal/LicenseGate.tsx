import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { useT } from '../../lib/i18n/I18nProvider'
import { commercialBuild, licenseMonitor, onListEntryDenied } from '../../lib/licensing/licenseRuntime'
export function LicenseGate({ onStop, onPortal, activeSourceId }: { onStop(sourceId?: string): void; onPortal(): void; activeSourceId?: string }) {
  const t = useT()
  const [blocked, setBlocked] = useState(false)
  const [focused, setFocused] = useState(0)
  const callbacks = useRef({ onStop, onPortal, activeSourceId })
  useEffect(() => { callbacks.current = { onStop, onPortal, activeSourceId } }, [onStop, onPortal, activeSourceId])
  useEffect(() => {
    if (!commercialBuild) return
    let previous = licenseMonitor.check().reason
    const block = (sourceId?: string) => { flushSync(() => callbacks.current.onStop(sourceId)); setFocused(0); setBlocked(true) }
    const denied = onListEntryDenied(block)
    const changed = licenseMonitor.subscribe(() => {
      const next = licenseMonitor.check()
      // Revogação confirmada mantém o encerramento; vencimento só barra a próxima entrada.
      if (next.reason === 'revoked' && previous !== 'revoked' && callbacks.current.activeSourceId) block()
      previous = next.reason
      if (next.allowed) setBlocked(false)
    })
    return () => { denied(); changed() }
  }, [])
  if (!blocked) return null
  const back = () => setBlocked(false)
  const buy = () => { setBlocked(false); callbacks.current.onPortal() }
  return <Modal ariaLabel={t('portal.licenseBlocked')} onBack={back}
    onDirection={direction => { if (direction === 'left' || direction === 'up') setFocused(0); else setFocused(1) }}
    onSelect={() => focused === 0 ? buy() : back()}>
    <h2>{t('portal.licenseBlocked')}</h2><p>{t('portal.licenseBlockedHint')}</p>
    <Button focused={focused === 0} variant="accent" onSelect={buy}>{t('portal.licenseBuy')}</Button>
    <Button focused={focused === 1} variant="secondary" onSelect={back}>{t('portal.licenseBack')}</Button>
  </Modal>
}
