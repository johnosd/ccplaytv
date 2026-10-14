import '../styles/screens.css'
import { useSyncExternalStore } from 'react'
import { useT } from '../lib/i18n/I18nProvider'
import { getSeriesDiagnostics, subscribeSeriesDiagnostics } from '../lib/diagnostics/seriesDiagnostics'

export function DiagnosticReport() {
  const t = useT()
  const report = useSyncExternalStore(subscribeSeriesDiagnostics, getSeriesDiagnostics, getSeriesDiagnostics)
  return (
    <section className="diagnostic-report" aria-label={t('diagnostic.title')}>
      <p>{t('diagnostic.photo')}</p>
      <pre data-testid="series-diagnostics">{report}</pre>
    </section>
  )
}
