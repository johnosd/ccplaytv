import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT, type MessageKey } from '../../lib/i18n'
import { PortalApiError, type Session } from '../api'
import { FaqPage } from '../FaqPage'
import { RecoveryCodeCard } from '../RecoveryCodeCard'
import { RecoveryPage } from '../RecoveryPage'
import { BackupPage } from './BackupPage'
import { TmdbPage } from './TmdbPage'
import type { Destination } from '../shell/navigation'
import { LOGOUT_ITEM, SETTINGS_ITEMS } from './items'

const titles: Record<string, MessageKey> = { tmdb: 'settingsTmdbTitle', backup: 'settingsBackupTitle', code: 'settingsCodeTitle', recover: 'settingsRecoverTitle', help: 'settingsHelpTitle' }

/**
 * Ajustes (feature 077, US1/US5): lista de itens com título e uma linha de descrição; cada um abre uma sub-tela que
 * empilha no histórico (Voltar do celular volta à lista, com o foco no item de origem). Sair é ação direta.
 */
export function SettingsPage({ session, view, onOpen, onBack, onNavigate, onLogout }: {
  session: Session; view: string; onOpen: (view: string) => void; onBack: () => void
  onNavigate: (destination: Destination) => void; onLogout: () => Promise<void>
}) {
  const t = useT()
  const opened = useRef<string | undefined>(undefined)
  const [error, setError] = useState<PortalApiError>()
  const [busy, setBusy] = useState(false)
  // Voltar da sub-tela devolve o foco ao item que a abriu (constitution: voltar restaura o foco).
  useEffect(() => {
    if (view === '' && opened.current) document.querySelector<HTMLElement>('[data-focus-key="' + opened.current + '"]')?.focus()
  }, [view])
  async function logout() {
    if (busy) return
    setBusy(true); setError(undefined)
    try { await onLogout() } catch (caught) { setError(caught instanceof PortalApiError ? caught : new PortalApiError('network')) } finally { setBusy(false) }
  }
  if (view !== '') {
    const title = titles[view]
    if (!title) return <p role="alert">{t('invalid')}</p>
    return <>
      <div className="subpage-header">
        <button type="button" className="ghost small" onClick={onBack}><span aria-hidden="true">←</span>{t('goBack')}</button>
        <h1 data-page-title tabIndex={-1}>{t(title)}</h1>
      </div>
      {body(view)}
    </>
  }
  function body(current: string): ReactNode {
    if (current === 'tmdb') return <TmdbPage session={session} />
    if (current === 'backup') return <BackupPage session={session} />
    if (current === 'code') return <RecoveryCodeCard session={session} onRecover={() => onOpen('recover')} />
    if (current === 'recover') return <RecoveryPage onBack={onBack} />
    return <FaqPage onAction={action => {
      if (action === 'recover') onOpen('recover')
      else if (action === 'lists') onNavigate('lists')
      else if (action === 'activate') onNavigate('license')
    }} />
  }
  return <>
    <h1 data-page-title tabIndex={-1}>{t('settingsTitle')}</h1>
    <ul className="settings-list" aria-label={t('settingsTitle')}>
      {SETTINGS_ITEMS.map(item => <li key={item.id}>
        <button type="button" className="settings-item" data-focus-key={item.id} onClick={() => { opened.current = item.id; onOpen(item.view) }}>
          <span className="settings-item-title">{t(item.title)}</span><span className="settings-item-desc">{t(item.description)}</span>
        </button>
      </li>)}
      <li>
        <button type="button" className="settings-item" data-focus-key={LOGOUT_ITEM.id} aria-disabled={busy} onClick={() => void logout()}>
          <span className="settings-item-title">{t(LOGOUT_ITEM.title)}</span><span className="settings-item-desc">{t(LOGOUT_ITEM.description)}</span>
        </button>
      </li>
    </ul>
    {error && <p role="alert">{t(error.code)}</p>}
  </>
}
