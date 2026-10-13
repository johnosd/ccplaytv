import { FaqPage } from './features/FaqPage'
import { LicensePage } from './features/LicensePage'
import { RecoveryPage, type StartupRecovery } from './features/RecoveryPage'
import { useState } from 'react'
import { useT } from './lib/i18n'
import type { Session } from './features/api'
import { SessionPage, type StartupSession } from './features/SessionPage'
import { SellersPage } from './features/SellersPage'
import { SourceManager } from './features/SourceManager'
export function App({ startup, recoveryStartup }: { startup?: StartupSession; recoveryStartup?: StartupRecovery }) {
  const t = useT()
  const [initialSession, setInitialSession] = useState(startup)
  const [recovering, setRecovering] = useState(!!recoveryStartup)
  const [initialRecovery, setInitialRecovery] = useState(recoveryStartup)
  const [tab, setTab] = useState<'lists' | 'activate' | 'sellers' | 'faq'>('lists')
  // Clicar em "Suas listas" de novo (por exemplo, na tela de edição) volta à grade de listas.
  const [listsView, setListsView] = useState(0)
  const [session, setSession] = useState<Session>()
  return <main lang={t('lang')}>
    <header className="portal-header">
      <div className="brand" aria-label="CCPlayTV">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span className="brand-wordmark">CCPlayTV</span>
      </div>
      <h1>{t('title')}</h1>
    </header>
    {recovering ? <RecoveryPage startup={initialRecovery} onBack={() => { setRecovering(false); setInitialRecovery(undefined) }} /> : session ? <div className="portal-app">
      <div className="portal-toolbar">
        <nav className="portal-tabs" aria-label={t('title')}>
          <button aria-current={tab === 'lists' ? 'page' : undefined} onClick={() => { if (tab === 'lists') setListsView(value => value + 1); setTab('lists') }}>{t('sources')}</button>
          <button aria-current={tab === 'activate' ? 'page' : undefined} onClick={() => setTab('activate')}>{t('activate')}</button>
          <button aria-current={tab === 'sellers' ? 'page' : undefined} onClick={() => setTab('sellers')}>{t('sellers')}<span className="tab-soon">{t('comingSoon')}</span></button>
          <button aria-current={tab === 'faq' ? 'page' : undefined} onClick={() => setTab('faq')}>FAQ</button>
        </nav>
        <div className="authenticated-actions" role="group" aria-label={t('title')}>
          <button className="ghost small" onClick={() => window.location.reload()}>{t('reload')}</button>
          <button className="ghost small" onClick={() => setRecovering(true)}>{t('recoveryTitle')}</button>
        </div>
      </div>
      {tab === 'activate' ? <LicensePage session={session} /> : tab === 'sellers' ? <SellersPage /> : tab === 'faq' ? <FaqPage onAction={action => { if (action === 'recover') setRecovering(true); else { setTab(action); window.scrollTo(0, 0) } }} /> : <SourceManager key={listsView} session={session} onOpenLicense={() => setTab('activate')} onLogout={() => { setInitialSession(undefined); setSession(undefined) }} />}
    </div>
      : <SessionPage startup={initialSession} onSession={setSession} />}
    <footer className="portal-footer"><small>CCPlayTV</small></footer>
  </main>
}
