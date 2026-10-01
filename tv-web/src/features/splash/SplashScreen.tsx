import { useEffect } from 'react'
import { Spinner } from '../../components/Spinner'

const SPLASH_DURATION_MS = 2600

export interface SplashScreenProps {
  onFinished: () => void
}

/**
 * Abertura do app no visual V14 (feature 023, US5/FR-041): marca com o
 * gradiente de marca, wordmark, tagline e um indicador de carregamento
 * indeterminado — `Spinner` (feature 022), nunca um número. O tempo é o de
 * sempre; a animação usa só tokens de movimento, que a preferência de reduzir
 * movimento (feature 021) já colapsa em estado final.
 */
export function SplashScreen({ onFinished }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onFinished, SPLASH_DURATION_MS)
    return () => clearTimeout(timer)
  }, [onFinished])

  return (
    <div className="splash">
      <div className="splash-mark" aria-hidden="true">
        <div className="splash-mark-triangle" />
      </div>
      <div className="splash-wordmark">CCPlayTv</div>
      <p className="splash-tagline">carregando suas listas…</p>
      <div className="splash-loader">
        <Spinner size={32} />
      </div>
    </div>
  )
}
