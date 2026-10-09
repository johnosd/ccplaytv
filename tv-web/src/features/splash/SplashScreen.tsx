import { useEffect, useState } from 'react'
import { Spinner } from '../../components/Spinner'
import { useT } from '../../lib/i18n/I18nProvider'
import { useRemoteNav } from '../../lib/useRemoteNav'

export interface SplashScreenProps {
  onFinished: () => void
  ready: boolean
}

/**
 * Abertura do app no visual V14 (feature 023, US5/FR-041): marca com o
 * gradiente de marca, wordmark, tagline e um indicador de carregamento
 * indeterminado — `Spinner` (feature 022), nunca um número. A prontidão local
 * substitui o timer fixo; a animação usa tokens, que a preferência de reduzir
 * movimento (feature 021) já colapsa em estado final.
 */
export function SplashScreen({ onFinished, ready }: SplashScreenProps) {
  const t = useT()
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPainted(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    if (ready && painted) onFinished()
  }, [onFinished, ready, painted])
  // Recuperação local: Perfis possui seus próprios estados de carga/erro.
  useRemoteNav({ onSelect: onFinished, onBack: onFinished })

  return (
    <div className="screen splash">
      <div className="splash-mark" aria-hidden="true">
        <div className="splash-mark-triangle" />
      </div>
      <div className="splash-wordmark">CCPlayTv</div>
      <p className="splash-tagline">{t('home.splash.loading')}</p>
      <div className="splash-loader">
        <Spinner size={32} />
      </div>
      <button type="button" className="button-secondary tv-focus" onClick={onFinished}>
        {t('common.back')}
      </button>
    </div>
  )
}
