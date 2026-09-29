import type { ReactNode } from 'react'
import { useEpgSyncing, type SourceOut } from '../import/importApi'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { formatEpgStatus, formatStatus, formatType } from '../sources/sourceFormat'
import { LimitedModeNotice } from '../sources/LimitedModeNotice'

/** Sentinela do "Adicionar lista" (nunca um id real, `logic/foco-configuracoes.md` §3). */
export const ADD_SOURCE_ID = '__add-source__'

/** Editar, Ressincronizar, Excluir, EPG (feature 026, `logic/foco-configuracoes.md` §3). */
export const SOURCES_ACTION_COUNT = 4
const ACTION_LABELS = ['Editar', 'Ressincronizar', 'Excluir', 'EPG']

/** Linha de estado do EPG (feature 030, FR-015) — componente próprio para poder assinar "sincronizando" por lista. */
function SourceEpgStatus({ source }: { source: SourceOut }): ReactNode {
  const syncing = useEpgSyncing(source.id)
  return <span className="sources-panel-epg">{formatEpgStatus(source, syncing)}</span>
}

export interface SourcesPanelProps {
  sources: SourceOut[]
  activeSourceId: string | null
  /** `undefined` = nenhuma linha focada agora (zona `tabs`) — nada ganha `.tv-focus`. */
  focusedRowId?: string
  focusedCol: number
  resyncPending: boolean
  deletePending: boolean
  onActivateRow: (rowId: string, col: number) => void
}

/**
 * Fontes IPTV — aba inicial de Configurações (feature 026, US2, real).
 * Nunca renderiza `provider_dns`, URL, usuário ou senha (FR-024) — nem em
 * `aria-label`, `title` ou texto oculto.
 */
export function SourcesPanel({
  sources,
  activeSourceId,
  focusedRowId,
  focusedCol,
  resyncPending,
  deletePending,
  onActivateRow,
}: SourcesPanelProps): ReactNode {
  return (
    <div className="sources-panel">
      {sources.map((source) => {
        const isFocusedRow = focusedRowId === source.id
        return (
          <div key={source.id} role="group" aria-label={`Lista ${source.display_name}`} className="sources-panel-row">
            <div className="sources-panel-info">
              <span className="sources-panel-name">{source.display_name}</span>
              <span className="sources-panel-type">{formatType(source)}</span>
              {source.id === activeSourceId && <span className="sources-panel-badge">Lista ativa</span>}
              <span className="sources-panel-status">{formatStatus(source)}</span>
              <SourceEpgStatus source={source} />
              {source.provider_import_mode === 'legacy_m3u' && (
                // O próprio título de `LimitedModeNotice` já diz "Modo limitado" — não
                // duplicar como badge separado (ficaria ambíguo para quem lê a tela).
                <LimitedModeNotice
                  reason={source.limited_reason ?? ''}
                  discardedCount={source.last_discarded_by_type}
                />
              )}
            </div>
            <div className="sources-panel-actions">
              {ACTION_LABELS.map((label, index) => (
                <Button
                  key={label}
                  variant="secondary"
                  loading={(index === 1 && resyncPending) || (index === 2 && deletePending)}
                  focused={isFocusedRow && focusedCol === index}
                  onSelect={() => onActivateRow(source.id, index)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )
      })}

      <button
        type="button"
        className={`sources-panel-add${focusedRowId === ADD_SOURCE_ID ? ' tv-focus' : ''}`}
        onClick={() => onActivateRow(ADD_SOURCE_ID, 0)}
      >
        <Icon name="add" />
        <span>Adicionar lista</span>
      </button>
    </div>
  )
}
