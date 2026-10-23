import type { CatalogDb } from '../catalog/db'
import type { MessageKey } from '../i18n/messages/pt'
import type { SubtitleProvider } from '../subtitles/types'
import type { RemoteSubtitleAck } from './subtitleKeysRemote'

export type SubtitleKeyFeedback = Partial<Record<SubtitleProvider, RemoteSubtitleAck>>

// Só o resultado mínimo do último Atualizar, em memória e isolado por banco. Sem chave, operação ou tabela nova.
const results = new WeakMap<CatalogDb, SubtitleKeyFeedback>()
export function readSubtitleKeyFeedback(database: CatalogDb): SubtitleKeyFeedback { return { ...results.get(database) } }
export function clearSubtitleKeyFeedback(database: CatalogDb, provider?: SubtitleProvider): void {
  if (!provider) results.delete(database)
  else { const current = readSubtitleKeyFeedback(database); delete current[provider]; results.set(database, current) }
}
export function recordSubtitleKeyFeedback(database: CatalogDb, provider: SubtitleProvider, ack: RemoteSubtitleAck): void {
  results.set(database, { ...results.get(database), [provider]: ack.state === 'applied'
    ? { state: 'applied' } : { state: ack.state, reason: ack.reason } })
}

export function subtitleKeyFeedbackLabel(ack?: RemoteSubtitleAck): MessageKey | undefined {
  if (!ack || ack.state === 'applied') return undefined
  const labels = {
    offline: 'subtitles.keys.remote.offline',
    rate_limited: 'subtitles.keys.remote.rate_limited',
    refused: 'subtitles.keys.remote.refused',
    invalid_format: 'subtitles.keys.remote.invalid_format',
  } as const satisfies Record<Exclude<RemoteSubtitleAck, { state: 'applied' }>['reason'], MessageKey>
  return labels[ack.reason]
}
