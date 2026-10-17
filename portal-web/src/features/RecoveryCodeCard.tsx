import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { api, PortalApiError, type Session } from './api'

/**
 * Código de recuperação da TV (feature 073, US3, constitution 1.13.0 (i)): fica oculto até a pessoa pedir; mostrado
 * com aviso de credencial privada e o caminho de recuperação. Nada vai para URL, storage ou log; some ao trocar de
 * aba/ocultar a página. 409 = a TV ainda não enviou a cópia do código atual (Atualizar na TV).
 */
export function RecoveryCodeCard({ session, onRecover }: { session: Session; onRecover?: () => void }) {
  const t = useT()
  const [code, setCode] = useState<string>()
  const [error, setError] = useState<PortalApiError>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') setCode(undefined) }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', hide)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide) }
  }, [])
  async function reveal() {
    if (busy) return
    setBusy(true); setError(undefined)
    try { setCode((await api.revealRecoveryCode(session)).recoveryCode) }
    catch (caught) { setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) }
    finally { setBusy(false) }
  }
  return <section className="panel recovery-code-card" aria-labelledby="recovery-code-title">
    <h3 id="recovery-code-title">{t('recoveryCodeTitle')}</h3>
    <p>{t('recoveryCodeHint')}</p>
    {code ? <>
      <output className="readonly-value mono recovery-code-value" aria-label={t('recoveryCodeTitle')}>{code}</output>
      <p className="notice is-warning">{t('recoveryCodeWarning')}</p>
    </> : null}
    {error && <p role="alert">{error.code === 'conflict' ? t('recoveryCodeMissing') : t(error.code)}</p>}
    <div className="actions">
      {code ? <button className="small" onClick={() => setCode(undefined)}>{t('recoveryCodeHide')}</button>
        : <button className="small primary" disabled={busy} onClick={() => void reveal()}>{t('recoveryCodeShow')}</button>}
      {onRecover && <button className="small ghost" onClick={onRecover}>{t('recoveryCodeRecover')}</button>}
    </div>
  </section>
}
