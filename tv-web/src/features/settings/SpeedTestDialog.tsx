import { useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { useLanguage, useT } from '../../lib/i18n/I18nProvider'
import { APP_LANGUAGE_LOCALE } from '../../lib/i18n/languages'
import type { SpeedTestError, SpeedTestProgress, SpeedTestResult } from '../../lib/network/speedTest'

export interface SpeedTestDialogProps {
  phase: 'ready' | 'running' | 'result' | 'error' | 'blocked'
  lastResult: SpeedTestResult | null
  result: SpeedTestResult | null
  progress?: SpeedTestProgress
  error?: SpeedTestError
  storageUnavailable?: boolean
  onStart: () => void
  /** O controlador cancela a execução antes de concluir o fechamento. */
  onClose: () => void
}

/** Superfície controlada: só onStart pode iniciar tráfego. */
export function SpeedTestDialog({ phase, lastResult, result, progress, error, storageUnavailable, onStart, onClose }: SpeedTestDialogProps): ReactNode {
  const t = useT()
  const language = useLanguage()
  const [index, setIndex] = useState(0)
  const running = phase === 'running'
  const blocked = phase === 'blocked'
  const actions = running
    ? [{ label: 'common.cancel' as const, activate: onClose }]
    : blocked ? [{ label: 'settings.speed.close' as const, activate: onClose }]
      : [{ label: phase === 'ready' ? 'settings.speed.start' as const : 'settings.speed.repeat' as const, activate: onStart }, { label: 'settings.speed.close' as const, activate: onClose }]
  const effectiveIndex = Math.min(index, actions.length - 1)
  const view = result ?? lastResult
  const locale = APP_LANGUAGE_LOCALE[language]
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const value = (n: number | null, unit: string) => n === null ? t('settings.speed.unavailable') : `${number.format(n)} ${unit}`
  const stageKey = {
    warmup: 'settings.speed.warmup', latency: 'settings.speed.latencyStage',
    download: 'settings.speed.downloadStage', stopping: 'settings.speed.stopping',
  } as const

  return (
    <Modal ariaLabel={t('settings.speed.title')} onBack={onClose}
      onDirection={(direction) => setIndex(direction === 'left' || direction === 'up' ? 0 : actions.length - 1)}
      onSelect={() => actions[effectiveIndex].activate()}>
      <div className="speed-test-dialog">
        <h2 className="modal-title">{t('settings.speed.title')}</h2>
        <p className="modal-description">{t('settings.speed.destination')}</p>
        <p className="modal-description">{t('settings.speed.description')}</p>
        <p className="modal-description">{t('settings.speed.limits')}</p>
        <div role="status" aria-live="polite">
          {running && <p className="speed-test-status">{t(stageKey[progress?.stage ?? 'warmup'])}</p>}
          {error && <p className="speed-test-status">{t(error === 'storage_unavailable' ? 'settings.speed.storage' : `settings.speed.error.${error}`)}</p>}
        </div>
        {running && progress && <p className="modal-description">{t('settings.speed.traffic', {
          seconds: number.format(progress.elapsedMs / 1000), mb: number.format(progress.receivedBytes / 1_000_000),
        })}</p>}
        {!running && view && <section className="speed-test-result" aria-label={t(result ? 'settings.speed.title' : 'settings.speed.last')}>
          {!result && <h3>{t('settings.speed.last')}</h3>}
          <p>{t(view.status === 'complete' ? 'settings.speed.complete' : 'settings.speed.partial')}</p>
          <time dateTime={new Date(view.measuredAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(view.measuredAt)}</time>
          <dl className="speed-test-metrics">
            <div><dt>{t('settings.speed.download')}</dt><dd>{value(view.downloadMbps, 'Mbps')}</dd></div>
            <div><dt>{t('settings.speed.latency')}</dt><dd>{value(view.latencyMs, 'ms')}</dd></div>
            <div><dt>{t('settings.speed.jitter')}</dt><dd>{value(view.jitterMs, 'ms')}</dd></div>
          </dl>
          {view.reason !== 'completed' && <p className="modal-description">{t(`settings.speed.${view.reason}`)}</p>}
        </section>}
        {!running && !view && <p className="modal-description">{t('settings.speed.empty')}</p>}
        {storageUnavailable && <p className="speed-test-status" role="status">{t('settings.speed.storage')}</p>}
        <div className="modal-actions">
          {actions.map((action, i) => <Button key={action.label} variant={i === 0 && !running && !blocked ? 'accent' : 'secondary'} focused={effectiveIndex === i} onSelect={action.activate}>{t(action.label)}</Button>)}
        </div>
      </div>
    </Modal>
  )
}
