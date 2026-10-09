import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import './styles/font-scale.css'
import './styles/screen-margins.css'
import './styles/utilities.css'
import './styles/components.css'
import './styles/live.css'
import './styles/vod.css'
import './styles/shared.css'
import './styles/player.css'
import './styles/trailer.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/profiles.css'
import './styles/onboarding.css'
import './styles/settings.css'
import './styles/search.css'
import './styles/guide.css'
import App from './App.tsx'
import { Stage } from './components/Stage.tsx'
import { AnnouncerRegion } from './components/AnnouncerRegion.tsx'
import { PerfOverlay } from './components/PerfOverlay.tsx'
import { ImeProbeOverlay } from './components/ImeProbeOverlay.tsx'
import { prepareLocalStartup } from './lib/startupReadiness.ts'
import { I18nProvider } from './lib/i18n/I18nProvider.tsx'

const queryClient = new QueryClient()

// Antes do primeiro render (US4, D-005): a preferência interna de reduzir
// movimento, se já ligada numa sessão anterior, precisa valer desde o
// primeiro quadro — nunca um flash de animação antes de aplicar a classe.
prepareLocalStartup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage>
      <I18nProvider>
        <AnnouncerRegion>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </AnnouncerRegion>
      </I18nProvider>
      {/* Build de medição da feature 038 (FR-012) — fora dele, este ramo some do pacote. */}
      {import.meta.env.VITE_CCPLAY_PERF === '1' && <PerfOverlay />}
      {/* Sonda do IME da feature 045 (T001) — só com `VITE_CCPLAY_IME_PROBE=1`. */}
      {import.meta.env.VITE_CCPLAY_IME_PROBE === '1' && <ImeProbeOverlay />}
    </Stage>
  </StrictMode>,
)

