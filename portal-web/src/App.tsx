import { LicensePage } from './features/LicensePage'
import { RecoveryPage, type StartupRecovery } from './features/RecoveryPage'
import { useState } from 'react'
import { useT } from './lib/i18n'
import type { Session } from './features/api'
import { SessionPage, type StartupSession } from './features/SessionPage'
import { SourceManager } from './features/SourceManager'
export function App({ startup, recoveryStartup }: { startup?: StartupSession; recoveryStartup?: StartupRecovery }) {
  const t = useT()
  const [initialSession, setInitialSession] = useState(startup)
  const [recovering, setRecovering] = useState(!!recoveryStartup)
  const [initialRecovery, setInitialRecovery] = useState(recoveryStartup)
  const [license, setLicense] = useState(false)
  const [session, setSession] = useState<Session>()
  return <main lang={t('lang')}>
    <header><p className="wordmark">CCPlayTV</p><h1>{t('title')}</h1></header>
    <p role="status">{t('preparing')}</p>
    <button onClick={() => window.location.reload()}>{t('reload')}</button>
    {recovering ? <RecoveryPage startup={initialRecovery} onBack={() => { setRecovering(false); setInitialRecovery(undefined) }} /> : session ? <><nav aria-label={t('title')}><button onClick={() => setLicense(false)}>{t('sources')}</button><button onClick={() => setLicense(true)}>{t('license')}</button></nav>{license ? <LicensePage session={session} /> : <SourceManager session={session} onLogout={() => { setInitialSession(undefined); setSession(undefined) }} />}</>
      : <SessionPage startup={initialSession} onSession={setSession} onRecover={() => setRecovering(true)} />}
  </main>
}
