import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import './styles/utilities.css'
import './features/screens.css'
import App from './App.tsx'
import { Stage } from './components/Stage.tsx'
import { AnnouncerRegion } from './components/AnnouncerRegion.tsx'
import { applyMotionPreference } from './lib/motionPreference.ts'

const queryClient = new QueryClient()

// Antes do primeiro render (US4, D-005): a preferência interna de reduzir
// movimento, se já ligada numa sessão anterior, precisa valer desde o
// primeiro quadro — nunca um flash de animação antes de aplicar a classe.
applyMotionPreference()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage>
      <AnnouncerRegion>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AnnouncerRegion>
    </Stage>
  </StrictMode>,
)
