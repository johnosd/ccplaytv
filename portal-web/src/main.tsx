import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { api, PortalApiError, takeEntry } from './features/api'
import './styles.css'
// Remover fragmento antes de qualquer requisição; exchange único em StrictMode.
const entry = takeEntry(window.location, window.history)
const failure = (error: unknown) => ({ error: error instanceof PortalApiError ? error : new PortalApiError('network') })
const startup = entry?.kind === 'invite' ? api.exchange(entry.token).then(session => ({ session }), failure) : undefined
const recoveryStartup = entry?.kind === 'recovery' ? api.recoveryExchange(entry.token).then(session => ({ session }), failure) : undefined
createRoot(document.getElementById('root')!).render(<StrictMode><App startup={startup} recoveryStartup={recoveryStartup} /></StrictMode>)
