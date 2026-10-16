import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { api, PortalApiError, rememberSession, storedSession, takeEntry } from './features/api'
import './styles.css'
// Remover fragmento antes de qualquer requisição; exchange único em StrictMode.
const entry = takeEntry(window.location, window.history)
// Volta do Checkout Pro (`back_urls` = `/?checkout=return`): abre a aba de compra e limpa o endereço.
const checkoutReturn = new URLSearchParams(window.location.search).get('checkout') === 'return'
if (checkoutReturn) window.history.replaceState(null, '', window.location.pathname)
const failure = (error: unknown) => ({ error: error instanceof PortalApiError ? error : new PortalApiError('network') })
const saved = entry ? undefined : storedSession()
// Convite efêmero (069) ou QR fixo da TV (071: ID + chave no fragmento → entrada manual, mesmos limites e recusa uniforme).
const startup = entry?.kind === 'invite' ? api.exchange(entry.token).then(session => ({ session }), failure)
  : entry?.kind === 'device' ? api.manual(entry.displayId, entry.deviceKey).then(session => ({ session }), failure)
  // Sessão desta aba: só vale se o cookie ainda autentica a mesma TV; senão, formulário limpo, sem erro.
  : saved ? api.licenseDevice().then(info => {
    if (info.deviceId === saved.deviceId) return { session: saved }
    rememberSession(undefined); return {}
  }, () => { rememberSession(undefined); return {} }) : undefined
const recoveryStartup = entry?.kind === 'recovery' ? api.recoveryExchange(entry.token).then(session => ({ session }), failure) : undefined
createRoot(document.getElementById('root')!).render(<StrictMode><App startup={startup} recoveryStartup={recoveryStartup}
  initialTab={checkoutReturn ? 'activate' : undefined} /></StrictMode>)
