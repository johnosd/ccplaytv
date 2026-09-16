import { useEffect } from 'react'

const SPLASH_DURATION_MS = 2600

export interface SplashScreenProps {
  onFinished: () => void
}

export function SplashScreen({ onFinished }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onFinished, SPLASH_DURATION_MS)
    return () => clearTimeout(timer)
  }, [onFinished])

  return (
    <div className="splash">
      <div className="splash-icon">
        <div className="splash-icon-triangle" />
      </div>
      <div className="splash-wordmark">CCPlayTv</div>
      <p className="splash-tagline">carregando suas listas…</p>
    </div>
  )
}
