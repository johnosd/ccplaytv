import { useT, type MessageKey } from '../lib/i18n'
import type { Operation } from './api'
const labels: Record<string, MessageKey> = { pending: 'pending', received: 'received', awaiting_confirmation: 'awaiting_confirmation',
  applied: 'applied', conflict: 'conflict', error: 'error', cancelled: 'cancelled', expired: 'expired' }
// Um indicador só por card: anel girando (em andamento), ✓ (concluído), ! (falha) ou – (encerrado).
// O texto completo segue para leitores de tela e como dica (title); a forma do ícone nunca depende só da cor.
function tone(operation: Operation): 'progress' | 'success' | 'error' | 'neutral' {
  if (['conflict', 'error'].includes(operation.state) || operation.importState === 'error') return 'error'
  if (['cancelled', 'expired'].includes(operation.state)) return 'neutral'
  if (operation.state !== 'applied' || ['queued', 'running'].includes(operation.importState ?? '')) return 'progress'
  return 'success'
}
export function OperationStatus({ operation, onCancel }: { operation: Operation; onCancel: () => void }) {
  const t = useT()
  const imports: Record<string, MessageKey> = { queued: 'queued', running: 'running', completed: 'completed', error: 'importError' }
  const cancellable = operation.action !== 'source.delete' && ['pending', 'received', 'awaiting_confirmation'].includes(operation.state)
  const state = t(labels[operation.state] ?? 'error')
  const imported = operation.importState ? t(imports[operation.importState] ?? 'importError') : undefined
  const kind = tone(operation)
  return <div className={'operation is-' + kind}>
    <span className="operation-indicator" title={imported ? state + ' · ' + imported : state} aria-hidden="true">
      {kind === 'progress' ? <span className="operation-spinner" /> : <svg viewBox="0 0 24 24" focusable="false">
        {kind === 'success' ? <path className="operation-check" d="M5 12.5l4.5 4.5L19 7.5" /> : kind === 'error' ? <path d="M12 6v8M12 18h.01" /> : <path d="M7 12h10" />}
      </svg>}
    </span>
    <p role="status" className="visually-hidden">{state}</p>
    {imported && <p className="visually-hidden">{imported}</p>}
    {cancellable && <button className="small ghost operation-cancel" onClick={onCancel}>{t('cancelDelivery')}</button>}
  </div>
}
