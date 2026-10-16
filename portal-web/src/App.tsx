import { LicenseCard } from './features/license/LicenseCard'
import { RecoveryPage, type StartupRecovery } from './features/RecoveryPage'
import { useCallback, useState } from 'react'
import { useT } from './lib/i18n'
import { api, PortalApiError, rememberSession, type Session } from './features/api'
import { SessionPage, type StartupSession } from './features/session/SessionPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { ListsPage } from './features/lists/ListsPage'
import { PortalShell } from './features/shell/PortalShell'
import { SessionGuard } from './features/shell/SessionGuard'
import { TvDataProvider } from './features/shell/TvDataProvider'
import { ROOT, root, type Destination } from './features/shell/navigation'
import { useNavigation } from './features/shell/useNavigation'

/**
 * Portal (features 069–077): sem sessão, a entrada (ou a recuperação por QR); com sessão, a casca com três destinos —
 * Listas, Licença e Ajustes — e o resumo fixo da TV. A navegação é por estado + `history`, sem mudar a URL.
 */
export function App({ startup, recoveryStartup, initialDestination }: { startup?: StartupSession; recoveryStartup?: StartupRecovery; initialDestination?: Destination }) {
  const t = useT()
  const [initialSession, setInitialSession] = useState(startup)
  const [recovering, setRecovering] = useState(!!recoveryStartup)
  const [initialRecovery, setInitialRecovery] = useState(recoveryStartup)
  const [session, setCurrentSession] = useState<Session>()
  // A sessão fica na aba para sobreviver à ida e volta ao Checkout Pro (main.tsx retoma).
  const [sessionEnded, setSessionEnded] = useState(false)
  const setSession = useCallback((value: Session | undefined) => { rememberSession(value); setCurrentSession(value); if (value) setSessionEnded(false) }, [])
  const { state, go, back } = useNavigation(initialDestination ? root(initialDestination) : ROOT)
  // 077: sessão encerrada no meio do uso → entrada com o ID lembrado e o aviso (o ID só some com "Usar outra TV").
  const endSession = useCallback(() => { rememberSession(undefined); setCurrentSession(undefined); setSessionEnded(true); go(ROOT) }, [go])

  async function logout() {
    if (!session) return
    try { await api.logout(session) } catch (caught) { if (!(caught instanceof PortalApiError && caught.code === 'access')) throw caught }
    setInitialSession(undefined); setSession(undefined); go(ROOT)
  }
  const header = <header className="portal-header">
    <div className="brand" aria-label="CCPlayTV"><span className="brand-mark" aria-hidden="true"><span /></span><span className="brand-wordmark">CCPlayTV</span></div>
    <h1>{t('title')}</h1>
  </header>
  const footer = <footer className="portal-footer"><small>CCPlayTV</small></footer>

  if (recovering) return <main lang={t('lang')}>{header}
    <RecoveryPage startup={initialRecovery} onBack={() => { setRecovering(false); setInitialRecovery(undefined) }} />{footer}</main>
  if (!session) return <main lang={t('lang')}>{header}<SessionPage startup={initialSession} onSession={setSession} ended={sessionEnded} />{footer}</main>

  return <TvDataProvider session={session}>
    <SessionGuard onEnded={endSession} />
    <PortalShell state={state} onGo={destination => go(root(destination))}>
      {state.destination === 'license'
        ? <LicenseCard session={session} />
        : state.destination === 'settings'
          ? <SettingsPage session={session} view={state.view} onOpen={view => go({ destination: 'settings', view })} onBack={() => back(root('settings'))}
            onNavigate={destination => go(root(destination))} onLogout={logout} />
          : <ListsPage session={session} view={state.view} onOpenEditor={() => go({ destination: 'lists', view: 'editor' })} onCloseEditor={() => back(root('lists'))} />}
    </PortalShell>
  </TvDataProvider>
}
