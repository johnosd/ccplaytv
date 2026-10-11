import { useT, type MessageKey } from '../lib/i18n'
import type { Operation } from './api'
const labels: Record<string, MessageKey> = { pending: 'pending', received: 'received', awaiting_confirmation: 'awaiting_confirmation',
  applied: 'applied', conflict: 'conflict', error: 'error', cancelled: 'cancelled', expired: 'expired' }
export function OperationStatus({ operation, onCancel }: { operation: Operation; onCancel: () => void }) {
  const t = useT()
  const imports: Record<string, MessageKey> = { queued: 'queued', running: 'running', completed: 'completed', error: 'importError' }
  const cancellable = operation.action !== 'source.delete' && ['pending', 'received', 'awaiting_confirmation'].includes(operation.state)
  return <div className="operation">
    <p role="status">{t(labels[operation.state] ?? 'error')}</p>
    {operation.importState && <p>{t(imports[operation.importState] ?? 'importError')}</p>}
    {cancellable && <button onClick={onCancel}>{t('cancelDelivery')}</button>}
  </div>
}
