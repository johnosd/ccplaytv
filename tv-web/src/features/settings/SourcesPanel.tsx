import { useState } from 'react'
import type { ReactNode } from 'react'
import { useEpgSyncing, useSourceSyncing, type SourceOut } from '../import/importApi'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useCatalogCounts } from '../catalog/catalogApi'
import {
  accountChipOf,
  formatAccount,
  formatCounts,
  formatEpgStatus,
  formatStatus,
  formatType,
} from '../sources/sourceFormat'
import { LimitedModeNotice } from '../sources/LimitedModeNotice'
import { useT } from '../../lib/i18n/I18nProvider'

/** Sentinela do "Adicionar lista" (nunca um id real, `logic/foco-configuracoes.md` §3). */
export const ADD_SOURCE_ID = '__add-source__'

/** Linha de estado do EPG (feature 030, FR-015) — componente próprio para poder assinar "sincronizando" por lista. */
export function SourceEpgStatus({ source }: { source: SourceOut }): ReactNode {
  const t = useT()
  const syncing = useEpgSyncing(source.id)
  return <span className="sources-panel-epg">{formatEpgStatus(source, syncing, t)}</span>
}

/**
 * Contagem conhecida da lista (feature 034, FR-017/FR-018): categorias por tipo
 * (Xtream) ou totais de itens (M3U guardada), lida da geração publicada. Sem
 * número enquanto lê; nunca "0" para tipo sem categoria nem para seção que
 * não respondeu. Componente próprio: cada linha lê as suas contagens.
 */
function SourceCounts({ source }: { source: SourceOut }): ReactNode {
  const t = useT()
  const counts = useCatalogCounts(source.id)
  const text = counts.data ? formatCounts(counts.data, source.unavailable_sections, t) : undefined
  if (!text) return null
  return <span className="sources-panel-counts">{text}</span>
}

/** Estado de sincronização da lista — componente próprio para assinar "Sincronizando" por lista (feature 034, FR-015). */
function SourceSyncStatus({ source }: { source: SourceOut }): ReactNode {
  const t = useT()
  const syncing = useSourceSyncing(source.id)
  return <span className="sources-panel-status">{formatStatus(source, { syncing }, t)}</span>
}

/**
 * Conta Xtream da lista (feature 034, FR-005): "Conta válida até…", "Sem data
 * de vencimento" ou o texto de vencida/recusada, mais o chip quando há algo a
 * agir. Só fonte Xtream; nunca endereço, usuário ou senha (FR-019).
 */
function SourceAccountStatus({ source }: { source: SourceOut }): ReactNode {
  // Uma leitura do relógio por montagem (a linha remonta ao abrir Configurações).
  const t = useT()
  const [now] = useState(() => Date.now())
  const text = formatAccount(source, now, t)
  const chip = accountChipOf(source, now, t)
  if (text === undefined && !chip) return null
  return (
    <>
      {text !== undefined && <span className="sources-panel-account">{text}</span>}
      {chip && <span className={`sources-panel-chip sources-panel-chip--${chip.tone}`}>{chip.label}</span>}
    </>
  )
}

/**
 * Informações de leitura de uma lista (feature 026/030/034): nome, tipo, "Lista ativa", sincronização, conta, contagens,
 * EPG e Modo limitado. Compartilhado pela linha de Fontes IPTV e pela aba Conta & lista de Configurações da lista
 * (feature 067), que mostra o EPG na própria aba (`showEpg={false}`). Nunca DNS, URL, usuário ou senha (FR-024 da 026).
 */
export function SourceInfo({ source, active, showEpg = true }: { source: SourceOut; active: boolean; showEpg?: boolean }): ReactNode {
  const t = useT()
  return (
    <div className="sources-panel-info">
      <span className="sources-panel-name">{source.display_name}</span>
      <span className="sources-panel-type">{formatType(source, t)}</span>
      {active && <span className="sources-panel-badge">{t('settings.sources.active')}</span>}
      <SourceSyncStatus source={source} />
      <SourceAccountStatus source={source} />
      <SourceCounts source={source} />
      {showEpg && <SourceEpgStatus source={source} />}
      {source.provider_import_mode === 'legacy_m3u' && (
        // O próprio título de `LimitedModeNotice` já diz "Modo limitado" — não
        // duplicar como badge separado (ficaria ambíguo para quem lê a tela).
        <LimitedModeNotice reason={source.limited_reason ?? ''} discardedCount={source.last_discarded_by_type} />
      )}
    </div>
  )
}

export interface SourcesPanelProps {
  sources: SourceOut[]
  activeSourceId: string | null
  /** `undefined` = nenhuma linha focada agora (zona `tabs`) — nada ganha `.tv-focus`. */
  focusedRowId?: string
  /** "Configurar" de uma lista, ou "Adicionar lista" (`ADD_SOURCE_ID`). */
  onActivateRow: (rowId: string) => void
}

/**
 * Fontes IPTV de Configurações (feature 026, US2): desde a feature 067 só a relação das listas — as informações de cada
 * uma e um único "Configurar", que abre Configurações da lista — mais "Adicionar lista" (FR-013).
 * Nunca renderiza `provider_dns`, URL, usuário ou senha (FR-024) — nem em
 * `aria-label`, `title` ou texto oculto.
 */
export function SourcesPanel({
  sources,
  activeSourceId,
  focusedRowId,
  onActivateRow,
}: SourcesPanelProps): ReactNode {
  const t = useT()
  return (
    <div className="sources-panel">
      {sources.map((source) => {
        const isFocusedRow = focusedRowId === source.id
        return (
          <div key={source.id} role="group" aria-label={t('settings.sources.group', { name: source.display_name })} className="sources-panel-row">
            <SourceInfo source={source} active={source.id === activeSourceId} />
            <div className="sources-panel-actions">
              <Button variant="secondary" focused={isFocusedRow} onSelect={() => onActivateRow(source.id)}>
                {t('listSettings.configure')}
              </Button>
            </div>
          </div>
        )
      })}

      <button
        type="button"
        className={`sources-panel-add no-scale${focusedRowId === ADD_SOURCE_ID ? ' tv-focus' : ''}`}
        onClick={() => onActivateRow(ADD_SOURCE_ID)}
      >
        <Icon name="add" />
        <span>{t('settings.sources.add')}</span>
      </button>
    </div>
  )
}
