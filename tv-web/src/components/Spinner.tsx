import type { ReactNode } from 'react'
import { useT } from '../lib/i18n/I18nProvider'

export interface SpinnerProps {
  size: 20 | 32 | 48
}

/** Indicador de ocupado, nunca percentual (feature 022, D-013 do plan.md). */
export function Spinner({ size }: SpinnerProps): ReactNode {
  const t = useT()
  return (
    <div className="spinner" role="status" style={{ width: size, height: size }}>
      <span className="sr-only">{t('spinner.loading')}</span>
    </div>
  )
}
