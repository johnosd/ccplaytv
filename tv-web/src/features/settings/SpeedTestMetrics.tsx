import type { ReactNode } from 'react'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import { APP_LANGUAGE_LOCALE } from '../../lib/i18n/languages'
import type { SpeedTestResult } from '../../lib/network/speedTest'

/**
 * As quatro métricas de um resultado do teste de conexão (feature 064), no diálogo e no card. Não é focável.
 * Upload: número → Mbps; `null` → tentado e sem amostra ("Amostra insuficiente"); ausente → resultado de antes
 * do upload existir ("Não medido neste teste"). Os dois últimos nunca viram zero.
 */
export function SpeedTestMetrics({ result, label }: { result: SpeedTestResult; label?: string }): ReactNode {
  const t = useT()
  const number = new Intl.NumberFormat(APP_LANGUAGE_LOCALE[useLanguage()], { maximumFractionDigits: 1 })
  const value = (n: number | null, unit: string) => (n === null ? t('settings.speed.unavailable') : `${number.format(n)} ${unit}`)
  const upload = result.uploadMbps === undefined ? t('settings.speed.uploadNotMeasured') : value(result.uploadMbps, 'Mbps')
  return (
    <dl className="speed-test-metrics" aria-label={label}>
      <div><dt>{t('settings.speed.download')}</dt><dd>{value(result.downloadMbps, 'Mbps')}</dd></div>
      <div><dt>{t('settings.speed.upload')}</dt><dd>{upload}</dd></div>
      <div><dt>{t('settings.speed.latency')}</dt><dd>{value(result.latencyMs, 'ms')}</dd></div>
      <div><dt>{t('settings.speed.jitter')}</dt><dd>{value(result.jitterMs, 'ms')}</dd></div>
    </dl>
  )
}
